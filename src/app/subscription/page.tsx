"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, app } from '@/lib/firebase'; // Assuming your firebase config is exported from here
import { User } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';

// Assume 'auth' is initialized and exported from '@/lib/firebase'
const SubscriptionPage: React.FC = () => {
  const plans = [
    {
      title: 'Weekly Plan',
      description: 'Subscribe weekly for continuous access.',
      price: '$X.XX/week',
      id: 'weekly',
    },
    {
      title: 'Monthly Plan',
      description: 'A popular choice for regular use.',
      price: '$Y.YY/month',
      id: 'monthly',
    },
    {
      title: 'Yearly Plan',
      description: 'Our best value for long-term users.',
      price: '$Z.ZZ/year',
      id: 'yearly',
    },
  ];

  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe(); // Cleanup the listener on component unmount
  }, []);

  const handleSubscribe = async (planId: string) => {
    if (!user) {
      console.error("User not logged in.");
      // Optionally redirect to login page
      router.push('/login');
      return;
    }
    const userId = user.uid;
    console.log(`Attempting to subscribe userId: ${userId} to plan: ${planId}`); // Added console log
    try {
      // Get a reference to the functions instance
      // Add a small delay to ensure auth state is fully settled
      await new Promise(resolve => setTimeout(resolve, 300));

      const functions = getFunctions(app);
      // Get a callable function reference to your cloud function
      const createStripeCheckoutSession = httpsCallable(functions, 'createStripeCheckoutSession');

      // Call the function with the required data
      const result = await createStripeCheckoutSession({ plan: planId });
      // Redirect to the Stripe checkout page using the URL returned by the function
      window.location.assign(((result.data as any).url));
    } catch (error) {
      console.error('Error creating Stripe checkout session:', error);
    }
  };

  return (
    <>
    {loading && <div>Loading...</div>}
    {!loading && !user && (
      <div className="container mx-auto py-8 text-center">
        <p className="text-xl">Please log in to view subscription plans.</p>
      </div>
    )}
    {!loading && user && (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold text-center mb-8">Choose Your Plan</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => (
          <div key={plan.id} className="border rounded-lg p-6 flex flex-col items-center text-center">
            <h2 className="text-2xl font-semibold mb-4">{plan.title}</h2>
            <p className="text-gray-600 mb-4">{plan.description}</p>
            <p className="text-xl font-bold mb-6">{plan.price}</p>
            <button onClick={() => handleSubscribe(plan.id)} className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
              Subscribe
            </button>
          </div>
        ))}
      </div>
    </div>
    )}
    </>
  );
};

export default SubscriptionPage;