"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';

export type UserRole = 'user' | 'admin';

export function useUserRole() {
  const [role, setRole] = useState<UserRole>('user');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRole() {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        
        if (userError || !user) {
          setRole('user');
          setLoading(false);
          return;
        }

        // Fetch role from profiles table
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        if (profileError) {
          // If error is about missing column, try to ensure role is set
          if (profileError.message?.includes('column') && profileError.message?.includes('role')) {
            console.warn('Role column does not exist. Attempting to add it via upsert...');
            // Try to upsert profile with role to ensure column exists
            const { error: upsertError } = await supabase
              .from('profiles')
              .upsert({
                id: user.id,
                role: 'user',
              }, {
                onConflict: 'id',
              });
            
            if (upsertError) {
              console.error('Error upserting profile with role:', upsertError);
              console.warn('Please run migration: ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT \'user\';');
            }
          } else {
            console.error('Error fetching user role:', profileError);
          }
          // Default to 'user' if profile doesn't exist or error occurs
          setRole('user');
        } else {
          // Use role from profile, default to 'user' if not set
          const userRole = (profile?.role as UserRole) || 'user';
          setRole(userRole);
          
          // If role is null/undefined, update it to 'user'
          if (!profile?.role) {
            await supabase
              .from('profiles')
              .update({ role: 'user' })
              .eq('id', user.id);
          }
        }
      } catch (error) {
        console.error('Error in useUserRole:', error);
        setRole('user');
      } finally {
        setLoading(false);
      }
    }

    fetchRole();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      fetchRole();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return { role, loading, isAdmin: role === 'admin' };
}

