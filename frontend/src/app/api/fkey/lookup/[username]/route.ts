import { NextRequest } from 'next/server';
import { env } from '@/lib/env';

// Configure maximum duration for Vercel Functions (60s for hobby tier)
export const maxDuration = 60;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ username: string }> }
) {
  const startTime = Date.now();
  console.log('🚀 Fkey lookup route called at:', new Date().toISOString());
  
  const { username } = await context.params;
  
  try {
    console.log(`👤 Proxying fkey lookup request for username: ${username}`);
    const backendUrl = env.BACKEND_URL || env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';
    const apiSecret = env.API_SECRET_KEY || 'qXs/ud2727aw3+zBJVob1Vn2pTW381aCsJgLpCgnSg0=';
    
    console.log(`🌐 Backend URL: ${backendUrl}`);
    console.log(`🔑 API Secret available: ${!!apiSecret}`);
    console.log(`⏱️  Making request to: ${backendUrl}/api/fkey/lookup/${username}`);
    
    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.log('⏰ Request timeout after 60 seconds');
      controller.abort();
    }, 60000); // 60 second timeout
    
    const response = await fetch(`${backendUrl}/api/fkey/lookup/${username}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-secret': apiSecret,
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    const duration = Date.now() - startTime;
    console.log(`⚡ Response received in ${duration}ms with status: ${response.status}`);

    if (!response.ok) {
      console.error(`❌ Backend responded with status: ${response.status}`);
      const errorText = await response.text().catch(() => 'Could not read error response');
      console.error(`❌ Error response body: ${errorText}`);
      throw new Error(`Backend responded with status: ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ Backend response received successfully');
    return Response.json(data);
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`💥 Error in fkey lookup after ${duration}ms:`, error);
    
    if (error instanceof Error) {
      console.error(`💥 Error name: ${error.name}`);
      console.error(`💥 Error message: ${error.message}`);
    }
    
    if (error instanceof Error && error.name === 'AbortError') {
      console.log('⏰ Request was aborted due to timeout');
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