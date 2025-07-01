import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { Redis } from '@upstash/redis';

// Redis client setup
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

interface X402URIRequest {
  name: string;
  description?: string;
  coverUrl?: string;
  contentType: 'text' | 'image' | 'video' | 'audio' | 'file';
  pricing: {
    amount: number;
    currency: string;
    network?: string;
  }[];
  accessEndpoint: string;
  fileUrl?: string;
  fileSize?: number;
  duration?: number;
  paymentRecipient?: string;
  fileInfo?: any;
}

interface X402Metadata {
  version: string;
  name: string;
  description?: string;
  cover_url?: string;
  content_type: string;
  pricing: {
    amount: number;
    currency: string;
    network: string;
    asset: string;
    payTo: string;
    maxAmountRequired: string;
    extra: {
      name: string;
      decimals: number;
    };
  }[];
  access: {
    endpoint: string;
    method: string;
    authentication: {
      protocol: string;
      header: string;
      format: string;
    };
  };
  file_info?: {
    size?: number;
    duration?: number;
    type?: string;
  };
  x402_requirements?: any;
  created?: string;
  contentId?: string;
  creator?: string;
}

// USDC contract addresses for different networks
const USDC_CONTRACTS = {
  'base': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  'base-sepolia': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  'ethereum': '0xA0b86a33E6413bF74d5c567F9e29C6B6d1e5A8C1',
  'polygon': '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'
};

// Default payment recipient
const DEFAULT_PAYMENT_RECIPIENT = '0x706AfBE28b1e1CB40cd552Fa53A380f658e38332';

function corsHeaders(response: NextResponse) {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      name, 
      description = '', 
      contentType = 'text', 
      pricing = [{ amount: 0.01, currency: 'USDC', network: 'base-sepolia' }],
      accessEndpoint,
      coverUrl,
      paymentRecipient, // Creator's wallet address for payments
      fileInfo
    } = body;

    if (!name || !accessEndpoint) {
      return corsHeaders(
        NextResponse.json({ error: 'Name and accessEndpoint are required' }, { status: 400 })
      );
    }

    // Use provided payment recipient or fall back to default
    const payTo = paymentRecipient || DEFAULT_PAYMENT_RECIPIENT;

    // Generate unique content ID
    const contentId = randomBytes(16).toString('hex');
    
    // Create x402:// URI following L402 pattern
    const baseUrl = process.env.NEXT_PUBLIC_URL || process.env.NEXT_PUBLIC_BASE_URL || 'https://dstealth.vercel.app';
    const domain = baseUrl.replace(/^https?:\/\//, '');
    const x402Uri = `x402://${domain}/content/${contentId}`;
    
    // Enhanced pricing with proper USDC configuration
    const enhancedPricing = pricing.map((p: { amount: number; currency?: string; network?: string }) => {
      const network = p.network || 'base-sepolia';
      const usdcContract = USDC_CONTRACTS[network as keyof typeof USDC_CONTRACTS] || USDC_CONTRACTS['base-sepolia'];
      const amountInMicroUnits = Math.floor(p.amount * 1000000); // Convert to micro units (6 decimals)
      
      return {
        amount: p.amount,
        currency: p.currency || 'USDC',
        network: network,
        asset: usdcContract,
        payTo: payTo,
        maxAmountRequired: amountInMicroUnits.toString(),
        extra: {
          name: 'USDC',
          decimals: 6
        }
      };
    });
    
    // Create X402 requirements that match proxy402.com format
    const x402Requirements = {
      accepts: enhancedPricing.map((p: { amount: number; currency: string; network: string; asset: string; payTo: string; maxAmountRequired: string; extra: { name: string; decimals: number } }) => ({
        scheme: 'exact',
        network: p.network,
        maxAmountRequired: p.maxAmountRequired,
        payTo: p.payTo,
        asset: p.asset,
        extra: p.extra
      }))
    };
    
    // Create L402-style metadata structure
    const metadata: X402Metadata = {
      version: "1.0",
      name: name,
      description: description,
      cover_url: coverUrl,
      content_type: contentType,
      pricing: enhancedPricing,
      access: {
        endpoint: accessEndpoint,
        method: "GET",
        authentication: {
          protocol: "X402",
          header: "X-Payment",
          format: "base64 encoded payment payload"
        }
      },
      file_info: fileInfo,
      x402_requirements: x402Requirements,
      created: new Date().toISOString(),
      contentId: contentId,
      creator: payTo
    };

    // 🎯 Store metadata in Redis database (persistent storage)
    await storeX402Metadata(contentId, metadata, payTo);
    
    const viewerUrl = `${baseUrl}/viewer?uri=${encodeURIComponent(x402Uri)}`;
    
    console.log('✅ X402 content created and stored:', {
      contentId,
      name,
      price: enhancedPricing[0].amount,
      creator: payTo
    });
    
    return corsHeaders(NextResponse.json({
      success: true,
      contentId,
      uri: x402Uri,
      x402_uri: x402Uri, // Add this for compatibility
      metadata,
      viewerUrl,
      accessEndpoint,
      pricing: enhancedPricing,
      x402Requirements
    }));
    
  } catch (error) {
    console.error('X402 generation error:', error);
    return corsHeaders(
      NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to generate X402 URI' },
        { status: 500 }
      )
    );
  }
}

