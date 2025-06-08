import { Metadata } from 'next';
import { notFound } from 'next/navigation';

interface LayoutProps {
  params: Promise<{
    address: string;
  }>;
  children: React.ReactNode;
}

// Generate OG metadata for Farcaster Frames
export async function generateMetadata({ params }: { params: Promise<{ address: string }> }): Promise<Metadata> {
  const { address } = await params;
  
  // Validate Ethereum address format
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return {
      title: 'Invalid Profile',
      description: 'Invalid user profile address'
    };
  }

  try {
    // Try to fetch user data for metadata
    let username = `${address.slice(0, 6)}...${address.slice(-4)}`;
    let bio = 'Web3 Profile';
    let avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${address}`;

    // Try to get ENS name
    try {
      const ensRes = await fetch(`https://api.ensdata.net/${address}`);
      if (ensRes.ok) {
        const ensData = await ensRes.json();
        if (ensData.ens) {
          username = ensData.ens;
        }
      }
    } catch (error) {
      console.warn('Failed to fetch ENS data:', error);
    }

    // Try to get Base name
    try {
      const baseNameRes = await fetch(`https://api.basename.app/v1/names?address=${address}`);
      if (baseNameRes.ok) {
        const baseNameData = await baseNameRes.json();
        if (baseNameData.length > 0) {
          username = baseNameData[0].name;
        }
      }
    } catch (error) {
      console.warn('Failed to fetch Base name:', error);
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://localhost:3000';
    
    return {
      title: `${username} - X402 Profile`,
      description: `Check out ${username}'s X402 profile and content links`,
      openGraph: {
        title: `${username} - X402 Profile`,
        description: `${bio} - View and purchase content from ${username}`,
        url: `${baseUrl}/u/${address}`,
        siteName: 'X402 Mini App',
        images: [
          {
            url: avatar,
            width: 400,
            height: 400,
            alt: `${username}'s avatar`,
          },
        ],
        locale: 'en_US',
        type: 'website',
      },
      twitter: {
        card: 'summary',
        title: `${username} - X402 Profile`,
        description: `${bio} - View and purchase content from ${username}`,
        images: [avatar],
      },
      other: {
        // Farcaster Frame metadata
        'fc:frame': 'vNext',
        'fc:frame:image': avatar,
        'fc:frame:image:aspect_ratio': '1:1',
        'fc:frame:button:1': 'View Profile',
        'fc:frame:button:1:action': 'link',
        'fc:frame:button:1:target': `${baseUrl}/u/${address}`,
        'fc:frame:button:2': 'Buy Content',
        'fc:frame:button:2:action': 'link',
        'fc:frame:button:2:target': `${baseUrl}/u/${address}?action=pay`,
        // Additional frame metadata
        'og:image': avatar,
        'og:image:width': '400',
        'og:image:height': '400',
      },
    };
  } catch (error) {
    console.error('Error generating metadata:', error);
    const fallbackUsername = `${address.slice(0, 6)}...${address.slice(-4)}`;
    return {
      title: `${fallbackUsername} - X402 Profile`,
      description: `Check out ${fallbackUsername}'s X402 profile`,
    };
  }
}

export default async function UserProfileLayout({ children, params }: LayoutProps) {
  const { address } = await params;
  
  // Validate address format
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    notFound();
  }

  return <>{children}</>;
} 