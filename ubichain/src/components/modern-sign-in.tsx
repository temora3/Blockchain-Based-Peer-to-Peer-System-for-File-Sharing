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

      // Debug: log the error message returned from AuthService
      if (!result.success) {
        // eslint-disable-next-line no-console
        console.log('SignIn error:', result.error);
      }

      if (result.success) {
        router.push('/dashboard');
      } else {
        // Custom error handling for user not found, wrong password, and missing fields
        const errorMsg = result.error?.toLowerCase() || '';
        if (
          errorMsg.includes('missing email') ||
          errorMsg.includes('email is required')
        ) {
          setError('Wrong Email or Password');
        } else if (
          errorMsg.includes('missing password') ||
          errorMsg.includes('password is required')
        ) {
          setError('Please enter your password.');
        } else if (
          errorMsg.includes('user not found') ||
          errorMsg.includes('invalid login credentials') ||
          errorMsg.includes('no user found')
        ) {
          setError('No account found with that email address. Please sign up.');
        } else if (
          errorMsg.includes('invalid password') ||
          errorMsg.includes('wrong password') ||
          errorMsg.includes('invalid login credentials')
        ) {
          setError('Incorrect password. Please try again or reset your password.');
        } else if (
          errorMsg.includes('missing phone') ||
          errorMsg.includes('phone is required')
        ) {
          setError('Please enter your phone number.');
        } else {
          setError(result.error || 'Failed to sign in');
        }
      }
    } catch (err: any) {
      // Debug: log the error message from the catch block
      // eslint-disable-next-line no-console
      console.log('SignIn catch error:', err?.message);
      // Try to extract error message from err if possible
      const errMsg = err?.message?.toLowerCase?.() || '';
      if (
        errMsg.includes('missing email') ||
        errMsg.includes('email is required')
      ) {
        setError('Please enter your email address.');
      } else if (
        errMsg.includes('missing password') ||
        errMsg.includes('password is required')
      ) {
        setError('Please enter your password.');
      } else if (
        errMsg.includes('user not found') ||
        errMsg.includes('invalid login credentials') ||
        errMsg.includes('no user found')
      ) {
        setError('No account found with that email address. Please sign up.');
      } else if (
        errMsg.includes('invalid password') ||
        errMsg.includes('wrong password') ||
        errMsg.includes('invalid login credentials')
      ) {
        setError('Incorrect password. Please try again or reset your password.');
      } else if (
        errMsg.includes('missing phone') ||
        errMsg.includes('phone is required')
      ) {
        setError('Please enter your phone number.');
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
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
  header: 'Sign In',
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