import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export async function GET() {
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
            backgroundColor: '#000000',
            backgroundImage: 'linear-gradient(45deg, #000000 0%, #1a1a2e 50%, #16213e 100%)',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          {/* Main logo/title */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '20px',
              marginBottom: '40px',
            }}
          >
            <div
              style={{
                fontSize: '120px',
                color: '#ffffff',
                fontWeight: 'bold',
                textShadow: '0 0 30px rgba(255,255,255,0.3)',
              }}
            >
              🥷
            </div>
            <div
              style={{
                fontSize: '80px',
                color: '#ffffff',
                fontWeight: 'bold',
                letterSpacing: '-2px',
                textShadow: '0 0 20px rgba(255,255,255,0.5)',
              }}
            >
              dstealth
            </div>
          </div>

          {/* Tagline */}
          <div
            style={{
              fontSize: '36px',
              color: '#a0a0a0',
              textAlign: 'center',
              maxWidth: '800px',
              lineHeight: '1.2',
              marginBottom: '30px',
            }}
          >
            Private Payments & Content Creation
          </div>

          {/* Features */}
          <div
            style={{
              display: 'flex',
              gap: '40px',
              fontSize: '24px',
              color: '#6b7280',
            }}
          >
            <span>🔒 Stealth Addresses</span>
            <span>💰 X402 Protocol</span>
            <span>🌐 Base Network</span>
            <span>💬 XMTP Messaging</span>
          </div>

          {/* Bottom accent */}
          <div
            style={{
              position: 'absolute',
              bottom: '0',
              left: '0',
              right: '0',
              height: '8px',
              background: 'linear-gradient(90deg, #3b82f6, #8b5cf6, #ef4444, #f59e0b)',
            }}
          />
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (error) {
    console.error('Failed to generate OG image:', error);
    return new Response('Failed to generate image', { status: 500 });
  }
} 