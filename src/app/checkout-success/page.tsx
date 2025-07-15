'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

const CheckoutSuccessPage: React.FC = () => {
  const router = useRouter();

  const handleGoHome = () => {
    router.push('/');
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md text-center">
        <h1 className="text-2xl font-bold text-green-600 mb-4">Checkout Successful!</h1>
        <p className="text-gray-700 mb-6">Your subscription is now active. Thank you for your purchase!</p>
        <p className="text-gray-600 text-sm">You can now access all premium features.</p>
        <button onClick={handleGoHome} className="mt-8 px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
          Go to Home
        </button>
      </div>
    </div>
  );
};

export default CheckoutSuccessPage;