'use client';

import { useState, ChangeEvent, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AuthTabs } from '@/components/blocks/modern-animated-sign-in';
import { AuthLampEffect } from '@/components/ui/auth-lamp';
import AuthService from '@/lib/auth';

interface SignInFormData {
  email: string;
  password: string;
}

export default function ModernAnimatedSignIn() {
  const router = useRouter();
  const [signInData, setSignInData] = useState<SignInFormData>({
    email: '',
    password: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  // Handle sign-in form changes
  const handleSignInChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { id, value } = event.target;
    setSignInData(prev => ({
      ...prev,
      [id]: value,
    }));
  };

  // Handle form submission
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(undefined);
    
    try {
      const result = await AuthService.signIn({
        email: signInData.email,
        password: signInData.password,
      });

      if (result.success) {
        // Redirect to dashboard or home page after successful login
        router.push('/dashboard');
      } else {
        setError(result.error || 'Failed to sign in');
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };


  // Social login handlers
  const handleGoogle = async () => {
    setIsLoading(true);
    setError(undefined);
    await AuthService.signInWithProvider('google');
    setIsLoading(false);
  };
  const handleGitHub = async () => {
    setIsLoading(true);
    setError(undefined);
    await AuthService.signInWithProvider('github');
    setIsLoading(false);
  };

  // Navigate to sign-up page
  const goToSignUp = () => {
    router.push('/signup');
  };

  // Sign-in form configuration
  const signInFormFields = {
    header: 'Welcome Back',
    subHeader: 'Sign in to your account to continue',
    fields: [
      {
        label: 'Email Address',
        required: true,
        type: 'email' as const,
        placeholder: 'Enter your email address',
        onChange: handleSignInChange,
      },
      {
        label: 'Password',
        required: true,
        type: 'password' as const,
        placeholder: 'Enter your password',
        onChange: handleSignInChange,
      },
    ],
    submitButton: isLoading ? 'Signing In...' : 'Sign In',
    textVariantButton: "Don't have an account? Sign up",
    errorField: error,
  };

  return (
    <div className="min-h-screen bg-slate-950 flex">
      {/* Left Side - Lamp Effect */}
      <div className="hidden lg:flex lg:w-1/2 h-screen">
        <AuthLampEffect />
      </div>

      {/* Right Side - Sign In Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center bg-slate-950">
        <div className="w-full max-w-md px-6">
          <AuthTabs
            formFields={signInFormFields}
            goTo={goToSignUp}
            handleSubmit={handleSubmit}
            googleLogin="Social Login"
            onGoogleClick={handleGoogle}
            onGithubClick={handleGitHub}
          />
        </div>
      </div>
    </div>
  );
}