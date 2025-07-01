import React from 'react';
import { Metadata } from 'next';
import { isAddress } from 'viem';

async function resolveUsernameToProfile(usernameOrAddress: string) {
  try {
    let resolvedAddress = usernameOrAddress;
    
    // If it's not already an address, try to resolve it
    if (!isAddress(usernameOrAddress)) {
      
      // Try ENS resolution
      try {
        const ensResponse = await fetch(`https://api.ensideas.com/ens/resolve/${usernameOrAddress}`);
        if (ensResponse.ok) {
          const ensData = await ensResponse.json();
          if (ensData.address) {
            resolvedAddress = ensData.address;
          }
        }
      } catch (e) {
        console.warn('ENS resolution failed:', e);
      }

      // Try basename lookup (if ends with .base.eth)
      if (!isAddress(resolvedAddress) && usernameOrAddress.endsWith('.base.eth')) {
        try {
          const baseResponse = await fetch(`https://api.basenames.org/v1/name/${usernameOrAddress}`);
          if (baseResponse.ok) {
            const baseData = await baseResponse.json();
            if (baseData.owner) {
              resolvedAddress = baseData.owner;
            }
          }
        } catch (e) {
          console.warn('Basename resolution failed:', e);
        }
      }

      // Try fkey.id lookup
      if (!isAddress(resolvedAddress)) {
        try {
          const fkeyResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/fkey/lookup/${usernameOrAddress}`);
          if (fkeyResponse.ok) {
            const fkeyData = await fkeyResponse.json();
            if (fkeyData.success && fkeyData.user && fkeyData.user.address) {
              resolvedAddress = fkeyData.user.address;
            }
          }
        } catch (e) {
          console.warn('fkey.id resolution failed:', e);
        }
      }

      // Try convos.org lookup
      if (!isAddress(resolvedAddress)) {
        try {
          const convosResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/convos/lookup/${usernameOrAddress}`);
          if (convosResponse.ok) {
            const convosData = await convosResponse.json();
            if (convosData.success && convosData.profile && convosData.profile.address) {
              resolvedAddress = convosData.profile.address;
            }
          }
        } catch (e) {
          console.warn('Convos resolution failed:', e);
        }
      }
    }

    // If we have a valid address, get the profile
    if (isAddress(resolvedAddress)) {
      const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/user/profile/${resolvedAddress}`);
      if (response.ok) {
        const data = await response.json();
        return { profile: data.success ? data.profile : null, address: resolvedAddress };
      }
    }
  } catch (error) {
    console.error('Failed to resolve username/address:', error);
  }
  return { profile: null, address: null };
}

interface Props {
  params: Promise<{ username: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const { profile, address } = await resolveUsernameToProfile(username);

  // Determine the display name with smart priority
  let displayName = username;
  if (profile) {
    displayName = profile.farcasterProfile?.username || 
                 profile.ensName || 
                 profile.baseName || 
                 (!isAddress(username) ? username : null) ||
                 `${address?.slice(0, 6)}...${address?.slice(-4)}`;
  } else if (isAddress(username)) {
    displayName = `${username.slice(0, 6)}...${username.slice(-4)}`;
  }

  const title = `dstealth: privately pay, message and view content from ${displayName}`;
  const description = profile?.bio || 
                     profile?.farcasterProfile?.bio || 
                     `View ${displayName}'s Web3 profile, send private payments, and access premium content on dstealth.`;
  
  // Use the user's actual avatar with smart priority
  const imageUrl = profile?.farcasterProfile?.avatar || 
                   profile?.avatar || 
                   (address ? `https://api.ensideas.com/v1/avatar/${address}` : 
                   `https://api.ensideas.com/v1/avatar/${username}`);

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const profileUrl = `${baseUrl}/user/${username}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: profileUrl,
      siteName: 'dstealth',
      images: [
        {
          url: imageUrl,
          width: 400,
          height: 400,
          alt: `${displayName}'s profile picture`,
        },
      ],
      type: 'profile',
    },
    twitter: {
      card: 'summary',
      title,
      description,
      images: [imageUrl],
      creator: '@dstealth_app',
    },
    alternates: {
      canonical: profileUrl,
    },
    other: {
      // New Farcaster Mini Apps format
      'fc:frame': JSON.stringify({
        version: "next",
        imageUrl: imageUrl,
        button: {
          title: `Open ${displayName}'s Profile`,
          action: {
            type: "launch_frame",
            url: profileUrl,
            name: `${displayName} - dstealth`,
            splashImageUrl: imageUrl,
            splashBackgroundColor: "#000000"
          }
        }
      }),
    },
  };
}

export default function UserUsernameLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
} 