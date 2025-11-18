import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * API route to ensure the role column exists in the profiles table
 * This can be called once to add the role column if it doesn't exist
 */
export async function POST() {
  try {
    const supabase = await createClient();
    
    // Check if user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Try to update a profile with role to see if column exists
    // If it fails, we'll know the column doesn't exist
    const { error: testError } = await supabase
      .from('profiles')
      .update({ role: 'user' })
      .eq('id', user.id)
      .limit(0); // Don't actually update, just test

    if (testError) {
      // Column might not exist - return instructions
      return NextResponse.json({
        success: false,
        error: 'Role column does not exist in profiles table',
        message: 'Please run this SQL in your Supabase SQL editor:',
        sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';`
      }, { status: 400 });
    }

    // Column exists, ensure all users without role get 'user'
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ role: 'user' })
      .is('role', null);

    if (updateError) {
      return NextResponse.json({
        success: false,
        error: updateError.message
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Role column exists and all users without role have been set to "user"'
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message || 'An error occurred'
    }, { status: 500 });
  }
}

