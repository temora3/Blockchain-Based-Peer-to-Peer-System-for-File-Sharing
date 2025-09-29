import ModernAnimatedSignUp from '@/components/modern-sign-up';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign Up - Ubichain',
  description: 'Create your Ubichain account and join the blockchain revolution',
};

export default function SignUpPage() {
  return <ModernAnimatedSignUp />;
}