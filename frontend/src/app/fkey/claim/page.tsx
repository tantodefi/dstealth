import { Metadata } from 'next';
import FkeyClaimInterface from '@/components/FkeyClaimInterface';

export const metadata: Metadata = {
  title: 'Claim Your .fkey.id | X402 Protocol',
  description: 'Claim your unique .fkey.id identifier for your X402 profile. One claim per wallet address.',
  openGraph: {
    title: 'Claim Your .fkey.id - X402 Protocol',
    description: 'Get your unique identifier for crypto payments and content monetization',
    type: 'website',
  },
};

export default function FkeyClaimPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
      <FkeyClaimInterface />
    </div>
  );
} 