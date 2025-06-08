import { NextRequest, NextResponse } from 'next/server';

interface ContentData {
  id: string;
  name: string;
  description: string;
  contentType: string;
  pricing: Array<{amount: number, currency: string, network?: string}>;
  accessEndpoint: string;
  coverUrl?: string;
  paymentRecipient: string;
  metadata?: {
    size?: number;
    duration?: number;
    format?: string;
  };
  creator?: {
    username: string;
    address: string;
    avatar?: string;
  };
}

// Mock content database - replace with real database
const contentDatabase: Record<string, ContentData> = {
  'article-001': {
    id: 'article-001',
    name: 'Advanced DeFi Strategies',
    description: 'Deep dive into yield farming and liquidity mining techniques with real-world examples and risk assessment frameworks.',
    contentType: 'article',
    pricing: [{ amount: 0.01, currency: 'USDC', network: 'base-sepolia' }],
    accessEndpoint: '/api/content/article-001/access',
    coverUrl: 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=400',
    paymentRecipient: '0x87b880b8623f328a378788ffa93dd2d2e01e465d',
    metadata: {
      size: 15000,
      format: 'markdown',
    },
    creator: {
      username: 'alice',
      address: '0x1234567890123456789012345678901234567890',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alice'
    }
  },
  'video-002': {
    id: 'video-002',
    name: 'Web3 Development Masterclass',
    description: 'Complete guide to building dApps on Base with hands-on tutorials and best practices.',
    contentType: 'video',
    pricing: [{ amount: 0.05, currency: 'USDC', network: 'base-sepolia' }],
    accessEndpoint: '/api/content/video-002/access',
    coverUrl: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=400',
    paymentRecipient: '0x87b880b8623f328a378788ffa93dd2d2e01e465d',
    metadata: {
      size: 500000000,
      duration: 3600,
      format: 'mp4',
    },
    creator: {
      username: 'bob',
      address: '0x9876543210987654321098765432109876543210',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=bob'
    }
  },
  'audio-003': {
    id: 'audio-003',
    name: 'Crypto Market Analysis Podcast',
    description: 'Weekly insights on market trends, opportunities, and risk management strategies.',
    contentType: 'audio',
    pricing: [{ amount: 0.02, currency: 'USDC', network: 'base-sepolia' }],
    accessEndpoint: '/api/content/audio-003/access',
    coverUrl: 'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?w=400',
    paymentRecipient: '0x87b880b8623f328a378788ffa93dd2d2e01e465d',
    metadata: {
      size: 50000000,
      duration: 2700,
      format: 'mp3',
    },
    creator: {
      username: 'carol',
      address: '0x1111222233334444555566667777888899990000',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=carol'
    }
  },
  'premium-insights': {
    id: 'premium-insights',
    name: 'FluidKey Privacy Insights',
    description: 'Exclusive analysis of privacy trends in Web3, stealth addresses, and FKS token metrics.',
    contentType: 'article',
    pricing: [{ amount: 0.03, currency: 'USDC', network: 'base-sepolia' }],
    accessEndpoint: '/api/content/premium-insights/access',
    coverUrl: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400',
    paymentRecipient: '0x87b880b8623f328a378788ffa93dd2d2e01e465d',
    metadata: {
      size: 12000,
      format: 'markdown',
    },
    creator: {
      username: 'fluidkey',
      address: '0xaaabbbcccdddeeefffaaabbbcccdddeeefffaaab',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=fluidkey'
    }
  }
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contentId } = await params;
    
    // Look up content in database
    const content = contentDatabase[contentId];
    
    if (!content) {
      return NextResponse.json(
        { error: 'Content not found' },
        { status: 404 }
      );
    }

    // Return content metadata
    return NextResponse.json(content);

  } catch (error) {
    console.error('Error fetching content:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 