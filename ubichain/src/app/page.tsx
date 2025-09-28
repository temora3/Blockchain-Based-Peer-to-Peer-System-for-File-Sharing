'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function Home() {
  const router = useRouter();

  // Auto-redirect to sign-in after a short delay
  useEffect(() => {
    const timer = setTimeout(() => {
      router.push('/signin');
    }, 2000);

    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-center space-y-8">
        {/* Logo/Brand */}
        <div className="space-y-4">
          <h1 className="text-6xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
            Ubichain
          </h1>
          <p className="text-zinc-400 text-lg">
            Blockchain-Based Peer-to-Peer System for File Sharing
          </p>
        </div>

        {/* Auth Options */}
        <div className="space-y-4">
          <p className="text-zinc-300 text-sm">
            Redirecting to sign in...
          </p>
          
          <div className="flex gap-4 justify-center">
            <Link 
              href="/signin"
              className="px-6 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white rounded-lg font-medium transition-all transform hover:scale-105"
            >
              Sign In
            </Link>
            <Link 
              href="/signup"
              className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg font-medium border border-zinc-600 transition-all transform hover:scale-105"
            >
              Sign Up
            </Link>
          </div>
        </div>

        {/* Features Preview */}
        <div className="mt-12 text-center">
          <p className="text-zinc-500 text-sm">
            Secure • Decentralized • Fast
          </p>
        </div>
      </div>
    </div>
  );
}
