import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions';
import { onObjectFinalized } from "firebase-functions/v2/storage";
import { transcribeAudio } from './ai/flows/transcribe-audio'; // Assuming the path
import { summarizeTranscript } from './ai/flows/summarize-transcript'; // Assuming the path


admin.initializeApp();









// Start writing functions
// https://firebase.google.com/docs/functions/typescript

// export const helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

export const processUploadedAudio = onObjectFinalized(async (event) => {
  const file = event.data;
  if (!file) {
    logger.error("No file object found");
    return;
  }
  logger.info(`File uploaded: ${file.name}, size: ${file.size}, mediaLink: ${file.mediaLink}`);

  const bucket = admin.storage().bucket(file.bucket);
  const fileRef = bucket.file(file.name);
  const downloadURL = await fileRef.getSignedUrl({
    action: 'read',
    expires: '03-09-2491', // Set an expiration date far in the future
  });

  // Get the user ID and recording ID from the file path
  const pathParts = file.name.split("/");
  if (pathParts.length < 4 || pathParts[0] !== 'users' || pathParts[2] !== 'recordings') {
    logger.error(`Invalid file path format: ${file.name}`);
    return;
  }
  const userId = pathParts[1];
  const recordingId = pathParts[3];

  try {
    // 1. Transcribe the audio
    logger.info(`Starting transcription for file: ${file.name}`);
    // Assuming transcribeAudio takes the download URL and returns a string transcript
    const transcript = await transcribeAudio(downloadURL[0]);
    logger.info(`Transcription complete for file: ${file.name}`);

    // 2. Summarize the transcript
    logger.info(`Starting summarization for file: ${file.name}`);
    // Assuming summarizeTranscript takes the transcript string and returns a string summary
    const summary = await summarizeTranscript(transcript);
    logger.info(`Summarization complete for file: ${file.name}`);

    // 3. Update the recording document in Firestore with the transcript and summary
    const recordingDocRef = admin.firestore().collection('users').doc(userId).collection('recordings').doc(recordingId);
    await recordingDocRef.update({
      transcript: transcript,
      summary: summary,
      status: 'processed', // Update status to processed
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    logger.info(`Recording document ${recordingId} updated for file: ${file.name}`);

  } catch (error) {
    logger.error(`Error processing file ${file.name}:`, error);
    // Update the recording document status to indicate an error
    const recordingDocRef = admin.firestore().collection('users').doc(userId).collection('recordings').doc(recordingId);
    await recordingDocRef.update({
      status: 'error',
      errorMessage: error.message,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
});
