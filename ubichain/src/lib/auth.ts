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
  static async signIn({ email, password }: SignInData): Promise<AuthResponse> {
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

      // Optionally update profile row in Supabase
      if (data.user) {
        const userId = data.user.id;
        const fullName = data.user.user_metadata?.full_name || email;
        const { error: upsertError, data: upsertData } = await supabase.from('profiles').upsert({
          id: userId,
          full_name: fullName,
          email,
        });
        console.log('Profile upsert result (signIn):', { upsertError, upsertData });
      }

      return {
        success: true,
        message: 'Successfully signed in!',
      }
    } catch (error) {
      return {
        success: false,
        error: 'An unexpected error occurred during sign in.',
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
        },
      })

      if (error) {
        return {
          success: false,
          error: error.message,
        }
      }

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
      const { error } = await supabase.auth.signOut()

      if (error) {
        return {
          success: false,
          error: error.message,
        }
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