'use client';

import { useState, ChangeEvent, FormEvent, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthTabs } from '@/components/blocks/modern-animated-sign-in';
import { AuthLampEffect } from '@/components/ui/auth-lamp';
import AuthService from '@/lib/auth';
import { useToast } from '@/components/ui/toast-1';

interface SignInFormData {
  email: string;
  password: string;
}

export default function ModernAnimatedSignIn() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [signInData, setSignInData] = useState<SignInFormData>({
    email: '',
    password: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  
  // 2FA state
  const [requires2FA, setRequires2FA] = useState(false);
  const [twoFACode, setTwoFACode] = useState('');
  const [twoFAError, setTwoFAError] = useState<string | undefined>(undefined);
  const [twoFAVerifying, setTwoFAVerifying] = useState(false);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const { showToast } = useToast();

  // Check for error in URL params (e.g., from OAuth callback failures)
  useEffect(() => {
    const errorParam = searchParams.get('error');
    const messageParam = searchParams.get('message');
    
    if (errorParam) {
      const decodedError = decodeURIComponent(errorParam);
      setError(decodedError);
      showToast(decodedError, 'error');
      // Clean up the URL
      router.replace('/signin', { scroll: false });
    } else if (messageParam) {
      const decodedMessage = decodeURIComponent(messageParam);
      showToast(decodedMessage, 'success');
      // Clean up the URL
      router.replace('/signin', { scroll: false });
    }
  }, [searchParams, router, showToast]);

  // Handle sign-in form changes
  const handleSignInChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { id, value } = event.target;
    setSignInData(prev => ({
      ...prev,
      [id]: value,
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    // If 2FA is required, verify the code instead
    if (requires2FA && challengeId && factorId) {
      setTwoFAVerifying(true);
      setTwoFAError(undefined);
      
      try {
        const result = await AuthService.verify2FA(factorId, challengeId, twoFACode);
        
        if (result.success) {
          // Redirect to profile page after successful 2FA verification
          router.push('/profile');
        } else {
          setTwoFAError(result.error || 'Invalid 2FA code');
          showToast(result.error || 'Invalid 2FA code', 'error');
        }
      } catch (err) {
        setTwoFAError('Failed to verify 2FA code. Please try again.');
        showToast('Failed to verify 2FA code. Please try again.', 'error');
      } finally {
        setTwoFAVerifying(false);
      }
      return;
    }
    
    setIsLoading(true);
    setError(undefined);

    try {
      const result = await AuthService.signIn({
        email: signInData.email,
        password: signInData.password,
      });

      if (result.success) {
        // Check if 2FA is required
        if (result.requires2FA && result.factorId && result.challengeId) {
          setRequires2FA(true);
          setFactorId(result.factorId);
          setChallengeId(result.challengeId);
          setIsLoading(false);
          return;
        }
        
        // Redirect to profile page after successful login
        router.push('/profile');
      } else {
        // Map common Supabase errors to user-friendly message
        const errorMsg = result.error?.toLowerCase() || '';
        if (
          errorMsg.includes('missing email') ||
          errorMsg.includes('email is required') ||
          errorMsg.includes('missing password') ||
          errorMsg.includes('password is required') ||
          errorMsg.includes('user not found') ||
          errorMsg.includes('invalid login credentials') ||
          errorMsg.includes('no user found') ||
          errorMsg.includes('invalid password') ||
          errorMsg.includes('wrong password')
        ) {
          setError('Wrong Email or Password');
          showToast('Wrong Email or Password', 'error');
        } else if (errorMsg.includes('email not confirmed')) {
          setError('Please confirm your email before signing in.');
          showToast('Please confirm your email before signing in.', 'warning');
        } else {
          setError(result.error || 'Failed to sign in');
          showToast(result.error || 'Failed to sign in', 'error');
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
    setError(undefined);
    await AuthService.signInWithProvider('google');
    setIsLoading(false);
  };
  // GitHub sign-in temporarily disabled due to account linking issues
  // const handleGitHub = async () => {
  //   setIsLoading(true);
  //   setError(undefined);
  //   await AuthService.signInWithProvider('github');
  //   setIsLoading(false);
  // };

  // Navigate to sign-up page
  const goToSignUp = () => {
    router.push('/signup');
  };

  // Sign-in form configuration
  const signInFormFields = {
    header: requires2FA ? '2FA Verification' : 'Sign In',
    subHeader: requires2FA ? 'Enter the 6-digit code from your authenticator app' : 'Sign in to your account to continue',
    fields: requires2FA ? [
      {
        label: '2FA Code',
        id: 'twoFACode',
        required: true,
        type: 'text' as const,
        placeholder: '123456',
        onChange: (e: ChangeEvent<HTMLInputElement>) => {
          const value = e.target.value.replace(/\D/g, '').slice(0, 6);
          setTwoFACode(value);
          setTwoFAError(undefined);
        },
      },
    ] : [
      {
        label: 'Email Address',
        id: 'email',
        required: true,
        type: 'email' as const,
        placeholder: 'Enter your email address',
        onChange: handleSignInChange,
      },
      {
        label: 'Password',
        id: 'password',
        required: true,
        type: 'password' as const,
        placeholder: 'Enter your password',
        onChange: handleSignInChange,
      },
    ],
    submitButton: requires2FA 
      ? (twoFAVerifying ? 'Verifying...' : 'Verify')
      : (isLoading ? 'Signing In...' : 'Sign In'),
    textVariantButton: requires2FA ? undefined : "Don't have an account? Sign up",
    errorField: undefined, // Removed - using toast notifications instead
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
            goTo={requires2FA ? undefined : goToSignUp}
            handleSubmit={handleSubmit}
            googleLogin={requires2FA ? undefined : "Social Login"}
            onGoogleClick={requires2FA ? undefined : handleGoogle}
            // onGithubClick={handleGitHub} // GitHub sign-in temporarily disabled
          />
          {requires2FA && (
            <div className="mt-4 text-center">
              <button
                onClick={() => {
                  setRequires2FA(false);
                  setTwoFACode('');
                  setTwoFAError(undefined);
                  setChallengeId(null);
                  setFactorId(null);
                }}
                className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                ← Back to sign in
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}