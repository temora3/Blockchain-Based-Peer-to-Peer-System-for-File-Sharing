'use client';

import { useState, ChangeEvent, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AuthTabs } from '@/components/blocks/modern-animated-sign-in';
import { AuthLampEffect } from '@/components/ui/auth-lamp';
import AuthService from '@/lib/auth';
import { useToast } from '@/components/ui/toast-1';

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
  const { showToast } = useToast();

  // Handle form submission
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    // Basic validation
    if (!signUpData.firstName.trim() || !signUpData.lastName.trim()) {
      setError('Please enter your first and last name');
      showToast('Please enter your first and last name', 'warning');
      setIsLoading(false);
      return;
    }
    if (!signUpData.email.trim()) {
      setError('Please enter your email address');
      showToast('Please enter your email address', 'warning');
      setIsLoading(false);
      return;
    }
    if (signUpData.password.length < 6) {
      setError('Password must be at least 6 characters long');
      showToast('Password must be at least 6 characters long', 'warning');
      setIsLoading(false);
      return;
    }
    if (signUpData.password !== signUpData.confirmPassword) {
      setError('Passwords do not match');
      showToast('Passwords do not match', 'warning');
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
          showToast(result.message, 'info');
        } else {
          setSuccess(result.message || 'Account created successfully!');
          showToast(result.message || 'Account created successfully!', 'success');
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
          showToast('An account with this email already exists.', 'error');
        } else {
          setError(result.error || 'Failed to sign up');
          showToast(result.error || 'Failed to sign up', 'error');
        }
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.');
      showToast('An unexpected error occurred. Please try again.', 'error');
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
  // GitHub sign-in temporarily disabled due to account linking issues
  // const handleGitHub = async () => {
  //   setIsLoading(true);
  //   setError(null);
  //   await AuthService.signInWithProvider('github');
  //   setIsLoading(false);
  // };
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
    errorField: undefined, // Removed - using toast notifications instead
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
            // onGithubClick={handleGitHub} // GitHub sign-in temporarily disabled
          />
        </div>
      </div>
    </div>
  );
}