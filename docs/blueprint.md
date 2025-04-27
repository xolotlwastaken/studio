# **App Name**: Smart Scribe

## Core Features:

- Audio Capture: Record audio directly in the browser and upload audio files.
- AI Transcription & Summarization: Transcribe audio to text using a third-party API (e.g., Google Speech-to-Text or Whisper API), and summarize with OpenAI, using a document template to condition the AI tool.
- Dashboard Display: Display the transcript and formatted summary in a clean, user-friendly dashboard.

## Style Guidelines:

- Primary color: Neutral grays for a professional look.
- Secondary color: Soft blues for accents and interactive elements.
- Accent: Teal (#008080) for highlighting key actions.
- Clean and structured layout for easy navigation.
- Simple, consistent icons for common actions (record, upload, summarize, download).
- Subtle animations for loading states and transitions to improve user experience.

## Original User Request:
Create a React web application using Firebase Studio called SmartMeeting Scribe.
The app should allow users to:

Record audio directly in the browser.

Upload audio files as an alternative.

Use Firebase Storage to save the recordings.

Use Firebase Functions to:

Trigger transcription via a third-party API (e.g., Google Speech-to-Text or Whisper API).

Generate a summary using the OpenAI GPT model (user must have an API key).

Apply custom formatting by matching a user-uploaded document template (e.g. DOCX, TXT, or JSON example).

Display the transcript and formatted summary to the user in the dashboard.

Allow export/download of the final summary (PDF or DOCX).

Use Firebase Auth to enable user sign-up and login.

Save user data and history (recordings, transcripts, templates) in Firestore.

Include a simple, clean dashboard UI with TailwindCSS and support for both light and dark mode.

Bonus features:

Allow users to upload their template once and reuse it for all summaries.

Let users edit the generated transcript before summarizing.

Add a progress indicator while transcription and summarization are processing.
  