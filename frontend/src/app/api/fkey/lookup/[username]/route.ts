import { NextRequest } from 'next/server';
import { env } from '@/lib/env';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ username: string }> }
) {
  const { username } = await context.params;
  
  try {
    console.log(`Proxying fkey lookup request for username: ${username}`);
    const backendUrl = env.BACKEND_URL || env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';
    const apiSecret = env.API_SECRET_KEY || 'qXs/ud2727aw3+zBJVob1Vn2pTW381aCsJgLpCgnSg0=';
    
    console.log(`Making request to: ${backendUrl}/api/fkey/lookup/${username}`);
    
    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout
    
    const response = await fetch(`${backendUrl}/api/fkey/lookup/${username}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-secret': apiSecret,
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`Backend responded with status: ${response.status}`);
      throw new Error(`Backend responded with status: ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ Backend response received successfully');
    return Response.json(data);
  } catch (error) {
    console.error('Error in fkey lookup:', error);
    if (error instanceof Error && error.name === 'AbortError') {
      return Response.json(
        { error: 'Request timeout - please try again', success: false },
        { status: 408 }
      );
    }
    return Response.json(
      { error: 'Failed to lookup profile', success: false },
      { status: 500 }
    );
  }
} 