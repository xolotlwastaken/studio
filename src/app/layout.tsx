'use client';

import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { FirebaseConfigProvider } from '@/components/firebase-config-provider';
import { initializeFirebaseApp } from '@/lib/firebase';
import { AuthProvider } from '@/components/auth-provider';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
     <html lang="en" suppressHydrationWarning>
        <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
          <FirebaseConfigProvider initializeFirebaseApp={initializeFirebaseApp}>
            <AuthProvider>
              {children}
              <Toaster />
            </AuthProvider>
          </FirebaseConfigProvider>
        </body>
      </html>
  );
}

