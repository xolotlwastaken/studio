"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, app } from '@/lib/firebase'; // Assuming your firebase config is exported from here
import { User } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import LoadingSpinner from '@/components/loading-spinner';

// Assume 'auth' is initialized and exported from '@/lib/firebase'
const SubscriptionPage: React.FC = () => {
  const plans = [
    { 
      id: 'weekly',
      title: 'Weekly Plan',
      description: 'Get access to all features on a weekly basis.',
      price: 9.99,
      priceDisplay: '$9.99/week',
      features: ['Feature A', 'Feature B'],
    },
    {
      id: 'monthly',
      title: 'Monthly Plan',
      description: 'A popular choice for regular use.',
      price: 29.99,
      priceDisplay: '$29.99/month',
      features: ['Feature A', 'Feature B', 'Feature C'],
    },
    {
      id: 'yearly',
      title: 'Yearly Plan',
      description: 'Our best value for long-term users.',
      price: 299.99,
      priceDisplay: '$299.99/year',
      id: 'yearly',
 features: ['Feature A', 'Feature B', 'Feature C', 'Feature D'],
    }
  ];

  const weeklyPrice = plans.find(plan => plan.id === 'weekly')?.price || 0;
  const monthlyPlan = plans.find(plan => plan.id === 'monthly');
  const yearlyPlan = plans.find(plan => plan.id === 'yearly');

  const monthlySavings = monthlyPlan && weeklyPrice > 0
    ? Math.round(((weeklyPrice * 4) - monthlyPlan.price) / (weeklyPrice * 4) * 100)
    : 0;
  const yearlySavings = yearlyPlan && weeklyPrice > 0
    ? Math.round(((weeklyPrice * 52) - yearlyPlan.price) / (weeklyPrice * 52) * 100)
    : 0;

  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);

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
      // Optionally redirect to login page
      router.push('/login');
      return;
    }
    const userId = user.uid;
    setSubscribing(true);
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
    } finally {
 setSubscribing(false);
    }
  };

  const handleBack = () => router.push("/");

  return (
    <div className="relative">
    {/* Full-page overlay with loading spinner */}
    {subscribing && (
      <div className="fixed inset-0 bg-gray-800 bg-opacity-50 flex items-center justify-center z-50">
        <LoadingSpinner />
      </div>
    )}

    {loading && <div>Loading...</div>}

    {/* Not logged in state */}
    {!loading && !user && (
      <div className="container mx-auto py-8 text-center">
        <p className="text-xl">Please log in to view subscription plans.</p>
      </div>
    )}
    {!loading && user && (
 <div className="container mx-auto py-12 px-4">
 <button onClick={handleBack} className="mb-8 inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
 Back
 </button>
 <h1 className="text-4xl font-extrabold text-center mb-12 text-gray-900">Choose the Perfect Plan for You</h1>
 <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {plans.map((plan) => (
 <div key={plan.id} className="bg-white rounded-xl shadow-lg overflow-hidden transform transition duration-500 hover:scale-105 flex flex-col">
 <div className="px-6 py-8 text-center">
 <h2 className="text-2xl font-bold text-gray-800 mb-4">{plan.title}</h2>
 <p className="text-gray-600 mb-6">{plan.description}</p>
 <p className="text-4xl font-extrabold text-gray-900 mb-2">{plan.priceDisplay}</p>
            {plan.id === 'monthly' && monthlySavings > 0 && (
 <p className="text-sm text-green-600 mb-6">Save {monthlySavings}% compared to weekly</p>
            )}
            {plan.id === 'yearly' && yearlySavings > 0 && (
 <p className="text-md font-bold text-red-600 mb-6 animate-pulse">Save {yearlySavings}% compared to weekly!</p>
            )}
 <ul className="text-gray-700 text-left mb-8">
 {plan.features && plan.features.map((feature, index) => (
 <li key={index} className="flex items-center mb-2">
 <svg className="h-5 w-5 text-green-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
 {feature}
 </li>
 ))}
 </ul>
            <button onClick={() => handleSubscribe(plan.id)} className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600" disabled={subscribing}>
              Subscribe
            </button>
 </div>
          </div>
        ))}
      </div>
    </div>
 )}
    </div>
  );
};

export default SubscriptionPage;