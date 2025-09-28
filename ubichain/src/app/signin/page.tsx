import ModernAnimatedSignIn from '@/components/modern-sign-in';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign In - Ubichain',
  description: 'Sign in to your Ubichain account',
};

export default function SignInPage() {
  return <ModernAnimatedSignIn />;
}