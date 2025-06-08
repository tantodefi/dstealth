import { NextRequest, NextResponse } from 'next/server';
import { createX402ShareableURLs } from '@/lib/x402-frame';

interface X402Content {
  id: string;
  name: string;
  description?: string;
  contentType: string;
  pricing: Array<{amount: number, currency: string, network?: string}>;
  accessEndpoint: string;
  coverUrl?: string;
  paymentRecipient: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ contentId: string }> }
) {
  const { contentId } = await params;

  try {
    // For demo, we'll use mock data - in production, fetch from your database
    const mockContent: X402Content = {
      id: contentId,
      name: "Premium X402 Content",
      description: "Exclusive content available via X402 payment protocol",
      contentType: "text",
      pricing: [{ amount: 0.01, currency: "USDC", network: "base-sepolia" }],
      accessEndpoint: `https://example.com/content/${contentId}`,
      coverUrl: "",
      paymentRecipient: "0x87b880b8623f328a378788ffa93dd2d2e01e465d"
    };

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
    const urls = createX402ShareableURLs(contentId);
    
    // Generate dynamic OG image URL
    const ogImageUrl = `${baseUrl}/api/x402/og-image/${contentId}`;
    
    // Farcaster Frame HTML
    const frameHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${mockContent.name} - X402 Content</title>
    
    <!-- Open Graph Meta Tags -->
    <meta property="og:title" content="${mockContent.name}" />
    <meta property="og:description" content="${mockContent.description || 'Exclusive X402 content'}" />
    <meta property="og:image" content="${ogImageUrl}" />
    <meta property="og:url" content="${urls.frame}" />
    <meta property="og:type" content="website" />
    
    <!-- Twitter Card Meta Tags -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${mockContent.name}" />
    <meta name="twitter:description" content="${mockContent.description || 'Exclusive X402 content'}" />
    <meta name="twitter:image" content="${ogImageUrl}" />
    
    <!-- Farcaster Frame Meta Tags -->
    <meta property="fc:frame" content="vNext" />
    <meta property="fc:frame:image" content="${ogImageUrl}" />
    <meta property="fc:frame:image:aspect_ratio" content="1.91:1" />
    <meta property="fc:frame:button:1" content="💳 Pay ${mockContent.pricing[0].amount} ${mockContent.pricing[0].currency}" />
    <meta property="fc:frame:button:1:action" content="post" />
    <meta property="fc:frame:button:1:target" content="${baseUrl}/api/x402/frame/${contentId}/pay" />
    <meta property="fc:frame:button:2" content="👁️ Preview" />
    <meta property="fc:frame:button:2:action" content="link" />
    <meta property="fc:frame:button:2:target" content="${urls.viewer}" />
    <meta property="fc:frame:post_url" content="${baseUrl}/api/x402/frame/${contentId}/pay" />
    
    <!-- X402 Protocol Meta Tags -->
    <meta property="x402:uri" content="x402://${baseUrl.replace('https://', '').replace('http://', '')}/content/${contentId}" />
    <meta property="x402:price" content="${mockContent.pricing[0].amount}" />
    <meta property="x402:currency" content="${mockContent.pricing[0].currency}" />
    <meta property="x402:network" content="${mockContent.pricing[0].network || 'base-sepolia'}" />
    <meta property="x402:recipient" content="${mockContent.paymentRecipient}" />
</head>
<body>
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1>${mockContent.name}</h1>
        <p>${mockContent.description || 'Exclusive X402 content available for purchase'}</p>
        <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Price:</strong> ${mockContent.pricing[0].amount} ${mockContent.pricing[0].currency}</p>
            <p><strong>Network:</strong> ${mockContent.pricing[0].network || 'base-sepolia'}</p>
            <p><strong>Content Type:</strong> ${mockContent.contentType}</p>
        </div>
        <div style="margin-top: 30px;">
            <a href="${urls.viewer}" style="background: #1da1f2; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-right: 10px;">
                View in X402 Viewer
            </a>
            <a href="${urls.warpcast}" style="background: #8b5cf6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Share on Warpcast
            </a>
        </div>
    </div>
</body>
</html>`;

    return new NextResponse(frameHtml, {
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'public, max-age=300, s-maxage=300', // Cache for 5 minutes
      },
    });
  } catch (error) {
    console.error('Error generating X402 Frame:', error);
    return NextResponse.json(
      { error: 'Failed to generate Frame' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ contentId: string }> }
) {
  const { contentId } = await params;
  try {
    const body = await request.json();
    
    // Handle Frame button interactions
    console.log('Frame interaction:', { contentId, body });
    
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
    const urls = createX402ShareableURLs(contentId);
    
    // Redirect to payment or viewer
    const redirectHtml = `<!DOCTYPE html>
<html>
<head>
    <meta property="fc:frame" content="vNext" />
    <meta property="fc:frame:image" content="${baseUrl}/api/x402/og-image/${contentId}" />
    <meta property="fc:frame:button:1" content="✅ Opening X402 Viewer..." />
    <meta property="fc:frame:button:1:action" content="link" />
    <meta property="fc:frame:button:1:target" content="${urls.viewer}" />
</head>
<body>
    <p>Redirecting to X402 Viewer...</p>
    <script>
        window.location.href = "${urls.viewer}";
    </script>
</body>
</html>`;

    return new NextResponse(redirectHtml, {
      headers: {
        'Content-Type': 'text/html',
      },
    });
  } catch (error) {
    console.error('Error handling Frame interaction:', error);
    return NextResponse.json(
      { error: 'Failed to handle Frame interaction' },
      { status: 500 }
    );
  }
} 