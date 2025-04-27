'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getAuth, signOut } from 'firebase/auth';
import { getFirestore, collection, addDoc, query, where, onSnapshot, doc, updateDoc, getDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
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
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/components/auth-provider';
import { auth as firebaseAuth, db as firebaseDb, storage as firebaseStorage } from '@/lib/firebase';
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
  const auth = firebaseAuth();
  const db = firebaseDb();
  const storage = firebaseStorage();

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
      }
    }, (error) => {
      console.error("Error fetching recordings:", error);
      toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch recordings.' });
      setIsLoadingRecordings(false);
    });

     // Fetch user template
    const fetchTemplate = async () => {
      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        setUserTemplate(userDocSnap.data().template || '');
      }
    };
    fetchTemplate();


    return () => unsubscribe();
  }, [user, db, toast, selectedRecording]); // Add selectedRecording to dependency array

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
      const recorder = new MediaRecorder(stream);
      setMediaRecorder(recorder);

      recorder.ondataavailable = (event) => {
        setAudioChunks((prev) => [...prev, event.data]);
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' }); // Adjust mime type if needed
        setAudioChunks([]);
        await uploadAudio(audioBlob, `recording-${Date.now()}.webm`);
        stream.getTracks().forEach(track => track.stop()); // Stop the media stream
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
    if (mediaRecorder) {
      mediaRecorder.stop();
      setIsRecording(false);
      toast({ title: 'Recording Stopped', description: 'Uploading recording...' });
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && user) {
      uploadAudio(file, file.name);
    }
  };

  const uploadAudio = async (audioBlob: Blob, fileName: string) => {
    if (!user) return;
    setIsProcessing(true);
    setProcessingStatus('Uploading audio...');
    setProgress(10); // Start progress

    const storageRef = ref(storage, `users/${user.uid}/audio/${fileName}`);
    try {
      await uploadBytes(storageRef, audioBlob);
      const downloadURL = await getDownloadURL(storageRef);

      setProgress(30); // Update progress
      setProcessingStatus('Saving recording metadata...');

      // Add recording metadata to Firestore
      const recordingsRef = collection(db, 'users', user.uid, 'recordings');
      const newRecordingDoc = await addDoc(recordingsRef, {
        userId: user.uid,
        name: fileName,
        audioUrl: downloadURL,
        createdAt: new Date(),
        status: 'new',
      });

       setProgress(50);
       setProcessingStatus('Starting transcription...');
       toast({ title: 'Upload Complete', description: 'Starting transcription process.' });

      // Trigger transcription (This part would ideally be a Cloud Function trigger)
      // For now, we simulate the flow on the client
       await processRecording(newRecordingDoc.id, downloadURL);


    } catch (error) {
      console.error('Error uploading file:', error);
      toast({ variant: 'destructive', title: 'Upload Failed', description: 'Could not upload audio file.' });
      setIsProcessing(false);
      setProgress(0);
    }
  };

  const processRecording = async (recordingId: string, audioUrl: string) => {
     if (!user) return;
     setIsProcessing(true);
     const recordingDocRef = doc(db, 'users', user.uid, 'recordings', recordingId);

     try {
         // 1. Update status to transcribing
         setProcessingStatus('Transcribing audio...');
         await updateDoc(recordingDocRef, { status: 'transcribing' });
         setProgress(60);

         // 2. Fetch audio data (simulate getting blob from URL - requires handling CORS or server-side fetch)
         // For client-side demo, we'll assume we have the blob/dataURI already if needed by the function.
         // In a real app, the backend function would handle fetching from the URL.
         // We'll use a placeholder data URI for the client-side call.
         const response = await fetch(audioUrl);
         const blob = await response.blob();
         const reader = new FileReader();
         reader.readAsDataURL(blob);
         reader.onloadend = async () => {
           const base64data = reader.result as string;

             // 3. Call transcription flow
             const transcriptionResult = await transcribeAudio({ audioDataUri: base64data });
             const transcript = transcriptionResult.text;

             setProgress(80);
             setProcessingStatus('Transcription complete. Summarizing...');

             // 4. Update Firestore with transcript and status
             await updateDoc(recordingDocRef, { transcript: transcript, status: 'summarizing' });
             setEditedTranscript(transcript); // Update edited transcript state

             // 5. Check for template
              if (!userTemplate) {
                await updateDoc(recordingDocRef, { status: 'completed', summary: 'No template provided for summarization.' });
                toast({ title: 'Processing Complete', description: 'Transcription finished. No template found for summarization.' });
                setIsProcessing(false);
                setProgress(100);
                setTimeout(() => setProgress(0), 1000); // Reset progress after a delay
                return;
              }

             // 6. Call summarization flow
             const summaryResult = await summarizeTranscriptWithTemplate({ transcript: transcript, template: userTemplate });
             const summary = summaryResult.summary;

             // 7. Update Firestore with summary and final status
             await updateDoc(recordingDocRef, { summary: summary, status: 'completed' });

             setProgress(100);
             setProcessingStatus('Processing complete!');
             toast({ title: 'Processing Complete', description: 'Transcription and summarization finished.' });

             // Refresh selected recording if it was the one processed
             if (selectedRecording?.id === recordingId) {
                const updatedDocSnap = await getDoc(recordingDocRef);
                 if (updatedDocSnap.exists()) {
                    setSelectedRecording({
                       id: updatedDocSnap.id,
                       ...updatedDocSnap.data(),
                       createdAt: updatedDocSnap.data()?.createdAt?.toDate ? updatedDocSnap.data()?.createdAt.toDate() : new Date(),
                    } as Recording);
                 }
             }

             setIsProcessing(false);
             setTimeout(() => setProgress(0), 1000); // Reset progress after a delay
         };
          reader.onerror = async (error) => {
                console.error("Error reading blob:", error);
                throw new Error("Failed to read audio data.");
          };


     } catch (error: any) {
         console.error('Error processing recording:', error);
         await updateDoc(recordingDocRef, { status: 'error', summary: `Error: ${error.message}` });
         toast({ variant: 'destructive', title: 'Processing Failed', description: `Could not process recording: ${error.message}` });
         setIsProcessing(false);
         setProgress(0);
         setProcessingStatus(`Error: ${error.message}`);
     }
  };

  const handleSelectRecording = (recording: Recording) => {
    setSelectedRecording(recording);
    setIsEditingTranscript(false); // Reset editing state when changing recordings
    setEditedTranscript(recording.transcript || '');
  };

  const handleSaveTranscript = async () => {
     if (!selectedRecording || !user) return;
     const recordingDocRef = doc(db, 'users', user.uid, 'recordings', selectedRecording.id);
      try {
        await updateDoc(recordingDocRef, { transcript: editedTranscript });
        setSelectedRecording(prev => prev ? { ...prev, transcript: editedTranscript } : null);
        setIsEditingTranscript(false);
        toast({ title: 'Transcript Saved', description: 'Your changes have been saved.' });

        // Re-summarize if needed after editing
        if (selectedRecording.status === 'completed' && userTemplate) {
            setIsProcessing(true);
            setProgress(50);
            setProcessingStatus('Re-summarizing with updated transcript...');
            await updateDoc(recordingDocRef, { status: 'summarizing' }); // Update status for UI feedback

             try {
                const summaryResult = await summarizeTranscriptWithTemplate({ transcript: editedTranscript, template: userTemplate });
                const summary = summaryResult.summary;
                await updateDoc(recordingDocRef, { summary: summary, status: 'completed' });

                setSelectedRecording(prev => prev ? { ...prev, summary: summary, status: 'completed' } : null); // Update local state

                setProgress(100);
                setProcessingStatus('Re-summarization complete!');
                toast({ title: 'Summary Updated', description: 'Summary regenerated based on edited transcript.' });
                 setIsProcessing(false);
                 setTimeout(() => setProgress(0), 1000);
            } catch (error: any) {
                 console.error('Error re-summarizing:', error);
                 await updateDoc(recordingDocRef, { status: 'error', summary: `Error re-summarizing: ${error.message}` });
                 toast({ variant: 'destructive', title: 'Re-summarization Failed', description: `Could not regenerate summary: ${error.message}` });
                 setIsProcessing(false);
                 setProgress(0);
                 setProcessingStatus(`Error re-summarizing: ${error.message}`);
            }

        }

      } catch (error) {
        console.error('Error saving transcript:', error);
        toast({ variant: 'destructive', title: 'Save Failed', description: 'Could not save transcript changes.' });
      }
  }

  const handleDownload = (type: 'transcript' | 'summary') => {
    if (!selectedRecording) return;

    const content = type === 'transcript' ? selectedRecording.transcript : selectedRecording.summary;
    if (!content) {
      toast({ variant: 'destructive', title: 'Download Error', description: `${type} is not available.` });
      return;
    }

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${selectedRecording.name.split('.')[0]}_${type}.txt`; // Simple txt download for now
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    toast({ title: 'Download Started', description: `${type} is downloading.` });
  };


  return (
    <SidebarProvider defaultOpen>
      <Sidebar>
        <SidebarHeader>
          <div className="flex items-center gap-2 p-2">
             <FileText className="h-6 w-6 text-primary" />
             <h1 className="text-xl font-semibold">Smart Scribe</h1>
          </div>

        </SidebarHeader>
        <SidebarContent className="p-0">
            <SidebarGroup className="p-2">
                 <Button
                    className="w-full justify-start mb-2 bg-accent hover:bg-accent/90 text-accent-foreground"
                    onClick={isRecording ? stopRecording : startRecording}
                  >
                    <Mic className={`mr-2 h-4 w-4 ${isRecording ? 'animate-pulse text-red-500' : ''}`} />
                    {isRecording ? 'Stop Recording' : 'Start Recording'}
                  </Button>
                  <Button variant="outline" className="w-full justify-start" onClick={() => document.getElementById('fileInput')?.click()}>
                    <Upload className="mr-2 h-4 w-4" /> Upload Audio
                  </Button>
                   <Input id="fileInput" type="file" accept="audio/*" className="hidden" onChange={handleFileUpload} />
             </SidebarGroup>

           <SidebarGroup className="p-2">
            <h2 className="px-2 text-xs font-medium text-muted-foreground mb-1">Recordings</h2>
            <SidebarMenu>
              {isLoadingRecordings ? (
                <div className="p-2"><LoadingSpinner /></div>
              ) : recordings.length === 0 ? (
                <p className="px-2 text-sm text-muted-foreground">No recordings yet.</p>
              ) : (
                recordings.map((rec) => (
                  <SidebarMenuItem key={rec.id}>
                    <SidebarMenuButton
                       isActive={selectedRecording?.id === rec.id}
                       onClick={() => handleSelectRecording(rec)}
                    >
                      <FileText />
                      <span>{rec.name}</span>
                       {/* Status Indicator */}
                      <span className="ml-auto text-xs text-muted-foreground">
                          {rec.status === 'transcribing' && <Loader2 className="h-3 w-3 animate-spin" />}
                          {rec.status === 'summarizing' && <Loader2 className="h-3 w-3 animate-spin" />}
                          {rec.status === 'completed' && <span className="text-green-500">✓</span>}
                           {rec.status === 'error' && <span className="text-red-500">!</span>}
                      </span>
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
                        <SidebarMenuButton onClick={() => router.push('/settings')}> {/* Link to future settings page */}
                            <Settings />
                            <span>Settings</span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                        <SidebarMenuButton onClick={handleLogout}>
                            <LogOut />
                            <span>Logout</span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                 </SidebarMenu>
                 <p className="mt-4 px-2 text-xs text-muted-foreground">Logged in as {user?.email}</p>
            </SidebarGroup>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-semibold">Dashboard</h1>
            <SidebarTrigger className="md:hidden" />
        </div>

        {isProcessing && (
           <Card className="mb-6 bg-secondary">
             <CardHeader>
               <CardTitle className="flex items-center gap-2 text-base">
                  <Loader2 className="h-4 w-4 animate-spin" /> Processing Recording...
                </CardTitle>
               <CardDescription>{processingStatus}</CardDescription>
             </CardHeader>
             <CardContent>
               <Progress value={progress} className="w-full" />
             </CardContent>
           </Card>
         )}


        {selectedRecording ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="shadow-md">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                    <CardTitle>Transcript</CardTitle>
                    <CardDescription>{selectedRecording.name}</CardDescription>
                </div>
                 {selectedRecording.transcript && !isEditingTranscript && (
                     <Button variant="ghost" size="icon" onClick={() => setIsEditingTranscript(true)}>
                         <Edit3 className="h-4 w-4"/>
                         <span className="sr-only">Edit Transcript</span>
                     </Button>
                 )}
                 {isEditingTranscript && (
                      <div className="flex gap-2">
                          <Button size="sm" onClick={handleSaveTranscript}>Save</Button>
                           <Button variant="outline" size="sm" onClick={() => {
                               setIsEditingTranscript(false);
                               setEditedTranscript(selectedRecording.transcript || ''); // Reset changes
                           }}>Cancel</Button>
                      </div>
                  )}
              </CardHeader>
              <CardContent>
                {selectedRecording.status === 'transcribing' || selectedRecording.status === 'new' ? (
                   <div className="flex items-center justify-center h-40 text-muted-foreground">
                       <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Waiting for transcription...
                    </div>
                ) : selectedRecording.status === 'error' && !selectedRecording.transcript ? (
                   <p className="text-red-600">Transcription failed. {selectedRecording.summary}</p>
                ) : isEditingTranscript ? (
                   <Textarea
                     value={editedTranscript}
                     onChange={(e) => setEditedTranscript(e.target.value)}
                     className="min-h-[200px] lg:min-h-[400px] text-sm"
                     placeholder="Edit transcript..."
                   />
                ) : (
                  <Textarea
                    readOnly
                    value={selectedRecording.transcript || 'No transcript available.'}
                    className="min-h-[200px] lg:min-h-[400px] text-sm bg-muted/30"
                  />
                )}
                 {selectedRecording.transcript && !isEditingTranscript && (
                    <Button variant="outline" size="sm" className="mt-4" onClick={() => handleDownload('transcript')}>
                      <Download className="mr-2 h-4 w-4" /> Download Transcript
                    </Button>
                 )}
              </CardContent>
            </Card>

            <Card className="shadow-md">
              <CardHeader>
                <CardTitle>Summary</CardTitle>
                 <CardDescription>Formatted based on your template</CardDescription>
              </CardHeader>
              <CardContent>
                {selectedRecording.status === 'summarizing' ? (
                    <div className="flex items-center justify-center h-40 text-muted-foreground">
                       <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Generating summary...
                    </div>
                 ) : selectedRecording.status === 'error' ? (
                      <p className="text-red-600">Summarization failed. {selectedRecording.summary}</p>
                 ) : !selectedRecording.summary && selectedRecording.status === 'completed' && !userTemplate ? (
                    <p className="text-muted-foreground italic">No summary generated. Please upload a template in Settings.</p>
                 ) : (
                   <Textarea
                     readOnly
                     value={selectedRecording.summary || 'Summary not generated yet or failed.'}
                     className="min-h-[200px] lg:min-h-[400px] text-sm bg-muted/30"
                   />
                 )}

                 {selectedRecording.summary && selectedRecording.status !== 'error' && (
                   <Button variant="default" size="sm" className="mt-4 bg-accent hover:bg-accent/90 text-accent-foreground" onClick={() => handleDownload('summary')}>
                     <Download className="mr-2 h-4 w-4" /> Download Summary
                   </Button>
                 )}
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card className="text-center py-12 shadow-md">
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
