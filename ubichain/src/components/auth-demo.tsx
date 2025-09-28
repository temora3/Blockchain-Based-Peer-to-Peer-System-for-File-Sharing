'use client';

import { useState } from 'react';
import ModernAnimatedSignIn from '@/components/modern-sign-in';
import ModernAnimatedSignUp from '@/components/modern-sign-up';

export default function AuthDemo() {
  const [currentView, setCurrentView] = useState<'signin' | 'signup'>('signin');

  if (currentView === 'signin') {
    return (
      <div className="relative">
        <ModernAnimatedSignIn />
        <div className="absolute top-4 right-4 z-50">
          <button
            onClick={() => setCurrentView('signup')}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-md transition-colors"
          >
            View Sign Up Page
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <ModernAnimatedSignUp />
      <div className="absolute top-4 right-4 z-50">
        <button
          onClick={() => setCurrentView('signin')}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-md transition-colors"
        >
          View Sign In Page
        </button>
      </div>
    </div>
  );
}