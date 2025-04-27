// SummarizeTranscriptWithTemplate
'use server';

/**
 * @fileOverview Summarizes a transcript using a document template for custom formatting.
 *
 * - summarizeTranscriptWithTemplate - A function that handles the summarization process.
 * - SummarizeTranscriptWithTemplateInput - The input type for the summarizeTranscriptWithTemplate function.
 * - SummarizeTranscriptWithTemplateOutput - The return type for the summarizeTranscriptWithTemplate function.
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';

const SummarizeTranscriptWithTemplateInputSchema = z.object({
  transcript: z
    .string()
    .describe('The transcript of the audio recording.'),
  template: z
    .string()
    .describe(
      'A document template (e.g. DOCX, TXT, or JSON example) to use for formatting the summary.'
    ),
});
export type SummarizeTranscriptWithTemplateInput = z.infer<
  typeof SummarizeTranscriptWithTemplateInputSchema
>;

const SummarizeTranscriptWithTemplateOutputSchema = z.object({
  summary: z.string().describe('The formatted summary of the transcript.'),
});
export type SummarizeTranscriptWithTemplateOutput = z.infer<
  typeof SummarizeTranscriptWithTemplateOutputSchema
>;

export async function summarizeTranscriptWithTemplate(
  input: SummarizeTranscriptWithTemplateInput
): Promise<SummarizeTranscriptWithTemplateOutput> {
  return summarizeTranscriptWithTemplateFlow(input);
}

const prompt = ai.definePrompt({
  name: 'summarizeTranscriptWithTemplatePrompt',
  input: {
    schema: z.object({
      transcript: z
        .string()
        .describe('The transcript of the audio recording.'),
      template: z
        .string()
        .describe(
          'A document template (e.g. DOCX, TXT, or JSON example) to use for formatting the summary.'
        ),
    }),
  },
  output: {
    schema: z.object({
      summary: z.string().describe('The formatted summary of the transcript.'),
    }),
  },
  prompt: `You are an AI expert in summarizing transcripts, and you will format it using the template.

  Transcript: {{{transcript}}}

  Template: {{{template}}}

  Please provide a summary of the transcript, formatted according to the template. Adhere to any formatting,
  style, or structural elements present in the template. The summary should be comprehensive yet concise.
  `,
});

const summarizeTranscriptWithTemplateFlow = ai.defineFlow<
  typeof SummarizeTranscriptWithTemplateInputSchema,
  typeof SummarizeTranscriptWithTemplateOutputSchema
>({
  name: 'summarizeTranscriptWithTemplateFlow',
  inputSchema: SummarizeTranscriptWithTemplateInputSchema,
  outputSchema: SummarizeTranscriptWithTemplateOutputSchema,
},
async input => {
  const {output} = await prompt(input);
  return output!;
});
