import { NextRequest, NextResponse } from 'next/server';
import { createX402ShareableURLs } from '@/lib/x402-frame';
import { env } from '@/lib/env';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Extract Farcaster Frame data
    const { untrustedData, trustedData } = body;
    const buttonIndex = untrustedData?.buttonIndex;
    const fid = untrustedData?.fid;
    const messageHash = untrustedData?.messageHash;
    const timestamp = untrustedData?.timestamp;
    const url = untrustedData?.url;
    
    console.log('X402 Frame action received:', {
      buttonIndex,
      fid,
      messageHash,
      timestamp,
      url: url?.substring(0, 100) + '...'
    });

    // Extract content ID from the URL or Frame data
    let contentId: string | null = null;
    
    // Try to extract from URL path
    if (url) {
      const urlMatch = url.match(/\/x402\/([a-zA-Z0-9]+)/);
      if (urlMatch) {
        contentId = urlMatch[1];
      }
    }
    
    // Try to extract from trusted data if available
    if (!contentId && trustedData?.messageBytes) {
      // You could implement Frame message verification here
      // For now, we'll use a simpler approach
    }

    if (!contentId) {
      return NextResponse.json({
        type: 'frame',
        image: `${env.NEXT_PUBLIC_URL}/api/og/x402/error?message=Invalid+content+ID`,
        buttons: [
          {
            label: "🏠 Go Home",
            action: "link",
            target: env.NEXT_PUBLIC_URL
          }
        ]
      });
    }

    // Handle different button actions
    switch (buttonIndex) {
      case 1:
        // Button 1: "Pay & Access" - redirect to viewer
        const shareUrls = createX402ShareableURLs(contentId);
        return NextResponse.json({
          type: 'frame',
          image: `${env.NEXT_PUBLIC_URL}/api/og/x402/${contentId}?action=redirecting`,
          buttons: [
            {
              label: "🔓 Open Payment Page",
              action: "link", 
              target: shareUrls.viewer
            },
            {
              label: "📋 Copy X402 URL",
              action: "post"
            }
          ]
        });

      case 2:
        // Button 2: "Copy X402 URL" - provide copyable URL
        const urls = createX402ShareableURLs(contentId);
        return NextResponse.json({
          type: 'frame',
          image: `${env.NEXT_PUBLIC_URL}/api/og/x402/${contentId}?action=copy`,
          buttons: [
            {
              label: "💳 Pay & Access Content",
              action: "link",
              target: urls.viewer
            },
            {
              label: "🔗 Share on Warpcast", 
              action: "link",
              target: urls.warpcast
            }
          ]
        });

      default:
        // Default action - show content info
        return NextResponse.json({
          type: 'frame',
          image: `${env.NEXT_PUBLIC_URL}/api/og/x402/${contentId}`,
          buttons: [
            {
              label: "💳 Pay & Access Content",
              action: "link",
              target: createX402ShareableURLs(contentId).viewer
            },
            {
              label: "🔗 Copy X402 URL",
              action: "post"
            }
          ]
        });
    }

  } catch (error) {
    console.error('X402 Frame action error:', error);
    
    return NextResponse.json({
      type: 'frame',
      image: `${env.NEXT_PUBLIC_URL}/api/og/x402/error?message=Server+error`,
      buttons: [
        {
          label: "🏠 Go Home",
          action: "link",
          target: env.NEXT_PUBLIC_URL
        }
      ]
    });
  }
}

// Handle OPTIONS for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
} 