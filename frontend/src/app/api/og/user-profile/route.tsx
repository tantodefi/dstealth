import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');

    if (!address) {
      return new Response('Missing address parameter', { status: 400 });
    }

    // Validate Ethereum address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return new Response('Invalid address format', { status: 400 });
    }

    const truncatedAddress = `${address.slice(0, 8)}...${address.slice(-6)}`;
    
    // In a real app, you'd fetch user data from your database here
    // For now, we'll use mock data
    const userData = {
      username: `user_${address.slice(2, 8)}`,
      fkeyId: `${address.slice(2, 8)}.fkey.id`,
      linkCount: Math.floor(Math.random() * 10) + 1,
      totalEarnings: (Math.random() * 1000).toFixed(2),
    };

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
            backgroundImage: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: '30px',
            }}
          >
            <div
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                backgroundColor: '#667eea',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '32px',
                marginRight: '20px',
                border: '3px solid white',
              }}
            >
              🥷
            </div>
            <div style={{ color: 'white' }}>
              <div style={{ fontSize: '36px', fontWeight: 'bold', marginBottom: '5px' }}>
                {userData.username}
              </div>
              <div style={{ fontSize: '18px', opacity: 0.8 }}>
                {truncatedAddress}
              </div>
            </div>
          </div>

          {/* fkey.id */}
          <div
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              padding: '15px 25px',
              borderRadius: '25px',
              marginBottom: '25px',
              border: '2px solid rgba(255, 255, 255, 0.2)',
            }}
          >
            <span style={{ color: 'white', fontSize: '20px', fontWeight: '600' }}>
              📧 {userData.fkeyId}
            </span>
          </div>

          {/* Stats */}
          <div
            style={{
              display: 'flex',
              gap: '40px',
              marginBottom: '30px',
            }}
          >
            <div style={{ textAlign: 'center', color: 'white' }}>
              <div style={{ fontSize: '28px', fontWeight: 'bold' }}>
                {userData.linkCount}
              </div>
              <div style={{ fontSize: '14px', opacity: 0.8 }}>
                X402 Links
              </div>
            </div>
            <div style={{ textAlign: 'center', color: 'white' }}>
              <div style={{ fontSize: '28px', fontWeight: 'bold' }}>
                ${userData.totalEarnings}
              </div>
              <div style={{ fontSize: '14px', opacity: 0.8 }}>
                Total Earned
              </div>
            </div>
          </div>

          {/* Call to Action */}
          <div
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.15)',
              padding: '20px 40px',
              borderRadius: '15px',
              textAlign: 'center',
              border: '2px solid rgba(255, 255, 255, 0.3)',
            }}
          >
            <div style={{ color: 'white', fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>
              💰 Support this Creator
            </div>
            <div style={{ color: 'white', fontSize: '14px', opacity: 0.9 }}>
              Make payments • Access content • Earn rewards
            </div>
          </div>

          {/* X402 Branding */}
          <div
            style={{
              position: 'absolute',
              bottom: '20px',
              right: '30px',
              color: 'rgba(255, 255, 255, 0.6)',
              fontSize: '16px',
              fontWeight: '600',
            }}
          >
            X402 Protocol
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (error) {
    console.error('Error generating OG image:', error);
    return new Response('Failed to generate image', { status: 500 });
  }
} 