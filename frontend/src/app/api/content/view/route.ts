import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

// Redis client setup
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

interface X402Content {
  id: string;
  title: string;
  description: string;
  contentType: string;
  price: string;
  currency: string;
  previewUrl?: string;
  contentUrl?: string;
  requiresPayment: boolean;
  metadata: {
    author?: string;
    createdAt: string;
    fileSize?: string;
    mimeType?: string;
  };
}

function corsHeaders(response: NextResponse) {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Payment');
  return response;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const uri = searchParams.get('uri');
    
    if (!uri) {
      return corsHeaders(
        NextResponse.json({ error: 'URI parameter is required' }, { status: 400 })
      );
    }

    console.log('📖 Content view request for URI:', uri);

    let content: X402Content;

    if (uri.startsWith('x402://')) {
      content = await handleX402Uri(uri);
    } else if (uri.includes('proxy402.com/')) {
      content = await handleProxy402Url(uri);
    } else {
      return corsHeaders(
        NextResponse.json({ error: 'Unsupported URI format' }, { status: 400 })
      );
    }

    return corsHeaders(NextResponse.json(content));

  } catch (error) {
    console.error('Content view error:', error);
    return corsHeaders(
      NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to load content' },
        { status: 500 }
      )
    );
  }
}

async function handleX402Uri(uri: string): Promise<X402Content> {
  try {
    // Extract content ID from X402 URI
    // Format: x402://domain/content/contentId
    const urlParts = uri.replace('x402://', '').split('/');
    const contentId = urlParts[urlParts.length - 1];
    
    console.log('📄 Processing X402 content ID:', contentId);

    // Try to get stored content from Redis first
    const storedContent = await redis.get(`x402:content:${contentId}`);
    
    if (storedContent) {
      console.log('📦 Found stored X402 content in Redis');
      const content = typeof storedContent === 'string' ? JSON.parse(storedContent) : storedContent;
      
      return {
        id: contentId,
        title: content.name || content.title || `X402 Content ${contentId.substring(0, 8)}`,
        description: content.description || 'Protected X402 content',
        contentType: content.contentType || content.content_type || 'text',
        price: content.pricing?.[0]?.amount?.toString() || '0.01',
        currency: content.pricing?.[0]?.currency || 'USDC',
        requiresPayment: true,
        contentUrl: content.accessEndpoint || content.access?.endpoint,
        metadata: {
          author: content.creator || content.paymentRecipient || 'Anonymous',
          createdAt: content.created_at || new Date().toISOString(),
          fileSize: content.file_info?.size ? `${content.file_info.size} bytes` : 'Unknown',
          mimeType: content.file_info?.type || content.content_type || 'text/plain'
        }
      };
    }

    // If not in Redis, try localStorage-style lookup via API
    const metadataResponse = await fetch(`${process.env.NEXT_PUBLIC_URL}/api/x402/info/${contentId}`);
    
    if (metadataResponse.ok) {
      const metadata = await metadataResponse.json();
      console.log('📋 Got X402 metadata from API');
      
      // Store in Redis for future requests
      await redis.set(`x402:content:${contentId}`, JSON.stringify(metadata), { ex: 3600 }); // 1 hour cache
      
      return {
        id: contentId,
        title: metadata.name || `X402 Content ${contentId.substring(0, 8)}`,
        description: metadata.description || 'Protected X402 content',
        contentType: metadata.content_type || 'text',
        price: metadata.pricing?.[0]?.amount?.toString() || '0.01',
        currency: metadata.pricing?.[0]?.currency || 'USDC',
        requiresPayment: true,
        contentUrl: metadata.access?.endpoint,
        metadata: {
          author: metadata.issuer || 'Anonymous',
          createdAt: metadata.created || new Date().toISOString(),
          fileSize: metadata.file_info?.size ? `${metadata.file_info.size} bytes` : 'Unknown',
          mimeType: metadata.file_info?.type || 'text/plain'
        }
      };
    }

    // Fallback to mock content
    console.log('⚠️ Using fallback mock content for X402');
    return createMockX402Content(contentId);

  } catch (error) {
    console.error('X402 processing error:', error);
    throw new Error('Failed to process X402 URI');
  }
}

async function handleProxy402Url(url: string): Promise<X402Content> {
  try {
    console.log('🌐 Processing Proxy402 URL:', url);

    // Extract content ID from proxy402 URL
    const urlObj = new URL(url);
    const contentId = urlObj.pathname.split('/').pop() || 'unknown';
    
    // Try to get cached content from Redis
    const cachedContent = await redis.get(`proxy402:content:${contentId}`);
    
    if (cachedContent) {
      console.log('📦 Found cached Proxy402 content');
      const content = typeof cachedContent === 'string' ? JSON.parse(cachedContent) : cachedContent;
      return content;
    }

    // Check the proxy402 URL for payment requirements
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (response.status === 402) {
      // Extract payment requirements
      const paymentRequiredHeader = response.headers.get('X-Accept-Payment');
      let paymentRequirements = null;
      
      try {
        if (paymentRequiredHeader) {
          const decoded = Buffer.from(paymentRequiredHeader, 'base64').toString('utf-8');
          paymentRequirements = JSON.parse(decoded);
        }
      } catch (e) {
        console.log('Could not parse payment requirements');
      }

      const contentData: X402Content = {
        id: contentId,
        title: `Proxy402 Content ${contentId.substring(0, 8)}`,
        description: 'Content protected by proxy402.com using X402 protocol',
        contentType: 'unknown',
        price: paymentRequirements?.amount || '0.01',
        currency: paymentRequirements?.asset || 'USD',
        requiresPayment: true,
        contentUrl: url,
        metadata: {
          author: 'Proxy402 Creator',
          createdAt: new Date().toISOString(),
          fileSize: response.headers.get('content-length') || 'Unknown',
          mimeType: response.headers.get('content-type') || 'application/octet-stream'
        }
      };

      // Cache for future requests
      await redis.set(`proxy402:content:${contentId}`, JSON.stringify(contentData), { ex: 1800 }); // 30 min cache
      
      return contentData;
    }

    // If accessible without payment, return basic info
    return {
      id: contentId,
      title: 'Accessible Proxy402 Content',
      description: 'This content is accessible without payment',
      contentType: 'accessible',
      price: '0',
      currency: 'Free',
      requiresPayment: false,
      contentUrl: url,
      metadata: {
        author: 'Public Creator',
        createdAt: new Date().toISOString(),
        fileSize: 'Unknown',
        mimeType: response.headers.get('content-type') || 'text/html'
      }
    };

  } catch (error) {
    console.error('Proxy402 processing error:', error);
    throw new Error('Failed to process Proxy402 URL');
  }
}

function createMockX402Content(contentId: string): X402Content {
  return {
    id: contentId,
    title: `X402 Content ${contentId.substring(0, 8)}`,
    description: 'Premium content protected by X402 payment protocol with real USDC payments',
    contentType: 'text',
    price: '0.01',
    currency: 'USDC',
    requiresPayment: true,
    contentUrl: `${process.env.NEXT_PUBLIC_URL}/api/x402/test`,
    metadata: {
      author: 'X402 Creator',
      createdAt: new Date().toISOString(),
      fileSize: '2048 bytes',
      mimeType: 'text/html'
    }
  };
}

export async function OPTIONS(request: NextRequest) {
  return corsHeaders(new NextResponse(null, { status: 200 }));
} 