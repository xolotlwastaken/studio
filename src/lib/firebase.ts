// src/lib/firebase.ts
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth } from 'firebase/auth';

// Log environment variables during build/server start (won't show in browser console directly)
// console.log("Firebase Config Loading:");
// console.log("API Key Loaded:", !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY);
// console.log("Auth Domain Loaded:", !!process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN);
// console.log("Project ID Loaded:", !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
// console.log("Storage Bucket Loaded:", !!process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
// console.log("Messaging Sender ID Loaded:", !!process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID);
// console.log("App ID Loaded:", !!process.env.NEXT_PUBLIC_FIREBASE_APP_ID);


const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp;

export const initializeAppIfNeeded = () => {
    // Client-side check for missing config
    if (typeof window !== 'undefined') {
      if (!firebaseConfig.apiKey) {
        console.error("Firebase Error: NEXT_PUBLIC_FIREBASE_API_KEY is missing. Check your .env file.");
      }
       if (!firebaseConfig.authDomain) {
        console.error("Firebase Error: NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN is missing. Check your .env file.");
      }
       if (!firebaseConfig.projectId) {
        console.error("Firebase Error: NEXT_PUBLIC_FIREBASE_PROJECT_ID is missing. Check your .env file.");
      }
      // Add checks for other necessary keys if needed
    }


  if (!getApps().length) {
    try {
        app = initializeApp(firebaseConfig);
    } catch (error: any) {
        console.error("Firebase initialization error:", error);
         // Provide more specific feedback if possible
        if (error.code === 'auth/invalid-api-key' || error.message?.includes('api-key')) {
             console.error("Detailed Error: The provided Firebase API Key (NEXT_PUBLIC_FIREBASE_API_KEY) is invalid. Please check its value in your .env file and ensure it matches the key from your Firebase project settings.");
        }
        throw error; // Re-throw the error to potentially be caught higher up
    }

  } else {
    app = getApp();
  }
  return app;
};

// Initialize Firebase on module load for client-side usage
if (typeof window !== 'undefined') {
  initializeAppIfNeeded();
}


// Export Firebase services for use in components
// Use functions to ensure initialization happens before accessing services
export const getFirebaseAuth = () => getAuth(initializeAppIfNeeded());
export const getFirebaseDb = () => getFirestore(initializeAppIfNeeded());
export const getFirebaseStorage = () => getStorage(initializeAppIfNeeded());


// Re-export initialized app instance if needed, though service functions are safer
export { app };

// Legacy exports (maintain for compatibility if components directly use these)
export const auth = getFirebaseAuth;
export const db = getFirebaseDb;
export const storage = getFirebaseStorage;
