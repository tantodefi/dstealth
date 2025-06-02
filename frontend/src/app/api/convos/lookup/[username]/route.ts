import { NextRequest } from 'next/server';
import { env } from '@/lib/env';

export async function GET(
  request: NextRequest,
  { params }: { params: Record<string, string> }
) {
  const username = params.username;
  
  try {
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
    return Response.json(data);
  } catch (error) {
    console.error('Error in convos lookup:', error);
    return Response.json(
      { error: 'Failed to lookup profile', success: false },
      { status: 500 }
    );
  }
} 