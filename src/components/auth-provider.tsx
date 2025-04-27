'use client';

import type React from 'react';
import type { User } from 'firebase/auth';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
} from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase'; // Use the getter function
import LoadingSpinner from '@/components/loading-spinner';

interface AuthContextType {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // Get auth instance once using the getter
  const auth = useMemo(() => getFirebaseAuth(), []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    }, (error) => {
      // Handle potential errors during auth state listening
      console.error("Auth state change error:", error);
      setLoading(false); // Ensure loading state is updated even on error
    });
    return () => unsubscribe();
  }, [auth]); // Dependency on the memoized auth instance

  const value = useMemo(() => ({ user, loading }), [user, loading]);

  return (
    <AuthContext.Provider value={value}>
      {loading ? <LoadingSpinner /> : children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  return useContext(AuthContext);
};
