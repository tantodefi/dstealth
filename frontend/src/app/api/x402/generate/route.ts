import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';

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
}

// USDC contract addresses for different networks
const USDC_CONTRACTS = {
  'base': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Base mainnet USDC
  'base-sepolia': '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // Base Sepolia USDC
  'ethereum': '0xA0b86a33E6441c8e96d3B98a80CB0Bb7d8A3B1b7', // Mainnet USDC (fallback)
};

// Default payment recipient - this is where USDC payments will be sent
// You can override this with NEXT_PUBLIC_DEFAULT_PAYMENT_RECIPIENT environment variable
const DEFAULT_PAYMENT_RECIPIENT = process.env.NEXT_PUBLIC_DEFAULT_PAYMENT_RECIPIENT || '0x706AfBE28b1e1CB40cd552Fa53A380f658e38332';

function corsHeaders(response: Response) {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
}

export async function OPTIONS() {
  return corsHeaders(new NextResponse(null, { status: 200 }));
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
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://dstealth.vercel.app';
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
      x402_requirements: x402Requirements
    };

    // Store metadata (in production, use a proper database)
    // For now, we'll include it in the response for the frontend to handle
    
    const viewerUrl = `${baseUrl}/viewer?uri=${encodeURIComponent(x402Uri)}`;
    
    return corsHeaders(NextResponse.json({
      success: true,
      contentId,
      uri: x402Uri,
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

function generateContentId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function getBaseUrl(): string {
  return process.env.NODE_ENV === 'production' 
    ? 'https://dstealth.vercel.app'
    : 'http://localhost:3000';
}

function getHost(): string {
  return process.env.NODE_ENV === 'production' 
    ? 'dstealth.vercel.app'
    : 'localhost:3000';
}

// TODO: Implement these functions with your database
async function storeX402Metadata(contentId: string, metadata: X402Metadata, fileUrl?: string) {
  // Store in your database - you'll need to implement this
  console.log('Storing X402 metadata:', { contentId, metadata, fileUrl });
} 