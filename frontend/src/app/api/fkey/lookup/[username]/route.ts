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
  const { searchParams } = new URL(request.url);
  const userAddress = searchParams.get('userAddress');
  const source = searchParams.get('source');
  
  try {
    console.log(`👤 Proxying fkey lookup request for username: ${username}`);
    console.log(`🎯 User address: ${userAddress || 'not provided'}, Source: ${source || 'not provided'}`);
    
    const backendUrl = env.BACKEND_URL || env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';
    const apiSecret = env.API_SECRET_KEY || 'qXs/ud2727aw3+zBJVob1Vn2pTW381aCsJgLpCgnSg0=';
    
    console.log(`🌐 Backend URL: ${backendUrl}`);
    console.log(`🔑 API Secret available: ${!!apiSecret}`);
    
    // Build backend URL with query parameters for ZK receipt generation
    const backendUrl_withParams = new URL(`${backendUrl}/api/fkey/lookup/${username}`);
    if (userAddress) {
      backendUrl_withParams.searchParams.append('userAddress', userAddress);
    }
    if (source) {
      backendUrl_withParams.searchParams.append('source', source);
    } else {
      backendUrl_withParams.searchParams.append('source', 'frontend-api');
    }
    
    console.log(`⏱️  Making request to: ${backendUrl_withParams.toString()}`);
    
    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.log('⏰ Request timeout after 60 seconds');
      controller.abort();
    }, 60000); // 60 second timeout
    
    const response = await fetch(backendUrl_withParams.toString(), {
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
    console.log('🧾 ZK receipt generation handled by backend');
    return Response.json(data);
  } catch (error) {
    console.error('❌ Fkey lookup proxy error:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 