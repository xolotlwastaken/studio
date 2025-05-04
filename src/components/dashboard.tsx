'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';;
import { signOut } from 'firebase/auth';
import { collection, addDoc, query, where, onSnapshot, doc, updateDoc, getDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject, StorageReference } from 'firebase/storage';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton
  ,SidebarRail
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast'; // Updated import path
import { useAuth } from '@/components/auth-provider';
import { auth, db, storage } from '@/lib/firebase'; // Use getter functions
import { transcribeAudio } from '@/ai/flows/transcribe-audio';
import { summarizeTranscriptWithTemplate } from '@/ai/flows/summarize-transcript';
import { Upload, Mic, Download, FileText, Settings, LogOut, Loader2, Edit3, Trash2 } from 'lucide-react';
import LoadingSpinner from './loading-spinner';

interface Recording {
  id: string;
  name: string;
  audioUrl: string;
  transcript?: string;
  summary?: string;
  createdAt: Date;
  status: 'processing-pending' | 'transcribing' | 'summarizing' | 'completed' | 'error';
};

export default function Dashboard() {
  const [isDeleting, setIsDeleting] = useState(false);
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [selectedRecording, setSelectedRecording] = useState<Recording | null>(null);
  const [userTemplate, setUserTemplate] = useState<string>('');
  const [isLoadingRecordings, setIsLoadingRecordings] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [editedRecordingNames, setEditedRecordingNames] = useState<{ [id: string]: string }>({});
  const [editedTranscript, setEditedTranscript] = useState('');
  const [isEditingTranscript, setIsEditingTranscript] = useState(false);


  useEffect(() => {
    if (!user) return;

    const recordingsRef = collection(db, 'users', user.uid, 'recordings');
    const q = query(recordingsRef, where('userId', '==', user.uid));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fetchedRecordings: Recording[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        fetchedRecordings.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(), // Handle Timestamp conversion
        } as Recording);
      });
      fetchedRecordings.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const newEditedRecordingNames = fetchedRecordings.reduce((acc, rec) => {
        acc[rec.id] = rec.name;
        return acc;
      }, {} as { [id: string]: string });
      setRecordings(fetchedRecordings);
      setIsLoadingRecordings(false);
      // Auto-select the latest recording if none is selected
      if (!selectedRecording && fetchedRecordings.length > 0) {
        setSelectedRecording(fetchedRecordings[0]);
        if (fetchedRecordings[0].transcript) {
             setEditedTranscript(fetchedRecordings[0].transcript);
        }
      } else if (selectedRecording && !fetchedRecordings.some(rec => rec.id === selectedRecording.id)) {
        // If the currently selected recording was deleted, select the new latest one
        setSelectedRecording(fetchedRecordings[0] || null);
         setEditedTranscript(fetchedRecordings[0]?.transcript || '');
      } else if (selectedRecording) {
        // If the selected recording still exists, update its data in state
         const updatedSelected = fetchedRecordings.find(rec => rec.id === selectedRecording.id);
         if (updatedSelected) {
           setSelectedRecording(updatedSelected);
            // Only update edited transcript if not currently editing
           if (!isEditingTranscript) {
              setEditedTranscript(updatedSelected.transcript || '');
           }
         } else {
            // Fallback if selected is somehow gone but wasn't caught above
            setSelectedRecording(fetchedRecordings[0] || null);
            setEditedTranscript(fetchedRecordings[0]?.transcript || '');
         }
      }
      setEditedRecordingNames(newEditedRecordingNames);


    }, (error) => {
      console.error("Error fetching recordings:", error);
      toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch recordings.' });
      setIsLoadingRecordings(false);
    });

     // Fetch user template
    const fetchTemplate = async () => {
       try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
            setUserTemplate(userDocSnap.data().template || '');
        }
       } catch (error) {
           console.error("Error fetching user template:", error);
           // Optionally notify user
       }

    };
    fetchTemplate();


    return () => unsubscribe();
   // Update dependencies: remove selectedRecording if updates cause issues, add isEditingTranscript
  }, [user, db, toast, isEditingTranscript]);


  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/login');
      toast({ title: 'Logged Out', description: 'You have been successfully logged out.' });
    } catch (error) {
      console.error('Logout error:', error);
      toast({ variant: 'destructive', title: 'Logout Failed', description: 'Could not log out.' });
    }
  };

  const startRecording = async () => {
    setAudioChunks([]);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Use a common MIME type, browsers might vary support. audio/webm is widely supported.
      const options = { mimeType: 'audio/webm;codecs=opus' };
      let recorder: MediaRecorder;
       try {
           recorder = new MediaRecorder(stream, options);
       } catch (e) {
           console.warn("audio/webm;codecs=opus not supported, trying default");
            recorder = new MediaRecorder(stream); // Fallback to default
       }

      setMediaRecorder(recorder);

      recorder.ondataavailable = (event) => {
         console.log("Data available, size:", event.data.size);
         if (event.data.size > 0) { // Ensure blob is not empty
             setAudioChunks((prev) => [...prev, event.data]);
         }
      };

      recorder.onstop = async () => {
          setTimeout(async () => {
              const mimeType = recorder.mimeType || 'audio/webm'; // Get actual mimeType used
              console.log("Recording stopped, MimeType:", mimeType);
              let finalChunks: Blob[] = [];
              setAudioChunks(prevChunks => {
                  finalChunks = [...prevChunks]; // Capture current chunks
                  return []; // Clear chunks immediately
              });

              console.log("Recording stopped, Chunks:", finalChunks.length);
              if (finalChunks.length === 0) {
                  console.warn("No audio chunks recorded.");
                  toast({
                      variant: 'destructive',
                      title: 'Recording Error',
                      description: 'No audio data was captured.'
                  });
                  stream.getTracks().forEach(track => track.stop()); // Stop stream tracks
                  setIsRecording(false); // Ensure state is reset
                  return;
              }
              const audioBlob = new Blob(finalChunks, {type: mimeType});
              // Determine file extension based on mime type
              const fileExtension = mimeType.split('/')[1].split(';')[0] || 'webm';
              await uploadAudio(audioBlob, `recording-${Date.now()}.${fileExtension}`);
              stream.getTracks().forEach(track => track.stop()); // Stop the media stream tracks
          }, 50);


      };

       recorder.onerror = (event: Event) => {
           console.error("MediaRecorder error:", event);
           toast({ variant: 'destructive', title: 'Recording Error', description: 'An error occurred during recording.' });
           setIsRecording(false);
           
           stream.getTracks().forEach(track => track.stop());
       };


      recorder.start();
      setIsRecording(true);
      toast({ title: 'Recording Started', description: 'Click the mic again to stop.' });
    } catch (err) {
      console.error('Error accessing microphone:', err);
      toast({ variant: 'destructive', title: 'Error', description: 'Could not access microphone. Please check permissions.' });
    }
  };

  const stopRecording = () => {if (mediaRecorder && isRecording) { // Add isRecording check
      mediaRecorder.stop();
      setIsRecording(false);
      // Toast moved to onstop handler after upload starts/completes
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && user) {
        // Reset input value to allow uploading the same file again
       event.target.value = '';
       if (!file.type.startsWith('audio/')) {
            toast({ variant: 'destructive', title: 'Invalid File Type', description: 'Please upload an audio file.' });
            return;
       }
      uploadAudio(file, file.name);
    }
  };

  const uploadAudio = async (audioBlob: Blob, fileName: string) => {
     console.log("uploadAudio called");

    if (!user) return;
    if (audioBlob.size === 0) {
         toast({ variant: 'destructive', title: 'Upload Error', description: 'Cannot upload empty file.' });
         setIsProcessing(false);
         return;
    }

    setIsProcessing(true);
    setProcessingStatus('Uploading audio...');
    setProgress(10);

    const uniqueString = Math.random().toString(36).substring(2, 15);
    const storageFileName = `${Date.now()}-${uniqueString}.${fileName.split('.').pop()}`;
    const storageRef = ref(storage, `users/${user.uid}/audio/${storageFileName}`);
    let storageRefUpload: StorageReference | undefined;
  
    try {
        const uploadTask = await uploadBytes(storageRef, audioBlob);
        const recordingsRef = collection(db, 'users', user.uid, 'recordings');

        const newRecordingRef = await addDoc(recordingsRef, {
            userId: user.uid,
            name: fileName,
            createdAt: serverTimestamp(),
            status: 'uploading', // Initial status
            audioFileName: storageFileName,
        });
        setEditedRecordingNames(prev => ({ ...prev, [newRecordingRef.id]: fileName }));
        const recordingId = newRecordingRef.id;
        const storageFileNameRecordings = `${Date.now()}-${uniqueString}.${fileName.split('.').pop()}`;
        storageRefUpload = ref(storage, `users/${user.uid}/recordings/${recordingId}/audio/${storageFileNameRecordings}`);        

         await uploadBytes(storageRef, audioBlob);
         
        const downloadURL = await getDownloadURL(uploadTask.ref);

        await updateDoc(doc(db, `users/${user.uid}/recordings`, recordingId), {
            audioUrl: downloadURL,
            status: 'uploaded', // Update status to uploaded
        });

        setProgress(50);
        setProcessingStatus('Starting transcription...');
        toast({ title: 'Upload Complete', description: `"${fileName}" uploaded. Starting processing.` });

         const newRecData = {
              id: newRecordingRef.id,
              userId: user.uid,
              name: fileName,
              audioUrl: downloadURL,
              createdAt: new Date(),
              status: 'processing-pending',
            } as Recording;
         // Update local state optimistically (or fetch again, but this is faster)
          setRecordings(prev => [newRecData, ...prev].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
          setSelectedRecording(newRecData);
          setIsEditingTranscript(false); // Ensure editing is off
          setAudioChunks([]); // only clear chunks if we made it here
          console.log("Clearing audio chunks in uploadAudio");
          setEditedTranscript(''); // Clear any previous edits

        // Trigger the processing flow
        await processRecording(newRecordingRef.id, downloadURL, fileName, storageRefUpload);

          //setup firestore listener
           const recordingDocRef = doc(db, 'users', user.uid, 'recordings', newRecordingRef.id);

             const unsubscribe = onSnapshot(recordingDocRef, (docSnap) => {
                 if (docSnap.exists()) {
                      const data = docSnap.data() as Recording;
                       // Update the recording in the state
                     setRecordings((prevRecordings) =>
                       prevRecordings.map((rec) =>
                           rec.id === newRecordingRef.id
                             ? { ...rec, ...data } // Spread the new data over the existing
                             : rec
                         )
                       );

                     //update the selected recording if it exists
                      if (selectedRecording?.id === newRecordingRef.id) {
                         setSelectedRecording((prev) => ({
                          ...prev!,
                           ...data,
                         }));
                        // Optionally update editedTranscript if not currently editing
                         if (!isEditingTranscript) {
                           setEditedTranscript(data.transcript || '');
                         }
                      }
                     //update UI with status.
                     if(data.status === 'upload-complete' || data.status === 'error'){
                         setIsProcessing(false);
                         setProgress(0);
                         setProcessingStatus(data.status === 'error' ? `Error processing "${fileName}": ${data.summary || 'Unknown error'}` : ''); // Show error status
                      }
                       }
                 }, (error) => {
                        console.error("Error listening to recording document:", error);
                        // Handle the error, e.g., show a toast or update UI
                });
    } catch (error) {
        console.error('Error uploading or processing file:', error);
        toast({ variant: 'destructive', title: 'Upload Failed', description: `Could not upload or process ${fileName}.` });
        setIsProcessing(false);
        setProgress(0);
        setProcessingStatus(''); // Clear status
    }
  };

 const processRecording = async (recordingId: string, audioUrl: string, fileName: string, storageRefUpload?: StorageReference) => {
    console.log('processRecording called for recording:', recordingId, 'with audioUrl:', audioUrl);
     if (!user) return;

     // Ensure processing state is active (might be set by uploadAudio)
     if (!isProcessing) setIsProcessing(true);
     setProgress(55); // Starting point for processing steps

     const recordingDocRef = doc(db, 'users', user.uid, 'recordings', recordingId);

     try {
          // Fetch recording data to get audioFileName
          const recordingSnap = await getDoc(recordingDocRef);
          if (!recordingSnap.exists()) throw new Error('Recording document not found');
          const recordingData = recordingSnap.data() as Recording;
          const { audioFileName } = recordingData;

          // 1. Update status to transcribing
          console.log("AudioFileName:", audioFileName);
            console.log("user.uid:", user.uid);
          setProcessingStatus(`Transcribing "${fileName}"...`);
          await updateDoc(recordingDocRef, { status: 'transcribing' });
          setProgress(60);
         
        // 2. Fetch audio data and convert to data URI
         console.log("AudioFileName:", audioFileName);
         console.log("user.uid:", user.uid);
         const audioFileRef = ref(storage, `users/${user.uid}/audio/${audioFileName}`);
         const audio_url = await getDownloadURL(audioFileRef);

         // 3. Check for template existence before proceeding
         let currentTemplate = '';
        // 3. Call transcription flow
          let transcript = '';
           try {
               const transcriptionResult = await transcribeAudio({ audioFileName: audio_url, userId: user.uid });
                transcript = transcriptionResult.text;
                setProgress(80);
                setProcessingStatus(`Transcription complete. Summarizing "${fileName}"...`);

                // 4. Update Firestore with transcript and status -> summarizing
                await updateDoc(recordingDocRef, { transcript: transcript, status: 'summarizing' });
                // Update local state if this is the selected recording
                 if (selectedRecording?.id === recordingId) {
                    setSelectedRecording(prev => prev ? { ...prev, transcript: transcript, status: 'summarizing' } : null);
                    setEditedTranscript(transcript); // Update editor state as well
                 }

                 // 4. Check for template existence before proceeding
                 // Re-fetch template in case it changed
                 const userDocRef = doc(db, 'users', user.uid);
                 const userDocSnap = await getDoc(userDocRef);
                 currentTemplate = userDocSnap.exists() ? userDocSnap.data().template || '' : '';
                 setUserTemplate(currentTemplate); // Update state


                 if (!currentTemplate) {
                    await updateDoc(recordingDocRef, { status: 'completed', summary: 'No template provided for summarization.' });
                     if (selectedRecording?.id === recordingId) {
                         setSelectedRecording(prev => prev ? { ...prev, status: 'completed', summary: 'No template provided for summarization.' } : null);
                     }
                    toast({ title: 'Processing Complete', description: `Transcription finished for "${fileName}". No template found for summarization.` });
                    setIsProcessing(false);
                    setProgress(100);
                    setTimeout(() => { setProgress(0); setProcessingStatus(''); }, 1500);
                    return; // Stop processing here
                 }
             } catch (transcriptionError: any) {
              console.error('Transcription failed catch block entered', transcriptionError);
                const errorMessage = `Transcription Failed for "${fileName}": ${transcriptionError.message}`;
                // Update recording status to error in Firestore
                console.log('Attempting to update status to error for document:', recordingId);
                const recordingDocRef = doc(db, 'users', user.uid, 'recordings', recordingId);

               try {
                   await updateDoc(recordingDocRef, { status: 'error', summary: errorMessage });
                   console.log('Firestore document updated with status: error');
                   // Update recording status to error in the list instead of removing
                    setRecordings((prevRecordings) =>
                        prevRecordings.map((rec) =>
                            rec.id === recordingId
                                ? {
                                    ...rec,
                                    status: 'error', // Update status to error
                                }
                                : rec
                        )
                    );
                    // Update selected recording if it's the failed one
                    if (selectedRecording?.id === recordingId) {
                        setSelectedRecording((prev) => (prev ? { ...prev, status: 'error', summary: errorMessage } : null));
                         setEditedTranscript('');
                    }
                } catch (updateError) {
                   console.error('Error updating document to error:', updateError);
                }
                 finally {
                        setProcessingStatus('');
                        setProgress(0);
                        console.log("after state updates in catch block: ", { selectedRecording, recordings, processingStatus, progress });
                         setProcessingStatus(errorMessage);
                }



              return; // Stop processing here
           }

         // 6. Call summarization flow
         const summaryResult = await summarizeTranscriptWithTemplate({ transcript: transcript, template: currentTemplate });
         const summary = summaryResult.summary;

         // 7. Update Firestore with summary and final status
         await updateDoc(recordingDocRef, { summary: summary, status: 'completed' });

         // Update local state if this is the selected recording
          if (selectedRecording?.id === recordingId) {
             setSelectedRecording(prev => prev ? { ...prev, summary: summary, status: 'completed' } : null);
          }


         setProgress(100);
         setProcessingStatus(`Processing complete for "${fileName}"!`);
         toast({ title: 'Processing Complete', description: `Transcription and summarization finished for "${fileName}".` });

         setIsProcessing(false);
         setTimeout(() => { setProgress(0); setProcessingStatus(''); }, 1500); // Reset progress and status after a delay

     } catch (error: any) {
         const errorMessage = `Error processing "${fileName}": ${error.message || 'Unknown error'}`;
         try {
            await updateDoc(recordingDocRef, { status: 'error', summary: errorMessage });
            // Update local state if this is the selected recording
            if (selectedRecording?.id === recordingId) {
                setSelectedRecording(prev => prev ? { ...prev, status: 'error', summary: errorMessage } : null);
            }
         } catch (updateError) {
              console.error("Failed to update recording status to error:", updateError);
         }
         toast({ variant: 'destructive', title: 'Processing Failed', description: errorMessage });
         setIsProcessing(false);
         setProgress(0);
         setProcessingStatus(''); // Show error status
     }
     finally {
      setIsProcessing(false);
    }
  };

  const handleSelectRecording = (recording: Recording) => {
    if (selectedRecording?.id === recording.id) return; // Avoid re-selecting the same one
    setSelectedRecording(recording);
    setIsEditingTranscript(false); // Reset editing state when changing recordings
    setEditedTranscript(recording.transcript || '');
  };

  const handleSaveTranscript = async () => {
     if (!selectedRecording || !user || !isEditingTranscript) return; // Add isEditing check
     const recordingDocRef = doc(db, 'users', user.uid, 'recordings', selectedRecording.id);
      setIsProcessing(true); // Indicate saving/processing
      setProcessingStatus('Saving transcript...');
      setProgress(10);
      try {
        await updateDoc(recordingDocRef, { transcript: editedTranscript });
        const savedTranscript = editedTranscript; // Capture current edited value
        setSelectedRecording(prev => prev ? { ...prev, transcript: savedTranscript } : null);
        setIsEditingTranscript(false); // Turn off editing mode
        toast({ title: 'Transcript Saved', description: 'Your changes have been saved.' });
        setProgress(40);

        // Re-summarize ONLY if status was completed and a template exists
         const requiresResummary = selectedRecording.status === 'completed' || selectedRecording.status === 'error'; // Also resummarize if it was error previously
        if (requiresResummary && userTemplate) {
            setProcessingStatus('Re-summarizing with updated transcript...');
            setProgress(50);
            await updateDoc(recordingDocRef, { status: 'summarizing' }); // Update status for UI feedback
             setSelectedRecording(prev => prev ? { ...prev, status: 'summarizing' } : null); // Update local status

             try {
                const summaryResult = await summarizeTranscriptWithTemplate({ transcript: savedTranscript, template: userTemplate });
                const summary = summaryResult.summary;
                await updateDoc(recordingDocRef, { summary: summary, status: 'completed' });

                setSelectedRecording(prev => prev ? { ...prev, summary: summary, status: 'completed' } : null); // Update local state

                setProgress(100);
                setProcessingStatus('Re-summarization complete!');
                toast({ title: 'Summary Updated', description: 'Summary regenerated based on edited transcript.' });
                 setIsProcessing(false);
                 setTimeout(() => {setProgress(0); setProcessingStatus('')}, 1500);
            } catch (error: any) {
                 console.error('Error re-summarizing:', error);
                 const resummaryErrorMsg = `Error re-summarizing: ${error.message || 'Unknown error'}`;
                 await updateDoc(recordingDocRef, { status: 'error', summary: resummaryErrorMsg });
                 setSelectedRecording(prev => prev ? { ...prev, status: 'error', summary: resummaryErrorMsg } : null); // Update local state
                 toast({ variant: 'destructive', title: 'Re-summarization Failed', description: resummaryErrorMsg });
                 setIsProcessing(false);
                 setProgress(0);
                 setProcessingStatus(resummaryErrorMsg);
            }

        } else {
             // If no re-summarization needed, just finish the saving process
             setIsProcessing(false);
             setProgress(0); // Reset progress if only saving transcript
             setProcessingStatus('');
        }

      } catch (error) {
        console.error('Error saving transcript:', error);
        toast({ variant: 'destructive', title: 'Save Failed', description: 'Could not save transcript changes.' });
         setIsProcessing(false); // Ensure processing state is reset on error
         setProgress(0);
         setProcessingStatus('Save failed');
      }
  }

    const handleRegenerateSummary = async () => {
        if (!selectedRecording || !userTemplate) return;

        const recordingDocRef = doc(db, 'users', user.uid, 'recordings', selectedRecording.id);

        setIsProcessing(true);
        setProcessingStatus('Re-generating summary...');
        setProgress(10);

        try {
            // Update recording status in Firestore and local state
            await updateDoc(recordingDocRef, { status: 'summarizing' });
            setSelectedRecording(prev => prev ? { ...prev, status: 'summarizing' } : null);
            setProgress(40);

            // Perform summarization
            const summaryResult = await summarizeTranscriptWithTemplate({
                transcript: selectedRecording.transcript || '',
                template: userTemplate,
            });
            setProgress(80);
            const newSummary = summaryResult.summary;

            // Update Firestore and local state with new summary and 'completed' status
            await updateDoc(recordingDocRef, { summary: newSummary, status: 'completed' });
            setSelectedRecording(prev => prev ? { ...prev, summary: newSummary, status: 'completed' } : null);

            setProgress(100);
            setProcessingStatus('Summary re-generated!');
            toast({
                title: 'Summary Re-generated',
                description: 'The summary has been successfully re-generated.'
            });
        } catch (error: any) {
            console.error('Error re-generating summary:', error);
            const errorMsg = `Failed to re-generate summary: ${error.message || 'Unknown error'}`;

            try {
                // Update Firestore and local state with 'error' status and error message
                await updateDoc(recordingDocRef, { status: 'error', summary: errorMsg });
                setSelectedRecording(prev => prev ? { ...prev, status: 'error', summary: errorMsg } : null);

                toast({
                    variant: 'destructive',
                    title: 'Summary Regeneration Failed',
                    description: errorMsg,
                });
            } catch (updateError) {
                console.error("Failed to update recording status to error:", updateError);

                  toast({
                    variant: 'destructive',
                    title: 'Summary Regeneration Failed',
                    description: errorMsg + " Failed to update error in firestore",
                });
            }

            setProcessingStatus(errorMsg); // Update processing status to show error
        } finally {
            setIsProcessing(false);
            setProgress(0);
        }
    };

  const handleDownload = (type: 'transcript' | 'summary') => {
    if (!selectedRecording) return;

    const content = type === 'transcript' ? selectedRecording.transcript : selectedRecording.summary;
    if (!content) {
      toast({ variant: 'destructive', title: 'Download Error', description: `${type.charAt(0).toUpperCase() + type.slice(1)} is not available or empty.` });
      return;
    }

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const safeFileName = selectedRecording.name.replace(/[^a-z0-9.]/gi, '_').toLowerCase(); // Sanitize filename
    link.download = `${safeFileName.split('.')[0]}_${type}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    toast({ title: 'Download Started', description: `${type.charAt(0).toUpperCase() + type.slice(1)} is downloading.` });
  };

  const handleDownloadAsDocx = async (type: 'transcript' | 'summary') => {
    if (!selectedRecording) return;
  
    const content = type === 'transcript' ? selectedRecording.transcript : selectedRecording.summary;
    if (!content) {
      toast({
        variant: 'destructive',
        title: 'Download Error',
        description: `${type.charAt(0).toUpperCase() + type.slice(1)} is not available or empty.`,
      });
      return;
    }
  
    try {
      const response = await fetch('https://us-central1-scribet-f1901.cloudfunctions.net/generateDocx', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ html: content }),
      });
  
      if (!response.ok) {
        throw new Error('Failed to generate DOCX');
      }
  
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
  
      const safeFileName = selectedRecording.name.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
      link.href = url;
      link.download = `${safeFileName.split('.')[0]}_${type}.docx`;
  
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
  
      toast({
        title: 'Download Started',
        description: `${type.charAt(0).toUpperCase() + type.slice(1)} is downloading as .docx.`,
      });
    } catch (error) {
      console.error(error);
      toast({
        variant: 'destructive',
        title: 'Download Failed',
        description: 'Could not generate or download the .docx file.',
      });
    }
  };
  

  const handleDeleteRecording = async (recordingId: string, audioUrl: string) => {
       if (!user) return;
       const confirmed = confirm('Are you sure you want to delete this recording?');
       if (!confirmed) return;
        setIsDeleting(true);
        console.log('Attempting to delete storage object with URL:', audioUrl);
       try {
           // Delete from storage
            const recordingDocRef = doc(db, 'users', user.uid, 'recordings', recordingId);
            const recordingSnap = await getDoc(recordingDocRef);
            if (recordingSnap.exists()) {
                const recordingData = recordingSnap.data() as Recording;
               const { audioFileName } = recordingData;
                const storageRef = ref(storage, `users/${user.uid}/audio/${audioFileName}`);
                 await deleteObject(storageRef);
                 // Delete from firestore
                await deleteDoc(recordingDocRef);
            } else {
                 throw new Error('Recording document not found'); // Handle missing document
            }

           // Update UI
           setRecordings(prev => prev.filter(rec => rec.id !== recordingId));
           if (selectedRecording?.id === recordingId) {
               setSelectedRecording(null);
               setEditedTranscript('');
           }

           toast({ title: 'Recording Deleted', description: 'The recording was successfully deleted.' });
       } catch (error) {
           console.error('Error deleting recording:', error);
           toast({
               variant: 'destructive',
               title: 'Deletion Failed',
               description: 'Could not delete the recording.',
           });
       } finally {
           setIsDeleting(false);
       }
   };

  const handleRecordingNameChange = (recordingId: string, newName: string) => {
    setEditedRecordingNames(prev => ({ ...prev, [recordingId]: newName }));
  };

  const handleSaveRecordingName = async (recording: Recording, event: React.FormEvent) => {
     event.preventDefault();
    if (!user) return;

    const newName = editedRecordingNames[recording.id];
    if (newName === recording.name || !newName) return; // No change or empty name

    const recordingDocRef = doc(db, 'users', user.uid, 'recordings', recording.id);
    try {
      await updateDoc(recordingDocRef, { name: newName });
      setRecordings(prev =>
        prev.map(rec => (rec.id === recording.id ? { ...rec, name: newName } : rec))
      );
      if (selectedRecording?.id === recording.id) {
           setSelectedRecording(prev => prev ? { ...prev, name: newName } : null);
      }
      toast({ title: 'Recording Name Updated', description: `Recording name updated to ${newName}.` });
    } catch (error) {
      console.error('Error updating recording name:', error);
      toast({
        variant: 'destructive',
        title: 'Name Update Failed',
        description: 'Could not update the recording name.',
      });
    }
  };




  return (
    <SidebarProvider defaultOpen>
      <Sidebar collapsible='icon'>
        <SidebarHeader>
          
          <div className="flex items-center gap-2 p-2">
             <FileText className="h-6 w-6 text-primary" />
             <h1 className="text-xl font-semibold flex-1 overflow-hidden whitespace-nowrap group-data-[collapsible=icon]:hidden">Scribet</h1>
             <SidebarTrigger className="ml-auto group-data-[collapsible=icon]:hidden"/>
            

          </div>
        </SidebarHeader>
        <SidebarContent className="p-0">
            <SidebarGroup className="p-2">
                 <Button
                    className="w-full justify-center group-data-[collapsible=icon]:justify-start group-data-[collapsible=icon]:w-auto mb-2 bg-accent hover:bg-accent/90 text-accent-foreground"
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={isProcessing && processingStatus.startsWith('Uploading')} // Disable while uploading
                  >
                    <Mic className={`mr-2 h-4 w-4 group-data-[collapsible=icon]:mr-0 ${isRecording ? 'animate-pulse text-red-500' : ''}`} />
                    <span className="group-data-[collapsible=icon]:hidden">{isRecording ? 'Stop Recording' : 'Start Recording'}</span>
                  </Button>
                  <Button
                      variant="outline"
                      className="w-full justify-center group-data-[collapsible=icon]:justify-start group-data-[collapsible=icon]:w-auto"
                      onClick={() => document.getElementById('fileInput')?.click()}
                      disabled={isProcessing && processingStatus.startsWith('Uploading')} // Disable while uploading
                  >
                    <Upload className="mr-2 h-4 w-4 group-data-[collapsible=icon]:mr-0" />
                     <span className="group-data-[collapsible=icon]:hidden">Upload Audio</span>
                  </Button>
                   <Input id="fileInput" type="file" accept="audio/*" className="hidden" onChange={handleFileUpload} />
             </SidebarGroup>

           <SidebarGroup className="p-2">
            <h2 className="px-2 text-xs font-medium text-muted-foreground mb-1 group-data-[collapsible=icon]:hidden">Recordings</h2>
            <SidebarMenu>
              {isLoadingRecordings ? (
                 <div className="p-2"><LoadingSpinner /></div>
              ) : recordings.length === 0 ? (
                <p className="px-2 text-sm text-muted-foreground group-data-[collapsible=icon]:hidden">No recordings yet.</p>
              ) : (
                recordings.map((rec) => (
                  <SidebarMenuItem key={rec.id} >
                    <SidebarMenuButton
                      isActive={selectedRecording?.id === rec.id}
                      className={`flex flex-row items-center ${
                         selectedRecording?.id === rec.id
                           ? 'bg-accent/30 hover:bg-accent/30 focus-visible:bg-accent/30' // Adjust colors as needed
                           : 'hover:bg-muted/20 focus-visible:bg-muted/20' // Adjust hover color for unselected items
                        }`}
                      
                       
                       onClick={() => handleSelectRecording(rec)}
                       tooltip={{ children: rec.name, side: 'right', align: 'center' }}
                       disabled={isProcessing} // Disable selecting other recordings while one is processing
                    >
                       {/* Icon based on status or default */}
                        {rec.status === 'transcribing' && <Loader2 className="h-4 w-4 animate-spin" />}
                        {rec.status === 'summarizing' && <Loader2 className="h-4 w-4 animate-spin" />}
                        {rec.status === 'completed' && <FileText className="text-green-500" />}
                        {rec.status === 'error' && <FileText className="text-red-500"/>}

                      
                           <form className="group-data-[collapsible=icon]:hidden flex-1 truncate" onSubmit={(e) => handleSaveRecordingName(rec, e)}>
                              <Input
                                className="border-none bg-transparent px-1 py-0 focus-visible:outline-none"
                                type="text"
                                value={
                                  editedRecordingNames[rec.id] === undefined
                                    ? rec.name
                                    : editedRecordingNames[rec.id]
                                }
                                onChange={(e) => handleRecordingNameChange(rec.id, e.target.value)}
                                onBlur={(e) => handleSaveRecordingName(rec, e as any)} // Explicit type assertion
                              />
                           </form>

                      {!isDeleting && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteRecording(rec.id, rec.audioUrl);
                                    }} 
                                    asChild={true}
                                    className="group-data-[collapsible=icon]:hidden hover:bg-transparent"
                                ><Trash2 className="h-4 w-4 text-red-500" /></Button>
                            )}
                       {/* Status Indicator for collapsed view - maybe remove if icon covers it */}
                      {/* <span className="ml-auto text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                          {rec.status === 'transcribing' && <Loader2 className="h-3 w-3 animate-spin" />}
                          {rec.status === 'summarizing' && <Loader2 className="h-3 w-3 animate-spin" />}
                          {rec.status === 'completed' && <span className="text-green-500">✓</span>}
                           {rec.status === 'error' && <span className="text-red-500">!</span>}
                      </span> */}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))
              )}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
            <SidebarGroup className="p-2">
                 <SidebarMenu>
                     <SidebarMenuItem>
                        <SidebarMenuButton onClick={() => router.push('/settings')} tooltip={{ children: 'Settings', side: 'right', align: 'center' }}>
                            <Settings />
                            <span className="group-data-[collapsible=icon]:hidden">Settings</span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                        <SidebarMenuButton onClick={handleLogout} tooltip={{ children: 'Logout', side: 'right', align: 'center' }}>
                            <LogOut />
                            <span className="group-data-[collapsible=icon]:hidden">Logout</span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                 </SidebarMenu>
                 <p className="mt-4 px-2 text-xs text-muted-foreground truncate group-data-[collapsible=icon]:hidden">
                    Logged in as {user?.email}
                 </p>
            </SidebarGroup>
        </SidebarFooter>
         <SidebarRail /> {/* Add rail for resizing */}
      </Sidebar>

       {/* Main content area */}
      <SidebarInset className="p-4 md:p-6 flex flex-col">
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
            <h1 className="text-2xl font-semibold">Dashboard</h1>
            <SidebarTrigger className="md:hidden" />
        </div>

        {isProcessing && (
           <Card className="mb-6 bg-secondary flex-shrink-0">
             <CardHeader className="pb-2">
               <CardTitle className="flex items-center gap-2 text-base">
                  <Loader2 className="h-4 w-4 animate-spin" /> Processing...
                </CardTitle>
               <CardDescription className="truncate">{processingStatus || 'Please wait...'}</CardDescription>
             </CardHeader>
             <CardContent>
               <Progress value={progress} className="w-full h-2" />
             </CardContent>
           </Card>
         )}


        {selectedRecording ? (
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0">
            {/* Transcript Card */}
            <Card className="shadow-md flex flex-col">
              <CardHeader className="flex flex-row items-center justify-between flex-shrink-0">
                <div>
                    <CardTitle>Transcript</CardTitle>
                    <CardDescription className="truncate mt-1">{selectedRecording.name}</CardDescription>
                </div>
                 {selectedRecording.transcript && !isEditingTranscript && (
                     <Button variant="ghost" size="icon" onClick={() => setIsEditingTranscript(true)} disabled={isProcessing}>
                         <Edit3 className="h-4 w-4"/>
                         <span className="sr-only">Edit Transcript</span>
                     </Button>
                 )}
                 {isEditingTranscript && (
                      <div className="flex gap-2">
                          <Button size="sm" onClick={handleSaveTranscript} disabled={isProcessing}>
                              {isProcessing && processingStatus.startsWith('Saving') ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                              Save
                          </Button>
                           <Button variant="outline" size="sm" onClick={() => {
                               setIsEditingTranscript(false);
                               setEditedTranscript(selectedRecording.transcript || ''); // Reset changes
                           }} disabled={isProcessing}>Cancel</Button>
                      </div>
                  )}
              </CardHeader>
               <CardContent className="flex-1 flex flex-col min-h-0">
                 {/* Loading/Error/Content for Transcript */}
                   {selectedRecording.status === 'transcribing' || (selectedRecording.status === 'new' && !selectedRecording.transcript) ? (
                       <div className="flex-1 flex items-center justify-center text-muted-foreground">
                           <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Waiting for transcription...
                         </div>
                   ) : selectedRecording.status === 'error' && !selectedRecording.transcript ? (
                       <div className="flex-1 flex items-center justify-center text-red-600 p-4 text-center">
                           <p>Transcription failed. {selectedRecording.summary}</p>
                       </div>
                   ) : isEditingTranscript ? (
                       <Textarea
                           value={editedTranscript}
                           onChange={(e) => setEditedTranscript(e.target.value)}
                           className="flex-1 resize-none text-sm" // Use flex-1 for height
                           placeholder="Edit transcript..."
                           disabled={isProcessing}
                       />
                    ) : (
                       <Textarea
                           readOnly
                           value={selectedRecording.transcript || 'No transcript available.'}
                            className="flex-1 resize-none text-sm bg-muted/30" // Use flex-1
                       />
                   )}

                   {selectedRecording.transcript && !isEditingTranscript && (
                       <Button variant="outline" size="sm" className="mt-4 flex-shrink-0" onClick={() => handleDownload('transcript')}>
                           <Download className="mr-2 h-4 w-4" /> Download Transcript as Txt
                       </Button>
                   )}
                   {selectedRecording.transcript && !isEditingTranscript && (
                       <Button variant="outline" size="sm" className="mt-4 flex-shrink-0" onClick={() => handleDownloadAsDocx('transcript')}>
                           <Download className="mr-2 h-4 w-4" /> Download Transcript as Docx
                       </Button>
                   )}
               </CardContent>
            </Card>

             {/* Summary Card */}
             <Card className="shadow-md flex flex-col">
              <CardHeader className="flex-shrink-0">
                  <div className="flex flex-row justify-between items-center">
                    <div>
                        <CardTitle>Summary</CardTitle>
                        <CardDescription className="mt-1">Formatted based on your template</CardDescription>
                    </div>
                    {(selectedRecording.status === 'completed' || selectedRecording.status === 'error') && userTemplate && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleRegenerateSummary}
                            disabled={isProcessing}
                        >
                            Regenerate
                        </Button>
                    )}
                  </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col min-h-0">
                 {/* Loading/Error/Content for Summary */}
                  {selectedRecording.status === 'summarizing' || (selectedRecording.status === 'transcribing' && !selectedRecording.summary) ? (
                      <div className="flex-1 flex items-center justify-center text-muted-foreground">
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Generating summary...
                      </div>
                  ) : selectedRecording.status === 'error' ? (
                      <div className="flex-1 flex items-center justify-center text-red-600 p-4 text-center">
                           <p>Processing failed. {selectedRecording.summary}</p>
                      </div>
                  ) : !selectedRecording.summary && selectedRecording.status === 'completed' && !userTemplate ? (
                      <div className="flex-1 flex items-center justify-center text-muted-foreground p-4 text-center italic">
                          No summary generated. Please upload a template in Settings.
                      </div>
                  ) : !selectedRecording.summary && selectedRecording.status === 'completed' && userTemplate ? (
                       <div className="flex-1 flex items-center justify-center text-muted-foreground p-4 text-center italic">
                          Summary generation might be pending or failed silently. Check logs if issue persists.
                      </div>
                  ): (
                    <div
                      className="w-full min-h-[200px] max-h-[600px] overflow-y-auto border rounded-md p-2 prose max-w-full bg-muted/30 flex-1"
                      dangerouslySetInnerHTML={{ __html: selectedRecording.summary || 'Summary not available.' }}
                    />

                  )}
                 {/* Placeholder for Markdown rendering component */}
                    {/*  <ReactMarkdown>
                        {selectedRecording.summary || ''}
                    </ReactMarkdown> */}
                  {selectedRecording.summary && selectedRecording.status !== 'error' && (
                      <Button variant="outline" size="sm" className="mt-4 flex-shrink-0" onClick={() => handleDownload('summary')}>
                          <Download className="mr-2 h-4 w-4" /> Download Summary as Txt
                      </Button>
                  )}
                  {selectedRecording.summary && selectedRecording.status !== 'error' && (
                      <Button variant="outline" size="sm" className="mt-4 flex-shrink-0" onClick={() => handleDownloadAsDocx('summary')}>
                          <Download className="mr-2 h-4 w-4" /> Download Summary as Docx
                      </Button>
                  )}
               </CardContent>
             </Card>
           </div>
        ) : (
           <Card className="text-center py-12 shadow-md flex-1 flex flex-col items-center justify-center">
            <CardHeader>
                <CardTitle>Welcome to Scribet!</CardTitle>
                <CardDescription>Record or upload an audio file to get started.</CardDescription>
            </CardHeader>
            <CardContent>
               <Mic className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
               <p className="text-muted-foreground">Select a recording from the sidebar or create a new one.</p>
            </CardContent>
          </Card>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
