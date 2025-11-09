import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const error_param = searchParams.get('error')
  const error_description = searchParams.get('error_description')
  const next = searchParams.get('next') ?? '/profile'

  // Check for OAuth errors in the callback URL (Supabase returns these as URL params)
  if (error_param || error_description) {
    console.error('OAuth error in callback:', { error_param, error_description })
    
    // Decode the error description (it might be double-encoded)
    let decodedError = error_description ? decodeURIComponent(error_description) : '';
    // Try decoding again in case it was double-encoded
    try {
      const testDecode = decodeURIComponent(decodedError);
      if (testDecode !== decodedError && testDecode.includes('Multiple')) {
        decodedError = testDecode;
      }
    } catch (e) {
      // Already decoded or invalid, keep original
    }
    
    // Replace + with spaces for better matching
    decodedError = decodedError.replace(/\+/g, ' ');
    
    console.log('Decoded error:', decodedError);
    
    // Handle account linking errors - this happens when email/password account exists and user tries OAuth with same email
    // GitHub specifically fails here because Supabase can't automatically link unverified GitHub emails
    if (decodedError.includes('Multiple accounts') || 
        decodedError.includes('linking') || 
        decodedError.includes('same email') ||
        decodedError.includes('same email address') ||
        error_param === 'server_error') {
      const errorMessage = 'A GitHub account with this email already exists or conflicts with your email/password account. Please sign in with email/password instead, or contact support to link your accounts.';
      return NextResponse.redirect(`${origin}/signin?error=${encodeURIComponent(errorMessage)}`)
    }
    
    // Handle other OAuth errors
    const errorMessage = decodedError || error_param || 'Authentication failed. Please try again.';
    return NextResponse.redirect(`${origin}/signin?error=${encodeURIComponent(errorMessage)}`)
  }

  if (code) {
    const supabase = await createClient()
    
    // Check the type parameter to determine if this is an email confirmation
    const type = searchParams.get('type')
    const isEmailConfirmation = type === 'signup' || type === 'email_change'
    
    // First, check if user is already signed in - if so, we can try to link the identity
    const { data: { user: existingUser } } = await supabase.auth.getUser()
    
    // Exchange the code for a session
    const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (error) {
      console.error('Error exchanging code for session:', error)
      
      // If there's an existing user and we got an error, try to handle account linking
      if (existingUser && (error.message?.includes('Multiple accounts') || error.message?.includes('linking'))) {
        // Try to sign in the existing user with their original method
        // Then redirect to profile (they're already authenticated)
        return NextResponse.redirect(`${origin}/profile`)
      }
      
      // Check if this is an account linking error
      if (error.message?.includes('Multiple accounts') || error.message?.includes('linking')) {
        // Redirect to sign-in page with a helpful message
        const errorMessage = 'An account with this email already exists. Please sign in with your existing account (email/password) or use a different authentication method.';
        return NextResponse.redirect(`${origin}/signin?error=${encodeURIComponent(errorMessage)}`)
      }
      
      // Handle email confirmation errors specifically
      if (isEmailConfirmation) {
        const errorMessage = error.message || 'Email confirmation failed. Please try signing up again or contact support.';
        return NextResponse.redirect(`${origin}/signin?error=${encodeURIComponent(errorMessage)}`)
      }
      
      // Return the user to sign-in page with error for other errors
      return NextResponse.redirect(`${origin}/signin?error=${encodeURIComponent(error.message)}`)
    }
    
    // If session was created successfully, try to link identities if needed
    if (sessionData.session && existingUser && existingUser.id !== sessionData.user?.id) {
      console.log('Attempting to link accounts...');
      // Accounts might be different, but session was created, so continue
    }

    // Successfully exchanged code for session
    // For email confirmations, redirect to sign-in with success message, otherwise to profile
    if (isEmailConfirmation) {
      return NextResponse.redirect(`${origin}/signin?message=${encodeURIComponent('Email confirmed successfully! You can now sign in.')}`)
    }
    
    // Successfully exchanged code for session, now redirect
    const forwardedHost = request.headers.get('x-forwarded-host') // original origin before load balancer
    const isLocalEnv = process.env.NODE_ENV === 'development'
    
    if (isLocalEnv) {
      // we can be sure that there is no load balancer in between, so no need to watch for X-Forwarded-Host
      return NextResponse.redirect(`${origin}${next}`)
    } else if (forwardedHost) {
      return NextResponse.redirect(`https://${forwardedHost}${next}`)
    } else {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}