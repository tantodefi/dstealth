import { NextResponse } from 'next/server';

function corsHeaders(response: Response) {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Payment');
  return response;
}

export async function OPTIONS() {
  return corsHeaders(new NextResponse(null, { status: 200 }));
}

export async function POST(request: Request) {
  try {
    const { url } = await request.json();
    
    if (!url || !url.includes('proxy402.com/')) {
      return corsHeaders(
        NextResponse.json({ error: 'Invalid proxy402.com URL' }, { status: 400 })
      );
    }

    // Fetch the proxy402 URL to get X402 payment requirements
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (response.status === 402) {
      // Extract X402 payment requirements
      const paymentRequiredHeader = response.headers.get('X-Accept-Payment');
      const contentType = response.headers.get('content-type');
      const contentLength = response.headers.get('content-length');
      
      let paymentRequirements = null;
      try {
        if (paymentRequiredHeader) {
          // X402 protocol uses X-Accept-Payment header with base64 encoded JSON
          const decoded = Buffer.from(paymentRequiredHeader, 'base64').toString('utf-8');
          paymentRequirements = JSON.parse(decoded);
        }
      } catch (e) {
        console.error('Failed to parse X402 payment requirements:', e);
      }

      // Extract content info from URL or headers
      const urlPath = new URL(url).pathname;
      const contentName = urlPath.split('/').pop() || 'Protected Content';
      
      // Create metadata structure
      const metadata = {
        version: "1.0",
        name: contentName,
        description: `Content protected by proxy402.com using X402 protocol`,
        content_type: getContentTypeFromHeader(contentType),
        pricing: extractPricingFromX402(paymentRequirements),
        access: {
          endpoint: url,
          method: "GET",
          authentication: {
            protocol: "X402",
            header: "X-Payment",
            format: "base64 encoded payment payload"
          }
        },
        x402_requirements: paymentRequirements,
        file_info: contentLength ? {
          size: parseInt(contentLength),
          type: contentType || 'unknown'
        } : undefined
      };

      return corsHeaders(NextResponse.json({
        requiresPayment: true,
        metadata,
        originalUrl: url,
        protocol: 'x402'
      }));
      
    } else if (response.ok) {
      // Content is accessible without payment
      return corsHeaders(NextResponse.json({
        requiresPayment: false,
        contentUrl: url,
        metadata: {
          version: "1.0",
          name: "Accessible Content",
          content_type: getContentTypeFromHeader(response.headers.get('content-type')),
          access: {
            endpoint: url,
            method: "GET",
            authentication: {
              protocol: "none",
              header: "",
              format: ""
            }
          }
        }
      }));
    } else {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
  } catch (error) {
    console.error('Proxy402 viewer error:', error);
    return corsHeaders(
      NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to process proxy402 URL' },
        { status: 500 }
      )
    );
  }
}

function getContentTypeFromHeader(contentType: string | null): string {
  if (!contentType) return 'file';
  
  if (contentType.includes('video/')) return 'video';
  if (contentType.includes('audio/')) return 'audio';
  if (contentType.includes('image/')) return 'image';
  if (contentType.includes('text/')) return 'text';
  if (contentType.includes('application/pdf')) return 'document';
  
  return 'file';
}

function extractPricingFromX402(paymentRequirements: any): Array<{amount: number, currency: string, network?: string}> {
  if (!paymentRequirements) return [{ amount: 0.01, currency: 'USD' }];
  
  try {
    // X402 payment requirements structure
    if (Array.isArray(paymentRequirements)) {
      return paymentRequirements.map(req => ({
        amount: parseFloat(req.amount || '0.01'),
        currency: req.asset || 'USD',
        network: req.network || 'unknown'
      }));
    }
    
    if (paymentRequirements.amount) {
      return [{
        amount: parseFloat(paymentRequirements.amount),
        currency: paymentRequirements.asset || 'USD',
        network: paymentRequirements.network || 'unknown'
      }];
    }
  } catch (e) {
    console.error('Failed to parse X402 pricing:', e);
  }
  
  return [{ amount: 0.01, currency: 'USD' }];
} 