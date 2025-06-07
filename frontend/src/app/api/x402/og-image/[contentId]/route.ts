import { NextRequest, NextResponse } from 'next/server';

interface X402Content {
  id: string;
  name: string;
  description?: string;
  contentType: string;
  pricing: Array<{amount: number, currency: string, network?: string}>;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { contentId: string } }
) {
  try {
    const { contentId } = params;
    
    // For demo, we'll use mock data - in production, fetch from your database
    const mockContent: X402Content = {
      id: contentId,
      name: "Premium X402 Content",
      description: "Exclusive content available via X402 payment protocol",
      contentType: "text",
      pricing: [{ amount: 0.01, currency: "USDC", network: "base-sepolia" }]
    };

    // Truncate long names and descriptions for display
    const displayName = mockContent.name.length > 40 
      ? mockContent.name.substring(0, 37) + '...'
      : mockContent.name;
    
    const displayDescription = (mockContent.description || '').length > 80
      ? (mockContent.description || '').substring(0, 77) + '...'
      : (mockContent.description || 'Exclusive X402 content');

    const price = mockContent.pricing[0];
    const network = price.network || 'base-sepolia';
    const networkColor = network === 'base' ? '#0052FF' : '#FF6B35';
    
    // Generate SVG image
    const svg = `
<svg width="1200" height="630" viewBox="0 0 1200 630" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Background Gradient -->
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a1a2e;stop-opacity:1" />
      <stop offset="50%" style="stop-color:#16213e;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#0f3460;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="cardBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#ffffff;stop-opacity:0.1" />
      <stop offset="100%" style="stop-color:#ffffff;stop-opacity:0.05" />
    </linearGradient>
  </defs>
  
  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bg)"/>
  
  <!-- X402 Logo/Brand -->
  <g transform="translate(60, 50)">
    <rect width="80" height="80" rx="20" fill="#8b5cf6"/>
    <text x="40" y="55" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="32" font-weight="bold">X4</text>
    <text x="40" y="75" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="16">02</text>
  </g>
  
  <!-- Main Content Card -->
  <rect x="60" y="160" width="1080" height="320" rx="24" fill="url(#cardBg)" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>
  
  <!-- Content Type Badge -->
  <rect x="90" y="190" width="120" height="32" rx="16" fill="${networkColor}"/>
  <text x="150" y="210" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="14" font-weight="600">${mockContent.contentType.toUpperCase()}</text>
  
  <!-- Title -->
  <text x="90" y="260" fill="white" font-family="Arial, sans-serif" font-size="36" font-weight="bold">${displayName}</text>
  
  <!-- Description -->
  <text x="90" y="300" fill="rgba(255,255,255,0.8)" font-family="Arial, sans-serif" font-size="20">${displayDescription}</text>
  
  <!-- Price Section -->
  <g transform="translate(90, 340)">
    <rect width="200" height="60" rx="12" fill="rgba(139, 92, 246, 0.2)" stroke="#8b5cf6" stroke-width="2"/>
    <text x="20" y="25" fill="#8b5cf6" font-family="Arial, sans-serif" font-size="14" font-weight="600">PRICE</text>
    <text x="20" y="45" fill="white" font-family="Arial, sans-serif" font-size="24" font-weight="bold">${price.amount} ${price.currency}</text>
  </g>
  
  <!-- Network Badge -->
  <g transform="translate(320, 340)">
    <rect width="160" height="60" rx="12" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>
    <text x="20" y="25" fill="rgba(255,255,255,0.7)" font-family="Arial, sans-serif" font-size="14" font-weight="600">NETWORK</text>
    <text x="20" y="45" fill="${networkColor}" font-family="Arial, sans-serif" font-size="18" font-weight="bold">${network.toUpperCase()}</text>
  </g>
  
  <!-- Payment Icons -->
  <g transform="translate(900, 340)">
    <!-- USDC Icon -->
    <circle cx="30" cy="30" r="25" fill="#2775CA"/>
    <text x="30" y="38" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="20" font-weight="bold">$</text>
    
    <!-- Lightning bolt for instant payment -->
    <g transform="translate(80, 15)">
      <path d="M10 0L0 15h8L6 30l10-15h-8L10 0z" fill="#FFD700"/>
    </g>
  </g>
  
  <!-- Footer -->
  <text x="600" y="570" text-anchor="middle" fill="rgba(255,255,255,0.6)" font-family="Arial, sans-serif" font-size="16">Powered by X402 Protocol • Click to Pay & Access</text>
  
  <!-- QR Code placeholder area -->
  <rect x="950" y="180" width="120" height="120" rx="12" fill="rgba(255,255,255,0.9)"/>
  <text x="1010" y="220" text-anchor="middle" fill="#333" font-family="Arial, sans-serif" font-size="12">QR CODE</text>
  <text x="1010" y="240" text-anchor="middle" fill="#333" font-family="Arial, sans-serif" font-size="10">Scan to</text>
  <text x="1010" y="255" text-anchor="middle" fill="#333" font-family="Arial, sans-serif" font-size="10">Access</text>
  <text x="1010" y="280" text-anchor="middle" fill="#666" font-family="Arial, sans-serif" font-size="8">${contentId.substring(0, 8)}...</text>
</svg>`;

    return new NextResponse(svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600', // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error('Error generating OG image:', error);
    
    // Return a simple fallback SVG
    const fallbackSvg = `
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#1a1a2e"/>
  <text x="600" y="315" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="48">X402 Content</text>
</svg>`;

    return new NextResponse(fallbackSvg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=300, s-maxage=300',
      },
    });
  }
} 