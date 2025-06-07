/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from "@vercel/og";
import { NextResponse } from "next/server";
import { OG_IMAGE_SIZE } from "@/lib/constants";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  try {
    const { id: contentId } = await params;
    const url = new URL(request.url);
    const format = url.searchParams.get('format') || 'image';

    // Fetch X402 metadata
    let metadata;
    try {
      const metadataResponse = await fetch(`${env.NEXT_PUBLIC_URL}/api/x402/info/${contentId}`);
      if (metadataResponse.ok) {
        metadata = await metadataResponse.json();
      }
    } catch (error) {
      console.log('Failed to fetch X402 metadata:', error);
    }

    // Default metadata if fetch fails
    if (!metadata) {
      metadata = {
        name: `X402 Content ${contentId.substring(0, 8)}`,
        description: 'Protected content accessible via X402 payment',
        content_type: 'text',
        pricing: [{ amount: 0.01, currency: 'USDC', network: 'base-sepolia' }]
      };
    }

    if (format === 'metadata') {
      // Return JSON metadata for Frame tags
      return NextResponse.json({
        title: metadata.name,
        description: metadata.description || 'Protected content accessible via X402 payment',
        image: `${env.NEXT_PUBLIC_URL}/api/og/x402/${contentId}?format=image`,
        price: metadata.pricing?.[0] ? `${metadata.pricing[0].amount} ${metadata.pricing[0].currency}` : '0.01 USDC',
        network: metadata.pricing?.[0]?.network || 'base-sepolia',
        contentType: metadata.content_type || 'text',
        x402Url: `x402://${env.NEXT_PUBLIC_URL?.replace('https://', '').replace('http://', '')}/content/${contentId}`,
        viewerUrl: `${env.NEXT_PUBLIC_URL}/viewer?uri=x402://${env.NEXT_PUBLIC_URL?.replace('https://', '').replace('http://', '')}/content/${contentId}`
      });
    }

    // Generate OG image
    const ogImage = new ImageResponse(
      <X402OGImage 
        title={metadata.name}
        description={metadata.description || 'Protected content accessible via X402 payment'}
        price={metadata.pricing?.[0] ? `${metadata.pricing[0].amount} ${metadata.pricing[0].currency}` : '0.01 USDC'}
        network={metadata.pricing?.[0]?.network || 'base-sepolia'}
        contentType={metadata.content_type || 'text'}
        contentId={contentId}
      />, 
      {
        ...OG_IMAGE_SIZE,
        debug: false,
        headers: [
          ["Cache-Control", "public, s-maxage=3600, stale-while-revalidate=59"],
        ],
      }
    );

    return ogImage;
    
  } catch (e: any) {
    console.log(`Error generating X402 OG: ${e.message}`);
    
    // Fallback image
    return new ImageResponse(
      <X402ErrorImage />, 
      {
        ...OG_IMAGE_SIZE,
        debug: false,
        headers: [
          ["Cache-Control", "public, s-maxage=300, stale-while-revalidate=59"],
        ],
      }
    );
  }
}

// X402 OG Image Component
const X402OGImage = ({ 
  title, 
  description, 
  price, 
  network, 
  contentType, 
  contentId 
}: {
  title: string;
  description: string;
  price: string;
  network: string;
  contentType: string;
  contentId: string;
}) => (
  <div
    style={{
      height: '100%',
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#0d0d0d',
      backgroundImage: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      position: 'relative',
      fontFamily: 'Inter, sans-serif',
    }}
  >
    {/* Background pattern */}
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundImage: 'radial-gradient(circle at 25% 25%, rgba(255,255,255,0.1) 0%, transparent 50%), radial-gradient(circle at 75% 75%, rgba(255,255,255,0.05) 0%, transparent 50%)',
      }}
    />
    
    {/* Content */}
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px',
        textAlign: 'center',
        position: 'relative',
        zIndex: 1,
        maxWidth: '520px',
      }}
    >
      {/* X402 Badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          backgroundColor: 'rgba(255,255,255,0.15)',
          backdropFilter: 'blur(10px)',
          borderRadius: '20px',
          padding: '8px 16px',
          marginBottom: '20px',
          border: '1px solid rgba(255,255,255,0.2)',
        }}
      >
        <span style={{ color: '#4ecdc4', fontWeight: 'bold', fontSize: '14px' }}>
          X402://
        </span>
      </div>

      {/* Title */}
      <h1
        style={{
          fontSize: '36px',
          fontWeight: 'bold',
          color: 'white',
          margin: '0 0 12px 0',
          lineHeight: 1.2,
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {title}
      </h1>

      {/* Description */}
      <p
        style={{
          fontSize: '16px',
          color: 'rgba(255,255,255,0.8)',
          margin: '0 0 24px 0',
          lineHeight: 1.4,
          maxWidth: '100%',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {description}
      </p>

      {/* Payment Info */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          backgroundColor: 'rgba(255,255,255,0.1)',
          borderRadius: '12px',
          padding: '16px 20px',
          border: '1px solid rgba(255,255,255,0.2)',
          marginBottom: '20px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={{ color: '#4ecdc4', fontSize: '20px', fontWeight: 'bold' }}>
            {price}
          </span>
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '12px', textTransform: 'uppercase' }}>
            {network} • {contentType}
          </span>
        </div>
      </div>

      {/* CTA */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          backgroundColor: '#4ecdc4',
          color: '#1a1a1a',
          borderRadius: '8px',
          padding: '10px 16px',
          fontWeight: 'bold',
          fontSize: '14px',
        }}
      >
        🔐 Pay & Access Content
      </div>
    </div>

    {/* Footer */}
    <div
      style={{
        position: 'absolute',
        bottom: '12px',
        right: '16px',
        color: 'rgba(255,255,255,0.4)',
        fontSize: '10px',
        fontFamily: 'monospace',
      }}
    >
      {contentId.substring(0, 12)}...
    </div>
  </div>
);

// Error fallback image
const X402ErrorImage = () => (
  <div
    style={{
      height: '100%',
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#1a1a1a',
      color: 'white',
      fontFamily: 'Inter, sans-serif',
    }}
  >
    <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
    <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 8px 0' }}>
      X402 Content Error
    </h1>
    <p style={{ fontSize: '14px', opacity: 0.7, margin: 0 }}>
      Unable to load content metadata
    </p>
  </div>
); 