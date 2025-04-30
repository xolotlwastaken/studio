'use server';
/**
 * @fileOverview A flow for transcribing audio to text.
 *
 * - transcribeAudioFlow - A function that handles the audio transcription process.
 * - TranscribeAudioInput - The input type for the transcribeAudioFlow function.
 * - TranscribeAudioOutput - The return type for the transcribeAudioFlow function.
 */

import { ai } from '@/ai/ai-instance';
import { z } from 'genkit';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import fetch from 'node-fetch';
import { db, storage } from '@/lib/firebase';
import { ref, getDownloadURL } from 'firebase/storage';

const TranscribeAudioInputSchema = z.object({ // updated name
  audioFileName: z
    .string()
    .describe(
      "The downloadable url of the audio file.",
    ),
  userId: z.string().describe('The ID of the user making the transcription request.'),
});
export type TranscribeAudioInput = z.infer<
  typeof TranscribeAudioInputSchema
>;

const TranscribeAudioInputSchemaUpdated = z.object({
  audioFileName: z.string(),
  userId: z.string(),
});
export type TranscribeAudioInputUpdated = z.infer<typeof TranscribeAudioInputSchemaUpdated>;
    
    const TranscribeAudioOutputSchema = z.object({
  text: z.string().describe('The transcribed text.'),
});
export type TranscribeAudioOutput = z.infer<typeof TranscribeAudioOutputSchema>;

export async function transcribeAudio(input: TranscribeAudioInput): Promise<TranscribeAudioOutput> {
  return transcribeAudioFlow(input);

}

const transcribeAudioFlow = ai.defineFlow<
  typeof TranscribeAudioInputSchema,
  typeof TranscribeAudioOutputSchema>(
  {
    name: 'transcribeAudioFlow',
    inputSchema: TranscribeAudioInputSchema,
    outputSchema: TranscribeAudioOutputSchema,
  },
  async ({ audioFileName, userId }) => {
        //Get storage url from database
    // --- Retrieve AssemblyAI API Key ---
    const userDocSnap = await getDoc(doc(db, 'users', userId));    if (!userDocSnap.exists()) {
    }
    const assemblyAiApiKey = userDocSnap.data().assemblyAiApiKey;
    if (!assemblyAiApiKey) {
      throw new Error('AssemblyAI API key is not configured for this user.');
    }

    console.log('AssemblyAI API Key:', assemblyAiApiKey);

    // --- Call AssemblyAI Transcription API ---
    const assemblyAiApiUrl = 'https://api.assemblyai.com/v2/transcript';

        const requestBody = JSON.stringify({
            audio_url: audioFileName,
        });

    const response = await fetch(assemblyAiApiUrl, {
      method: 'POST',
      headers: {
        Authorization: assemblyAiApiKey,
          'Content-Type': 'application/json',

      },
        body: requestBody,
    });
    
    // Read the response body only once and store it
    const responseBody = await response.text();

        console.log('AssemblyAI API Response Status:', response.status);

    // Log the response body
        console.log('AssemblyAI API Response Body:', responseBody);

    if (!response.ok) {
        try {
          const errorData = JSON.parse(responseBody);
            throw new Error(`AssemblyAI API error: ${response.status} - ${JSON.stringify(errorData)}`);
        } catch (e) {
            throw new Error(`AssemblyAI API error: ${response.status} - Could not parse response body as JSON: ${responseBody}`);
        }
    }
        const initialResult = JSON.parse(responseBody);
        const transcriptId = initialResult.id;

    // --- Poll for Transcription Completion ---
    const pollingEndpoint = `https://api.assemblyai.com/v2/transcript/${transcriptId}`;
    let status = initialResult.status;
    while (status !== 'completed' && status !== 'error') {
      await new Promise((resolve) => setTimeout(resolve, 3000)); // Wait for 3 seconds
      const pollingResponse = await fetch(pollingEndpoint, {
        headers: {
          Authorization: assemblyAiApiKey,
        },
      });
      const pollingResult = await pollingResponse.json();
      status = pollingResult.status;
      if (status === 'error') {
        throw new Error(`AssemblyAI transcription error: ${pollingResult.error}`);
      }
    }

    // --- Extract and Return Transcript ---
    const finalResult = await (await fetch(pollingEndpoint, { headers: { Authorization: assemblyAiApiKey } })).json();

    return { text: finalResult.text };
  },
);

