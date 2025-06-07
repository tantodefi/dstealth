import { NextResponse } from 'next/server';

function corsHeaders(response: Response) {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
}

export async function OPTIONS() {
  return corsHeaders(new NextResponse(null, { status: 200 }));
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: contentId } = await params;
    
    if (!contentId) {
      return corsHeaders(
        NextResponse.json({ error: 'Content ID is required' }, { status: 400 })
      );
    }

    // In production, you'd fetch this from your database
    // For now, we'll return enhanced mock data with production USDC pricing
    const metadata = {
      version: "1.0",
      name: `Premium Content ${contentId.substring(0, 8)}`,
      description: "Protected content accessible via X402 payment using real USDC on Base Sepolia",
      content_type: "text",
      pricing: [
        {
          amount: 0.01,
          currency: "USDC",
          network: "base-sepolia",
          asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
          payTo: "0x706AfBE28b1e1CB40cd552Fa53A380f658e38332",
          maxAmountRequired: "10000", // 0.01 USDC in micro units
          extra: {
            name: "USDC",
            decimals: 6
          }
        }
      ],
      access: {
        endpoint: `${getBaseUrl()}/api/x402/test`,
        method: "GET",
        authentication: {
          protocol: "X402",
          header: "X-Payment",
          format: "base64 encoded payment payload"
        }
      },
      file_info: {
        size: 2048,
        type: "text/html"
      },
      x402_requirements: {
        accepts: [
          {
            scheme: "exact",
            network: "base-sepolia",
            maxAmountRequired: "10000",
            payTo: "0x706AfBE28b1e1CB40cd552Fa53A380f658e38332",
            asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
            extra: {
              name: "USDC",
              decimals: 6
            }
          }
        ]
      },
      created: new Date().toISOString(),
      expires: null,
      content_id: contentId,
      issuer: "dstealth.vercel.app"
    };

    return corsHeaders(NextResponse.json(metadata));
    
  } catch (error) {
    console.error('X402 info error:', error);
    return corsHeaders(
      NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to fetch content info' },
        { status: 500 }
      )
    );
  }
}

function getBaseUrl(): string {
  return process.env.NODE_ENV === 'production' 
    ? 'https://dstealth.vercel.app'
    : 'http://localhost:3000';
}

// TODO: Implement this function with your database
async function getX402Metadata(contentId: string) {
  // Handle test content
  if (contentId === 'test-content-123') {
    return {
      version: "1.0",
      name: "Test Premium Content",
      description: "This is a test X402:// URI to demonstrate the payment-gated content system with real USDC",
      content_type: "text",
      pricing: [
        {
          amount: 0.01,
          currency: "USDC",
          network: "base-sepolia"
        }
      ],
      access: {
        endpoint: `${getBaseUrl()}/api/x402/test`,
        method: "GET",
        authentication: {
          protocol: "X402",
          header: "X-Payment",
          format: "base64 encoded payment payload"
        }
      },
      file_info: {
        size: 1024,
        type: "text/plain"
      }
    };
  }
  
  // Fetch from your database - you'll need to implement this
  console.log('Fetching X402 metadata for:', contentId);
  
  // Return null for unknown content
  return null;
} 