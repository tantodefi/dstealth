import { NextRequest, NextResponse } from 'next/server';
import { isAddress } from 'viem';

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';
const API_SECRET = process.env.API_SECRET_KEY || 'qXs/ud2727aw3+zBJVob1Vn2pTW381aCsJgLpCgnSg0=';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await params;

    if (!address) {
      return NextResponse.json(
        { success: false, error: 'Address parameter is required' },
        { status: 400 }
      );
    }

    if (!isAddress(address)) {
      return NextResponse.json(
        { success: false, error: 'Invalid address format' },
        { status: 400 }
      );
    }

    console.log(`🔍 Fetching stealth data for address: ${address}`);

    // Forward to backend agent database
    const response = await fetch(`${BACKEND_URL}/api/user/stealth-data/${address}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-secret': API_SECRET,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json({
          success: true,
          stealthData: null,
          message: 'No stealth data found for this address'
        });
      }
      
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
    console.error('Error fetching stealth data:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to fetch stealth data' 
      },
      { status: 500 }
    );
  }
} 