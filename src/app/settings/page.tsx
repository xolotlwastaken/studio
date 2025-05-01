'use client';

import { defaultSummaryTemplate } from '@/lib/templates'; 
import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getFirestore, doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/components/auth-provider'; // Import useAuth hook
import { db } from '@/lib/firebase'; // Import db directly
import { ArrowLeft, Save, Upload, Loader2 } from 'lucide-react'; // Import Loader2
import mammoth from 'mammoth'; // Import mammoth
import LoadingSpinner from '@/components/loading-spinner';
import { marked } from 'marked'; // Import marked

export default function SettingsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [assemblyAiApiKey, setAssemblyAiApiKey] = useState('');
  const [templateContent, setTemplateContent] = useState(defaultSummaryTemplate);
  const [isLoading, setIsLoading] = useState(true);
  const templateInputRef = useRef<HTMLInputElement>(null); // Create a ref for the file input
   const [isSaving, setIsSaving] = useState(false);
   const [isUploading, setIsUploading] = useState(false); // New loading state for upload

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }

    const fetchSettings = async () => {
      setIsLoading(true);
      const userDocRef = doc(db, 'users', user.uid);
      try {
        const docSnap = await getDoc(userDocRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setOpenaiApiKey(data.openaiApiKey || '');
          setAssemblyAiApiKey(data.assemblyAiApiKey || '');
          const savedTemplate = data.template || defaultSummaryTemplate;
          const htmlTemplate = marked.parse(savedTemplate);
          setTemplateContent(htmlTemplate);
        }
      } catch (error) {
        console.error("Error fetching user settings:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Could not load settings.' });
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();
  }, [user, authLoading, router, db, toast]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSaving(true);

    const userDocRef = doc(db, 'users', user.uid);
    try {
      // Use setDoc with merge: true to create or update the document
      await setDoc(userDocRef, {
        assemblyAiApiKey: assemblyAiApiKey,
        openaiApiKey: openaiApiKey, // In a real app, encrypt this or handle server-side
        template: templateContent,
      }, { merge: true });

      toast({ title: 'Settings Saved', description: 'Your settings have been updated.' });
    } catch (error) {
      console.error("Error saving settings:", error);
      toast({ variant: 'destructive', title: 'Save Failed', description: 'Could not save settings.' });
    } finally {
      setIsSaving(false);
    }
  };

    const handleTemplateUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setIsUploading(true); // Start loading
            const reader = new FileReader();
            reader.onload = async (e) => {
                const arrayBuffer = e.target?.result as ArrayBuffer; // Read as ArrayBuffer for mammoth
                if (arrayBuffer) {
                    try {
                        const result = await mammoth.convertToHtml({ arrayBuffer });
                        console.log(result.value);
                        setTemplateContent(result.value); // Set the converted HTML content
                        toast({ title: 'Template Loaded', description: 'Template content loaded. Remember to save.' });
                    } catch (error) {
                        console.error('Error converting document:', error);
                        toast({ variant: 'destructive', title: 'Error', description: 'Could not convert document.' });
                    } finally {
                         setIsUploading(false);
                        if (templateInputRef.current) templateInputRef.current.value = '';
                    }

                } else {
                     setIsUploading(false);
                }
            };
            reader.onerror = () => {
                toast({ variant: 'destructive', title: 'Error', description: 'Failed to read template file.' });
                setIsUploading(false);
            };
            reader.readAsArrayBuffer(file); // Read file as ArrayBuffer
        }
    };
    const handleUseDefaultTemplate = async () => {
        const htmlTemplate = marked.parse(defaultSummaryTemplate);
        setTemplateContent(htmlTemplate);
        if (templateInputRef.current) {
            templateInputRef.current.value = ''; // Clear the file input value
        }
    };








  if (authLoading || isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
       <header className="sticky top-0 z-10 flex h-[57px] items-center gap-1 border-b bg-background px-4">
           <Button variant="outline" size="icon" className="shrink-0" onClick={() => router.back()}>
               <ArrowLeft className="h-5 w-5" />
               <span className="sr-only">Back</span>
           </Button>
           <h1 className="flex-1 text-xl font-semibold ml-2">Settings</h1>
       </header>
       <main className="flex-1 p-4 md:p-6">
            <Card className="w-full max-w-2xl mx-auto shadow-md">
             <CardHeader>
               <CardTitle>User Settings</CardTitle>
               <CardDescription>Manage your API keys and document templates.</CardDescription>
             </CardHeader>
             <CardContent>
               <form onSubmit={handleSaveSettings} className="space-y-6">
                 <div className="space-y-2">
                   <Label htmlFor="openai-api-key">OpenAI API Key</Label>
                   <Input
                     id="openai-api-key"
                     type="password" // Use password type to obscure the key
                     placeholder="Enter your OpenAI API Key"
                     value={openaiApiKey}
                     onChange={(e) => setOpenaiApiKey(e.target.value)}
                     className="focus:ring-accent"
                   />
                   <p className="text-xs text-muted-foreground">
                     Your API key is used for summarization. It's stored securely (or should be in a real app!).
                   </p>
                 </div>
                 <div className="space-y-2">
                   <Label htmlFor="assemblyai-api-key">AssemblyAI API Key</Label>
                   <Input
                     id="assemblyai-api-key"
                     type="password"
                     placeholder="Enter your AssemblyAI API Key"
                     value={assemblyAiApiKey}
                     onChange={(e) => setAssemblyAiApiKey(e.target.value)}
                     className="focus:ring-accent"
                   />
                   <p className="text-xs text-muted-foreground">
                     Your AssemblyAI API Key is used for transcribing and summarizing audio recordings.
                   </p>
                 </div>

                 <div className="space-y-2">
                   <div className="flex justify-between items-center">
                        <Label htmlFor="template-content">Document Template</Label>
                        <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById('templateInput')?.click()}>
                            <Upload className="mr-2 h-4 w-4" /> Upload Template
                        </Button>
                         <Input id="templateInput" type="file" accept=".txt,.docx,.json,.md" className="hidden" onChange={handleTemplateUpload} ref={templateInputRef} />
                   </div>                   
                    {/* Replace Textarea with a div that renders HTML */}
                    <div
                        id="template-content"
                        className="w-full min-h-[200px] max-h-[600px] overflow-y-auto border rounded-md p-2 prose max-w-full"
                        contentEditable={true} // Allow editing directly in the div if needed
                        dangerouslySetInnerHTML={{ __html: templateContent }}
                        onBlur={(e) => setTemplateContent(e.currentTarget.innerHTML)} // Update state on blur if editable
                    ></div>
                   <div className="flex justify-end items-center mt-2">                    
                        <Button type="button" variant="outline" size="sm" onClick={handleUseDefaultTemplate}>Use Default Template</Button>
                   </div>
                   <p className="text-xs text-muted-foreground">
                     Provide an example document structure. The AI will use this to format the summary. You can paste content or upload a TXT/DOCX/JSON file.
                   </p>
                   {/* Display loading message if uploading */}
                   {isUploading && 
                    <p className="text-xs text-muted-foreground">
                        Uploading and processing document...
                    </p>
                    }
                 </div>

                 <Button type="submit" className="w-full bg-accent hover:bg-accent/90 text-accent-foreground" disabled={isSaving}>
                    {isSaving ? (
                        <> <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving... </>
                    ) : (
                         <> <Save className="mr-2 h-4 w-4" /> Save Settings </>
                    )}
                 </Button>
               </form>
             </CardContent>
           </Card>
       </main>
    </div>
  );
}
