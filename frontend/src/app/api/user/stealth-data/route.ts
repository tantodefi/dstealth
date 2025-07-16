import { NextRequest, NextResponse } from 'next/server';
import { isAddress } from 'viem';

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';
const API_SECRET = process.env.API_SECRET_KEY || 'qXs/ud2727aw3+zBJVob1Vn2pTW381aCsJgLpCgnSg0=';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userAddress, fkeyId, source } = body;

    if (!userAddress || !fkeyId) {
      return NextResponse.json(
        { success: false, error: 'userAddress and fkeyId are required' },
        { status: 400 }
      );
    }

    if (!isAddress(userAddress)) {
      return NextResponse.json(
        { success: false, error: 'Invalid user address' },
        { status: 400 }
      );
    }

    // Validate fkey format
    const fkeyRegex = /^[a-zA-Z0-9_-]+$/;
    if (!fkeyRegex.test(fkeyId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid fkey format' },
        { status: 400 }
      );
    }

    console.log(`💾 Saving fkey data: ${fkeyId} for ${userAddress} from ${source}`);

    // Forward to backend agent database
    const response = await fetch(`${BACKEND_URL}/api/user/stealth-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-secret': API_SECRET,
      },
      body: JSON.stringify({
        userAddress,
        fkeyId,
        source: source || 'frontend-settings'
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Backend error:', response.status, errorData);
      return NextResponse.json(
        { 
          success: false, 
          error: errorData.error || `Backend error: ${response.status}` 
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Error saving stealth data:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to save stealth data' 
      },
      { status: 500 }
    );
  }
} 