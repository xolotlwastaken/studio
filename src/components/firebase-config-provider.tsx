'use client';

import type React from 'react';
import { initializeFirebaseApp } from '@/lib/firebase'; // Fix: Import initializeFirebaseApp
import { useEffect, useState } from 'react';

export function FirebaseConfigProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!initialized) {
      initializeFirebaseApp(); // Fix: Call initializeFirebaseApp
      setInitialized(true);
    }
  }, [initialized]);

  if (!initialized) {
    // Optionally return a loading state or null
    return null;
  }

  return <>{children}</>;
}
