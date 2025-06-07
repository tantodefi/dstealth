import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import UserProfile from '@/components/UserProfile';
import { env } from '@/lib/env';

interface UserProfilePageProps {
  params: {
    address: string;
  };
  searchParams: {
    frame?: string;
    action?: 'pay' | 'connect';
  };
}

// Generate OG metadata for Farcaster Frames
export async function generateMetadata({ params }: UserProfilePageProps): Promise<Metadata> {
  const { address } = params;
  
  // Validate Ethereum address format
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return {
      title: 'Invalid User Profile',
      description: 'User not found'
    };
  }

  // In a real app, you'd fetch user data here
  const baseUrl = env.NEXT_PUBLIC_URL;
  const frameImageUrl = `${baseUrl}/api/og/user-profile?address=${address}`;
  
  return {
    title: `${address.slice(0, 8)}... - X402 Profile`,
    description: `View ${address.slice(0, 8)}...'s X402 profile, payment links, and content. Pay with crypto and access exclusive content.`,
    openGraph: {
      title: `${address.slice(0, 8)}... on X402`,
      description: `Crypto payments • Content monetization • Farcaster integration`,
      images: [frameImageUrl],
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: `${address.slice(0, 8)}... - X402 Profile`,
      description: `View profile and make crypto payments`,
      images: [frameImageUrl],
    },
    // Farcaster Frame metadata
    other: {
      'fc:frame': 'vNext',
      'fc:frame:image': frameImageUrl,
      'fc:frame:image:aspect_ratio': '1.91:1',
      'fc:frame:button:1': 'View Profile',
      'fc:frame:button:1:action': 'link',
      'fc:frame:button:1:target': `${baseUrl}/u/${address}`,
      'fc:frame:button:2': 'Make Payment',
      'fc:frame:button:2:action': 'link', 
      'fc:frame:button:2:target': `${baseUrl}/u/${address}?action=pay`,
      'fc:frame:button:3': 'Connect Wallet',
      'fc:frame:button:3:action': 'link',
      'fc:frame:button:3:target': `${baseUrl}/u/${address}?action=connect`,
    },
  };
}

export default function UserProfilePage({ params, searchParams }: UserProfilePageProps) {
  const { address } = params;
  
  // Validate Ethereum address format
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
      <UserProfile 
        address={address} 
        frameAction={searchParams.frame}
        initialAction={searchParams.action}
      />
    </div>
  );
} 