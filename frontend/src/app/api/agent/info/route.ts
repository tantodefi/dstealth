import { NextRequest, NextResponse } from 'next/server';

// Configure maximum duration for Vercel Functions (60s for hobby tier)
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    // Get backend URL - use the correct environment variable
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL || 'https://xmtp-mini-app-examples.onrender.com';
    
    console.log(`🔍 Proxying agent info request to: ${backendUrl}/api/agent/info`);
    
    // Make request to backend
    const response = await fetch(`${backendUrl}/api/agent/info`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`❌ Backend agent info request failed: ${response.status}`);
      return NextResponse.json(
        { 
          success: false, 
          error: 'Agent not available',
          details: `Backend responded with ${response.status}`
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('✅ Agent info retrieved successfully from backend');
    
    return NextResponse.json(data);

  } catch (error) {
    console.error('❌ Agent info proxy error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to connect to agent',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
} 