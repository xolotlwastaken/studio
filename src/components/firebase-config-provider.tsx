'use client';

import type React from 'react';
import { initializeAppIfNeeded } from '@/lib/firebase'; // Fix: Import initializeAppIfNeeded instead of initializeApp
import { useEffect, useState } from 'react';

export function FirebaseConfigProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!initialized) {
      initializeAppIfNeeded(); // Fix: Call initializeAppIfNeeded
      setInitialized(true);
    }
  }, [initialized]);

  if (!initialized) {
    // Optionally return a loading state or null
    return null;
  }

  return <>{children}</>;
}
