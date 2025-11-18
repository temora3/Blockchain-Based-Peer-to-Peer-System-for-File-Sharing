import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  
  // Add global error handler for refresh token errors
  client.auth.onAuthStateChange((event, session) => {
    if (event === 'TOKEN_REFRESHED') {
      // Token refresh succeeded
      console.log('Token refreshed successfully');
    } else if (event === 'SIGNED_OUT') {
      // User signed out
      console.log('User signed out');
    }
  });
  
  return client;
}

// For client-side usage
export const supabase = createClient();