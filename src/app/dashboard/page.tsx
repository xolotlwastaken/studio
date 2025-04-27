const handleAudioUpload = async (file: File) => {
    if (!navigator.onLine) {
      toast({
        variant: 'destructive',
        title: 'Offline',
        description: 'You are offline, please try again when you are online',
      });
      return;
    }
    // ... rest of your audio upload code ...
}