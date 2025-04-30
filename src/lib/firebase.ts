// src/lib/firebase.ts
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, enableIndexedDbPersistence, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { getAuth, Auth } from 'firebase/auth';

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

let app: FirebaseApp | null = null;

if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);
export const storage: FirebaseStorage = getStorage(app);

// Enable persistence if in the browser
if (typeof window !== 'undefined') {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
      console.error("Multiple tabs open, persistence can only be enabled in one tab at a a time.")
    } else if (err.code == 'unimplemented') {
      console.error("The current browser does not support all of the features required to enable persistence.")
    }
  });
}

export const initializeFirebaseApp = () => {
  // No need to initialize here anymore since it's done at the top level
}
