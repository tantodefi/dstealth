import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      username: string;
    }>;
  }
) {
  try {
    const { username } = await params;
    console.log(`Proxying convos lookup request for username: ${username}`);
    
    const response = await fetch(`${env.BACKEND_URL}/api/convos/lookup/${username}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Backend responded with status: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in convos lookup:', error);
    return NextResponse.json(
      { error: 'Failed to lookup profile', success: false },
      { status: 500 }
    );
  }
} 