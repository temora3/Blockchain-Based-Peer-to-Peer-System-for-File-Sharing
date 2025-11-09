import { supabase } from './supabase/client'
import type { Provider } from '@supabase/supabase-js'

export interface SignUpData {
  email: string
  password: string
  firstName?: string
  lastName?: string
}

export interface SignInData {
  email: string
  password: string
}

export interface AuthResponse {
  success: boolean
  error?: string
  message?: string
}

export class AuthService {
  // Email and Password Sign Up
  static async signUp({ email, password, firstName, lastName }: SignUpData): Promise<AuthResponse> {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback`,
          data: {
            first_name: firstName,
            last_name: lastName,
            full_name: firstName && lastName ? `${firstName} ${lastName}` : undefined,
          },
        },
      })

      if (error) {
        return {
          success: false,
          error: error.message,
        }
      }

      // Create or update profile row in Supabase
      if (data.user) {
        const userId = data.user.id;
        const fullName = firstName && lastName ? `${firstName} ${lastName}` : email;
        const { error: upsertError, data: upsertData } = await supabase.from('profiles').upsert({
          id: userId,
          full_name: fullName,
          email,
        });
        console.log('Profile upsert result (signUp):', { upsertError, upsertData });
      }

      if (data.user && !data.user.email_confirmed_at) {
        return {
          success: true,
          message: 'Please check your email and click the confirmation link to complete your registration.',
        }
      }

      return {
        success: true,
        message: 'Account created successfully!',
      }
    } catch (error) {
      return {
        success: false,
        error: 'An unexpected error occurred during sign up.',
      }
    }
  }

  // Email and Password Sign In
  static async signIn({ email, password }: SignInData): Promise<AuthResponse & { requires2FA?: boolean; factorId?: string; challengeId?: string }> {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        return {
          success: false,
          error: error.message,
        }
      }

      // Check if user has 2FA enabled
      // Note: When 2FA is enabled, Supabase might not return a full session initially
      if (data.user) {
        // Check if 2FA is enabled - try to list factors
        // This might require a session, so we'll try regardless
        const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
        
        // If we can't list factors (maybe no session), check if we got a session
        // If we have a session and no factors error, proceed to check for TOTP
        if (factorsError && data.session) {
          // Can't check factors, but we have a session - proceed with normal sign-in
          console.log('Could not list factors, but have session - proceeding');
        } else if (!factorsError && factorsData) {
          const totp = factorsData.all?.find((f: any) => f.factor_type === 'totp' && f.status === 'verified');
          
          if (totp) {
            // User has 2FA enabled, create a challenge
            console.log('2FA enabled, creating challenge for factor:', totp.id);
            const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: totp.id });
            
            if (challengeError) {
              console.error('Error creating 2FA challenge:', challengeError);
              return {
                success: false,
                error: challengeError.message || 'Failed to create 2FA challenge',
              }
            }

            if (!challengeData?.id) {
              return {
                success: false,
                error: 'Failed to create 2FA challenge',
              }
            }

            console.log('2FA challenge created:', challengeData.id);
            // Return challenge info for 2FA verification
            return {
              success: true,
              requires2FA: true,
              factorId: totp.id,
              challengeId: challengeData.id,
              message: 'Please enter your 2FA code',
            }
          }
        }

        // No 2FA, proceed with normal sign-in
        // Optionally update profile row in Supabase
        const userId = data.user.id;
        const fullName = data.user.user_metadata?.full_name || email;
        const { error: upsertError, data: upsertData } = await supabase.from('profiles').upsert({
          id: userId,
          full_name: fullName,
          email,
        });
        console.log('Profile upsert result (signIn):', { upsertError, upsertData });

        return {
          success: true,
          message: 'Successfully signed in!',
        }
      }

      return {
        success: false,
        error: 'No user data received',
      }
    } catch (error) {
      return {
        success: false,
        error: 'An unexpected error occurred during sign in.',
      }
    }
  }

  // Verify 2FA code during sign-in
  static async verify2FA(factorId: string, challengeId: string, code: string): Promise<AuthResponse> {
    try {
      console.log('Verifying 2FA:', { factorId, challengeId, codeLength: code.length });
      
      const { data, error } = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code,
      })

      if (error) {
        console.error('2FA verify error:', error);
        return {
          success: false,
          error: error.message || 'Invalid 2FA code. Please try again.',
        }
      }

      console.log('2FA verify result:', { 
        hasUser: !!data.user,
        hasAccessToken: !!(data as any).access_token,
        hasRefreshToken: !!(data as any).refresh_token,
      });

      // Supabase mfa.verify() may return tokens directly instead of a session object
      // We need to set the session using these tokens
      if ((data as any).access_token && (data as any).refresh_token) {
        console.log('Setting session from 2FA verify tokens');
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: (data as any).access_token,
          refresh_token: (data as any).refresh_token,
        });

        if (sessionError) {
          console.error('Error setting session:', sessionError);
          return {
            success: false,
            error: sessionError.message || 'Failed to create session after 2FA verification',
          }
        }
      } else if ((data as any).session) {
        // If we got a session object directly, we're good
        console.log('Got session object from 2FA verify');
      } else {
        // Check if we have an existing session
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        
        if (!currentSession) {
          return {
            success: false,
            error: '2FA verification succeeded but no session was created. Please try signing in again.',
          }
        }
        
        console.log('Using existing session after 2FA verify');
      }

      // Update profile row if needed
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const userId = user.id;
        const email = user.email || '';
        const fullName = user.user_metadata?.full_name || email;
        const { error: upsertError } = await supabase.from('profiles').upsert({
          id: userId,
          full_name: fullName,
          email,
        });
        console.log('Profile upsert result (2FA verify):', { upsertError });
      }

      return {
        success: true,
        message: 'Successfully signed in!',
      }
    } catch (error: any) {
      console.error('2FA verify exception:', error);
      return {
        success: false,
        error: error?.message || 'Failed to verify 2FA code',
      }
    }
  }

  // Social Login (OAuth)
  static async signInWithProvider(provider: Provider): Promise<AuthResponse> {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: provider === 'github' ? {
            // GitHub-specific: remove prompt to avoid conflicts
          } : {
            access_type: 'offline',
            prompt: 'consent', // Force consent screen to allow account selection
          },
          // Enable automatic account linking if emails match
          skipBrowserRedirect: false,
        },
      })

      if (error) {
        return {
          success: false,
          error: error.message,
        }
      }

      // The OAuth flow will redirect away from this page
      // We don't need to do anything else here
      return {
        success: true,
        message: `Redirecting to ${provider} login...`,
      }
    } catch (error) {
      return {
        success: false,
        error: `An unexpected error occurred during ${provider} sign in.`,
      }
    }
  }

  // Sign Out
  static async signOut(): Promise<AuthResponse> {
    try {
      // Clear all auth state including OAuth sessions
      const { error } = await supabase.auth.signOut({
        scope: 'global' // Sign out from all sessions
      })

      if (error) {
        return {
          success: false,
          error: error.message,
        }
      }

      // Force a page reload to clear any cached state
      if (typeof window !== 'undefined') {
        // Small delay to ensure signOut completes
        setTimeout(() => {
          window.location.href = '/signin'
        }, 100)
      }

      return {
        success: true,
        message: 'Successfully signed out!',
      }
    } catch (error) {
      return {
        success: false,
        error: 'An unexpected error occurred during sign out.',
      }
    }
  }

  // Get Current User
  static async getCurrentUser() {
    try {
      const { data: { user }, error } = await supabase.auth.getUser()

      if (error) {
        return { user: null, error: error.message }
      }

      return { user, error: null }
    } catch (error) {
      return { user: null, error: 'Failed to get current user.' }
    }
  }

  // Check if user is authenticated
  static async isAuthenticated(): Promise<boolean> {
    const { user } = await this.getCurrentUser()
    return !!user
  }

  // Send Password Reset Email
  static async resetPassword(email: string): Promise<AuthResponse> {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (error) {
        return {
          success: false,
          error: error.message,
        }
      }

      return {
        success: true,
        message: 'Password reset email sent! Check your inbox.',
      }
    } catch (error) {
      return {
        success: false,
        error: 'An unexpected error occurred while sending reset email.',
      }
    }
  }

  // Update Password (requires old password for verification or AAL2 access token)
  static async updatePassword(newPassword: string, oldPassword: string, accessToken?: string | null): Promise<AuthResponse> {
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        console.error('Error updating password', error);
        return {
          success: false,
          error: error.message,
        };
      }
      return {
        success: true,
        message: 'Password updated successfully!',
      };
    } catch (error: any) {
      console.error('Unexpected error updating password', error);
      return {
        success: false,
        error: error?.message || 'An unexpected error occurred while updating password.',
      };
    }
  }

  // Listen to auth state changes
  static onAuthStateChange(callback: (event: string, session: any) => void) {
    return supabase.auth.onAuthStateChange(callback)
  }
}

// Convenience functions for common providers
export const signInWithGoogle = () => AuthService.signInWithProvider('google')
export const signInWithGitHub = () => AuthService.signInWithProvider('github')
export const signInWithApple = () => AuthService.signInWithProvider('apple')

export default AuthService