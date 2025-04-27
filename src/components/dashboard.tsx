'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { collection, addDoc, query, where, onSnapshot, doc, updateDoc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
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
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/components/auth-provider';
import { getFirebaseAuth, getFirebaseDb, getFirebaseStorage } from '@/lib/firebase'; // Use getter functions
import { transcribeAudio } from '@/ai/flows/transcribe-audio';
import { summarizeTranscriptWithTemplate } from '@/ai/flows/summarize-transcript';
import { Upload, Mic, Download, FileText, Settings, LogOut, Loader2, Edit3 } from 'lucide-react';
import LoadingSpinner from './loading-spinner';

interface Recording {
  id: string;
  name: string;
  audioUrl: string;
  transcript?: string;
  summary?: string;
  createdAt: Date;
  status: 'new' | 'transcribing' | 'summarizing' | 'completed' | 'error';
}

export default function Dashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const auth = getFirebaseAuth(); // Use getter
  const db = getFirebaseDb(); // Use getter
  const storage = getFirebaseStorage(); // Use getter

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
  const [isEditingTranscript, setIsEditingTranscript] = useState(false);
  const [editedTranscript, setEditedTranscript] = useState('');


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
         if (event.data.size > 0) { // Ensure blob is not empty
             setAudioChunks((prev) => [...prev, event.data]);
         }
      };

      recorder.onstop = async () => {
        const mimeType = recorder.mimeType || 'audio/webm'; // Get actual mimeType used
        console.log("Recording stopped, MimeType:", mimeType, "Chunks:", audioChunks.length);
        if (audioChunks.length === 0) {
            console.warn("No audio chunks recorded.");
            toast({ variant: 'destructive', title: 'Recording Error', description: 'No audio data was captured.' });
            stream.getTracks().forEach(track => track.stop()); // Stop stream tracks
            setIsRecording(false); // Ensure state is reset
            return;
        }
        const audioBlob = new Blob(audioChunks, { type: mimeType });
        setAudioChunks([]); // Clear chunks immediately
        // Determine file extension based on mime type
        const fileExtension = mimeType.split('/')[1].split(';')[0] || 'webm';
        await uploadAudio(audioBlob, `recording-${Date.now()}.${fileExtension}`);
        stream.getTracks().forEach(track => track.stop()); // Stop the media stream tracks
      };

       recorder.onerror = (event: Event) => {
           console.error("MediaRecorder error:", event);
           toast({ variant: 'destructive', title: 'Recording Error', description: 'An error occurred during recording.' });
           setIsRecording(false);
           setAudioChunks([]);
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

  const stopRecording = () => {
    if (mediaRecorder && isRecording) { // Add isRecording check
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
    if (!user) return;
    if (audioBlob.size === 0) {
         toast({ variant: 'destructive', title: 'Upload Error', description: 'Cannot upload empty file.' });
         return;
    }

    setIsProcessing(true);
    setProcessingStatus('Uploading audio...');
    setProgress(10);

    const storageRef = ref(storage, `users/${user.uid}/audio/${fileName}`);
    try {
        const uploadTask = await uploadBytes(storageRef, audioBlob);
        const downloadURL = await getDownloadURL(uploadTask.ref);

        setProgress(30);
        setProcessingStatus('Saving recording metadata...');

        const recordingsRef = collection(db, 'users', user.uid, 'recordings');
        const newRecordingDoc = await addDoc(recordingsRef, {
            userId: user.uid,
            name: fileName,
            audioUrl: downloadURL,
            createdAt: new Date(),
            status: 'new', // Initial status
        });

        setProgress(50);
        setProcessingStatus('Starting transcription...');
        toast({ title: 'Upload Complete', description: `"${fileName}" uploaded. Starting processing.` });

        // Select the new recording immediately
         const newRecData = {
              id: newRecordingDoc.id,
              userId: user.uid,
              name: fileName,
              audioUrl: downloadURL,
              createdAt: new Date(),
              status: 'new',
            } as Recording;
         // Update local state optimistically (or fetch again, but this is faster)
          setRecordings(prev => [newRecData, ...prev].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
          setSelectedRecording(newRecData);
          setIsEditingTranscript(false); // Ensure editing is off
          setEditedTranscript(''); // Clear any previous edits

        // Trigger the processing flow
        await processRecording(newRecordingDoc.id, downloadURL, fileName);

    } catch (error) {
        console.error('Error uploading or processing file:', error);
        toast({ variant: 'destructive', title: 'Upload Failed', description: `Could not upload or process ${fileName}.` });
        setIsProcessing(false);
        setProgress(0);
        setProcessingStatus(''); // Clear status
    }
  };

 const processRecording = async (recordingId: string, audioUrl: string, fileName: string) => {
     if (!user) return;

     // Ensure processing state is active (might be set by uploadAudio)
     if (!isProcessing) setIsProcessing(true);
     setProgress(55); // Starting point for processing steps

     const recordingDocRef = doc(db, 'users', user.uid, 'recordings', recordingId);

     try {
         // 1. Update status to transcribing
         setProcessingStatus(`Transcribing "${fileName}"...`);
         await updateDoc(recordingDocRef, { status: 'transcribing' });
         setProgress(60);

         // 2. Fetch audio data and convert to data URI
         const response = await fetch(audioUrl);
          if (!response.ok) {
             throw new Error(`Failed to fetch audio: ${response.statusText}`);
          }
         const blob = await response.blob();
         const base64data = await new Promise<string>((resolve, reject) => {
             const reader = new FileReader();
             reader.readAsDataURL(blob);
             reader.onloadend = () => resolve(reader.result as string);
             reader.onerror = (error) => reject(new Error(`Failed to read audio blob: ${error}`));
         });

         // 3. Call transcription flow
         const transcriptionResult = await transcribeAudio({ audioDataUri: base64data });
         const transcript = transcriptionResult.text;

         setProgress(80);
         setProcessingStatus(`Transcription complete. Summarizing "${fileName}"...`);


         // 4. Update Firestore with transcript and status -> summarizing
         await updateDoc(recordingDocRef, { transcript: transcript, status: 'summarizing' });
          // Update local state if this is the selected recording
         if (selectedRecording?.id === recordingId) {
            setSelectedRecording(prev => prev ? { ...prev, transcript: transcript, status: 'summarizing' } : null);
            setEditedTranscript(transcript); // Update editor state as well
         }


         // 5. Check for template existence before proceeding
         // Re-fetch template in case it changed
         const userDocRef = doc(db, 'users', user.uid);
         const userDocSnap = await getDoc(userDocRef);
         const currentTemplate = userDocSnap.exists() ? userDocSnap.data().template || '' : '';
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
         console.error(`Error processing recording ${recordingId} ("${fileName}"):`, error);
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
         setProcessingStatus(errorMessage); // Show error status
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


  return (
    <SidebarProvider defaultOpen>
      <Sidebar collapsible='icon'>
        <SidebarHeader>
          <div className="flex items-center gap-2 p-2">
             <FileText className="h-6 w-6 text-primary" />
             <h1 className="text-xl font-semibold flex-1 overflow-hidden whitespace-nowrap group-data-[collapsible=icon]:hidden">Smart Scribe</h1>
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
                  <SidebarMenuItem key={rec.id}>
                    <SidebarMenuButton
                       isActive={selectedRecording?.id === rec.id}
                       onClick={() => handleSelectRecording(rec)}
                       tooltip={{ children: rec.name, side: 'right', align: 'center' }}
                       disabled={isProcessing} // Disable selecting other recordings while one is processing
                    >
                       {/* Icon based on status or default */}
                        {rec.status === 'transcribing' && <Loader2 className="h-4 w-4 animate-spin" />}
                        {rec.status === 'summarizing' && <Loader2 className="h-4 w-4 animate-spin" />}
                        {rec.status === 'completed' && <FileText className="text-green-500" />}
                        {rec.status === 'error' && <FileText className="text-red-500" />}
                        {rec.status === 'new' && <FileText />}

                      <span className="group-data-[collapsible=icon]:hidden flex-1 truncate">{rec.name}</span>
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
                    <CardDescription className="truncate">{selectedRecording.name}</CardDescription>
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
                           <Download className="mr-2 h-4 w-4" /> Download Transcript
                       </Button>
                   )}
               </CardContent>
            </Card>

             {/* Summary Card */}
             <Card className="shadow-md flex flex-col">
              <CardHeader className="flex-shrink-0">
                <CardTitle>Summary</CardTitle>
                 <CardDescription>Formatted based on your template</CardDescription>
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
                      <Textarea
                          readOnly
                          value={selectedRecording.summary || 'Summary not available.'}
                          className="flex-1 resize-none text-sm bg-muted/30" // Use flex-1
                      />
                  )}
                  {selectedRecording.summary && selectedRecording.status !== 'error' && (
                      <Button variant="default" size="sm" className="mt-4 flex-shrink-0 bg-accent hover:bg-accent/90 text-accent-foreground" onClick={() => handleDownload('summary')}>
                          <Download className="mr-2 h-4 w-4" /> Download Summary
                      </Button>
                  )}
               </CardContent>
             </Card>
           </div>
        ) : (
           <Card className="text-center py-12 shadow-md flex-1 flex flex-col items-center justify-center">
            <CardHeader>
                <CardTitle>Welcome to Smart Scribe!</CardTitle>
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