// Store X402 metadata in Redis with multiple keys for different access patterns
async function storeX402Metadata(contentId: string, metadata: X402Metadata, creator: string) {
  try {
    const now = new Date().toISOString();
    
    // Primary content storage
    const contentKey = `x402:content:${contentId}`;
    await redis.set(contentKey, JSON.stringify(metadata), { ex: 86400 * 30 }); // 30 days
    
    // Index by creator
    const creatorKey = `x402:creator:${creator.toLowerCase()}`;
    const creatorContent = await redis.get(creatorKey);
    let creatorList: string[] = [];
    
    if (creatorContent) {
      creatorList = typeof creatorContent === 'string' ? JSON.parse(creatorContent) : creatorContent;
    }
    
    creatorList.unshift(contentId); // Add to front
    creatorList = creatorList.slice(0, 100); // Keep only last 100 items
    
    await redis.set(creatorKey, JSON.stringify(creatorList), { ex: 86400 * 30 }); // 30 days
    
    // Global content index
    await redis.zadd('x402:content:index', { score: Date.now(), member: contentId });
    
    // Content stats initialization
    const statsKey = `content:stats:${contentId}`;
    const initialStats = {
      contentId,
      creator,
      createdAt: now,
      totalPurchases: 0,
      totalRevenue: 0,
      uniquePayers: [],
      lastPurchase: null,
      viewCount: 0
    };
    
    await redis.set(statsKey, JSON.stringify(initialStats), { ex: 86400 * 90 }); // 90 days
    
    // Update creator stats
    const creatorStatsKey = `creator:stats:${creator.toLowerCase()}`;
    const creatorStats = await redis.get(creatorStatsKey);
    
    let stats = {
      totalContent: 0,
      totalRevenue: 0,
      totalPurchases: 0,
      lastCreated: now
    };
    
    if (creatorStats) {
      const existing = typeof creatorStats === 'string' ? JSON.parse(creatorStats) : creatorStats;
      stats = {
        totalContent: (existing.totalContent || 0) + 1,
        totalRevenue: existing.totalRevenue || 0,
        totalPurchases: existing.totalPurchases || 0,
        lastCreated: now
      };
    } else {
      stats.totalContent = 1;
    }
    
    await redis.set(creatorStatsKey, JSON.stringify(stats), { ex: 86400 * 30 }); // 30 days
    
    console.log('📦 X402 metadata stored in Redis:', { contentId, creator });
    
  } catch (error) {
    console.error('❌ Failed to store X402 metadata in Redis:', error);
    throw error;
  }
}

export async function OPTIONS(request: Request) {
  return corsHeaders(new NextResponse(null, { status: 200 }));
} 