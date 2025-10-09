'use client';

import { useState, ChangeEvent, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AuthTabs } from '@/components/blocks/modern-animated-sign-in';
import { AuthLampEffect } from '@/components/ui/auth-lamp';
import AuthService from '@/lib/auth';

interface SignUpFormData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export default function ModernAnimatedSignUp() {
  const router = useRouter();
  const [signUpData, setSignUpData] = useState<SignUpFormData>({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  // Handle sign-up form changes
  const handleSignUpChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { id, value } = event.target;
    setSignUpData(prev => ({
      ...prev,
      [id]: value,
    }));
  };

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Handle form submission
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    // Basic validation
    if (!signUpData.firstName.trim() || !signUpData.lastName.trim()) {
      setError('Please enter your first and last name');
      setIsLoading(false);
      return;
    }
    if (!signUpData.email.trim()) {
      setError('Please enter your email address');
      setIsLoading(false);
      return;
    }
    if (signUpData.password.length < 6) {
      setError('Password must be at least 6 characters long');
      setIsLoading(false);
      return;
    }
    if (signUpData.password !== signUpData.confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    try {
      const result = await AuthService.signUp({
        email: signUpData.email,
        password: signUpData.password,
        firstName: signUpData.firstName,
        lastName: signUpData.lastName,
      });
      if (result.success) {
        // If the message indicates email confirmation is required, show message and do not redirect
        if (result.message && result.message.toLowerCase().includes('confirmation')) {
          setSuccess(result.message);
        } else {
          setSuccess(result.message || 'Account created successfully!');
          setTimeout(() => {
            router.push('/profile');
          }, 1200);
        }
      } else {
        // Map common Supabase errors to user-friendly message
        const errorMsg = result.error?.toLowerCase() || '';
        if (
          errorMsg.includes('email already registered') ||
          errorMsg.includes('user already registered') ||
          errorMsg.includes('user already exists')
        ) {
          setError('An account with this email already exists.');
        } else {
          setError(result.error || 'Failed to sign up');
        }
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
    setError(null);
    await AuthService.signInWithProvider('google');
    setIsLoading(false);
  };
  const handleGitHub = async () => {
    setIsLoading(true);
    setError(null);
    await AuthService.signInWithProvider('github');
    setIsLoading(false);
  };
  // const handleApple = async () => {
  //   setIsLoading(true);
  //   setError(null);
  //   await AuthService.signInWithProvider('apple');
  //   setIsLoading(false);
  // };

  // Navigate to sign-in page
  const goToSignIn = () => {
    router.push('/signin');
  };

  // Sign-up form configuration
  const signUpFormFields = {
    header: 'Create Account',
    subHeader: 'Join us today and start your journey',
    fields: [
      {
        label: 'First Name',
        id: 'firstName',
        required: true,
        type: 'text' as const,
        placeholder: 'Enter your first name',
        onChange: handleSignUpChange,
      },
      {
        label: 'Last Name',
        id: 'lastName',
        required: true,
        type: 'text' as const,
        placeholder: 'Enter your last name',
        onChange: handleSignUpChange,
      },
      {
        label: 'Email Address',
        id: 'email',
        required: true,
        type: 'email' as const,
        placeholder: 'Enter your email address',
        onChange: handleSignUpChange,
      },
      {
        label: 'Password',
        id: 'password',
        required: true,
        type: 'password' as const,
        placeholder: 'Create a password',
        onChange: handleSignUpChange,
      },
      {
        label: 'Confirm Password',
        id: 'confirmPassword',
        required: true,
        type: 'password' as const,
        placeholder: 'Confirm your password',
        onChange: handleSignUpChange,
      },
    ],
    submitButton: isLoading ? 'Creating Account...' : 'Create Account',
    textVariantButton: 'Already have an account? Sign in',
    errorField: error || undefined,
  };

  return (
    <div className="min-h-screen bg-slate-950 flex">
      {/* Left Side - Lamp Effect */}
      <div className="hidden lg:flex lg:w-1/2 h-screen">
        <AuthLampEffect />
      </div>

      {/* Right Side - Sign Up Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center bg-slate-950">
        <div className="w-full max-w-md px-6">
          <AuthTabs
            formFields={signUpFormFields}
            goTo={goToSignIn}
            handleSubmit={handleSubmit}
            // Pass social login handlers to AuthDock via AnimatedForm
            googleLogin="Social Login"
            onGoogleClick={handleGoogle}
            onGithubClick={handleGitHub}
          />
          {success && (
            <div className="mt-4 text-green-500 text-center text-sm">
              {success}
              {success.toLowerCase().includes('confirmation') && (
                <div className="mt-2 text-cyan-400">Check your email for a confirmation link to activate your account.</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}