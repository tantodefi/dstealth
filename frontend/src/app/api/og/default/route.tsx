import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  try {
    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#0f0f23',
            backgroundImage: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: '40px',
            }}
          >
            <div
              style={{
                fontSize: '80px',
                marginRight: '30px',
              }}
            >
              💰
            </div>
            <div style={{ color: 'white' }}>
              <div style={{ fontSize: '72px', fontWeight: 'bold', marginBottom: '10px' }}>
                X402 Protocol
              </div>
              <div style={{ fontSize: '32px', opacity: 0.9 }}>
                Crypto Payments • Content Monetization
              </div>
            </div>
          </div>

          {/* Features */}
          <div
            style={{
              display: 'flex',
              gap: '60px',
              marginBottom: '40px',
            }}
          >
            <div style={{ textAlign: 'center', color: 'white' }}>
              <div style={{ fontSize: '48px', marginBottom: '10px' }}>🥷</div>
              <div style={{ fontSize: '24px', fontWeight: '600' }}>Ninja Rewards</div>
              <div style={{ fontSize: '16px', opacity: 0.8 }}>Earn tokens</div>
            </div>
            <div style={{ textAlign: 'center', color: 'white' }}>
              <div style={{ fontSize: '48px', marginBottom: '10px' }}>🎯</div>
              <div style={{ fontSize: '24px', fontWeight: '600' }}>FluidKey Elite</div>
              <div style={{ fontSize: '16px', opacity: 0.8 }}>42k bonus</div>
            </div>
            <div style={{ textAlign: 'center', color: 'white' }}>
              <div style={{ fontSize: '48px', marginBottom: '10px' }}>📧</div>
              <div style={{ fontSize: '24px', fontWeight: '600' }}>Farcaster Frames</div>
              <div style={{ fontSize: '16px', opacity: 0.8 }}>Social sharing</div>
            </div>
          </div>

          {/* Call to Action */}
          <div
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.15)',
              padding: '30px 60px',
              borderRadius: '20px',
              textAlign: 'center',
              border: '3px solid rgba(255, 255, 255, 0.3)',
            }}
          >
            <div style={{ color: 'white', fontSize: '32px', fontWeight: '700', marginBottom: '15px' }}>
              Start Monetizing Your Content
            </div>
            <div style={{ color: 'white', fontSize: '20px', opacity: 0.9 }}>
              Create • Share • Earn • Get Rewarded
            </div>
          </div>

          {/* Bottom branding */}
          <div
            style={{
              position: 'absolute',
              bottom: '30px',
              right: '40px',
              color: 'rgba(255, 255, 255, 0.7)',
              fontSize: '18px',
              fontWeight: '600',
            }}
          >
            Powered by Base & Farcaster
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (error) {
    console.error('Error generating default OG image:', error);
    return new Response('Failed to generate image', { status: 500 });
  }
} 