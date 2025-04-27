'use server';
/**
 * @fileOverview A flow for transcribing audio to text.
 *
 * - transcribeAudioFlow - A function that handles the audio transcription process.
 * - TranscribeAudioInput - The input type for the transcribeAudioFlow function.
 * - TranscribeAudioOutput - The return type for the transcribeAudioFlow function.
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';
import {transcribeAudio as transcribeAudioService} from '@/services/speech-to-text';

const TranscribeAudioInputSchema = z.object({
  audioDataUri: z
    .string()
    .describe(
      "Audio data as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type TranscribeAudioInput = z.infer<typeof TranscribeAudioInputSchema>;

const TranscribeAudioOutputSchema = z.object({
  text: z.string().describe('The transcribed text.'),
});
export type TranscribeAudioOutput = z.infer<typeof TranscribeAudioOutputSchema>;

export async function transcribeAudio(input: TranscribeAudioInput): Promise<TranscribeAudioOutput> {
  return transcribeAudioFlow(input);
}

const transcribeAudioFlow = ai.defineFlow<
  typeof TranscribeAudioInputSchema,
  typeof TranscribeAudioOutputSchema
>(
  {
    name: 'transcribeAudioFlow',
    inputSchema: TranscribeAudioInputSchema,
    outputSchema: TranscribeAudioOutputSchema,
  },
  async input => {
    // Remove the mime type and base64 encoding prefix from the data URI.
    const audioData = Buffer.from(input.audioDataUri.split(',')[1], 'base64');

    const transcriptionResult = await transcribeAudioService(audioData);
    return {
      text: transcriptionResult.text,
    };
  }
);
