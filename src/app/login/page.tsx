'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { getFirebaseAuth } from '@/lib/firebase'; // Import the getter function
import { Github, Chrome } from 'lucide-react'; // Use Chrome instead of Google


export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const auth = getFirebaseAuth(); // Get the initialized auth instance


  const handleAuthAction = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isSignUp) {    
        if(password !== confirmPassword) {
            toast({
                variant: 'destructive',
                title: 'Registration Failed',
                description: 'Passwords do not match.',
              });
              return;
        }
        await createUserWithEmailAndPassword(auth, email, password);
        toast({ title: 'Success', description: 'Account created successfully!' });
        setEmail('');
        setPassword('');
        setConfirmPassword('');
        setIsSignUp(false);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        toast({ title: 'Success', description: 'Logged in successfully!' });
        router.push('/');
      }
    } catch (error: any) {
      console.error('Authentication error:', error);
      let description = error.message || 'An unexpected error occurred.';
      if (error.code === 'auth/invalid-api-key') {
        description = 'Invalid Firebase API Key. Please check your environment configuration.';
      } else if (error.code === 'auth/wrong-password') {
         description = 'Incorrect password. Please try again.';
      } else if (error.code === 'auth/user-not-found') {
          description = 'No user found with this email. Please sign up or check the email address.';
      } else if (error.code === 'auth/email-already-in-use') {
          description = 'This email is already registered. Please log in instead.';
      }

      toast({
        variant: 'destructive',
        title: 'Authentication Failed',
        description: description,
      });
    }
  };

  const handleGoogleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      toast({ title: 'Success', description: 'Logged in with Google successfully!' });
      router.push('/');
    } catch (error: any) {
      console.error('Google Sign-In error:', error);
       let description = error.message || 'Could not sign in with Google.';
       if (error.code === 'auth/popup-closed-by-user') {
            description = 'Google Sign-In cancelled.';
       } else if (error.code === 'auth/cancelled-popup-request') {
           description = 'Google Sign-In cancelled.';
       } else if (error.code === 'auth/popup-blocked') {
            description = 'Google Sign-In popup blocked by browser. Please allow popups for this site.';
       }
      toast({
        variant: 'destructive',
        title: 'Google Sign-In Failed',
        description: description,
      });
    }
  };


  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Smart Scribe</CardTitle>
          <CardDescription>
            {isSignUp ? 'Create an account to get started.' : 'Log in to your account.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAuthAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="focus:ring-accent"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="focus:ring-accent"
              />
            </div>
            {isSignUp && (
                <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    className="focus:ring-accent"
                />
                </div>
            )}
            <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
              {isSignUp ? 'Sign Up' : 'Log In'}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm text-muted-foreground">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <Button variant="link" className="p-0 h-auto text-accent" onClick={() => setIsSignUp(!isSignUp)}>
              {isSignUp ? 'Log In' : 'Sign Up'}
            </Button>
          </div>
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Or continue with
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
             <Button variant="outline" onClick={handleGoogleSignIn}>
                <Chrome className="mr-2 h-4 w-4" /> Google
              </Button>
             <Button variant="outline" disabled> {/* Add GitHub/other providers later */}
                <Github className="mr-2 h-4 w-4" /> GitHub
              </Button>
          </div>
        </CardContent>
         <CardFooter className="text-center text-xs text-muted-foreground">
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </CardFooter>
      </Card>
    </div>
  );
}
