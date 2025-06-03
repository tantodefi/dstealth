import { NextResponse } from 'next/server';
import { type NextRequest } from 'next/server';

// Correct Proxy402 API endpoint (no /api prefix)
const PROXY402_BASE_URL = 'https://proxy402.com';

export async function GET(request: NextRequest) {
  try {
    // Get the JWT token from the Authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Extract JWT token from Bearer token
    const jwt = authHeader.replace('Bearer ', '');

    console.log('Fetching from Proxy402:', {
      url: `${PROXY402_BASE_URL}/links`,
      jwtLength: jwt.length
    });

    // Forward the request to Proxy402 API with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
      const response = await fetch(`${PROXY402_BASE_URL}/links`, {
        method: 'GET',
        headers: {
          // Use Cookie authentication as proven by our curl tests
          'Cookie': `jwt=${jwt}`,
          'Accept': 'application/json',
          'User-Agent': 'XMTP-MiniApp/1.0'
        },
        cache: 'no-store',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      console.log('Proxy402 response:', {
        status: response.status,
        contentType: response.headers.get('content-type'),
        ok: response.ok
      });

      // Get response text first for debugging
      const responseText = await response.text();
      console.log('Response text preview:', responseText.substring(0, 200));

      // Try to parse as JSON regardless of content-type header
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (jsonError) {
        console.error('Failed to parse JSON:', jsonError);
        return NextResponse.json(
          { error: 'Invalid JSON response from Proxy402 API', details: responseText.substring(0, 200) },
          { status: 500 }
        );
      }

      // If the response wasn't successful, forward the error
      if (!response.ok) {
        console.error('Proxy402 API error:', data);
        return NextResponse.json(
          { error: data.error || 'Failed to fetch endpoints', status: response.status },
          { status: response.status }
        );
      }

      console.log('Successfully fetched proxy402 endpoints:', Array.isArray(data) ? data.length : 'unknown', 'endpoints');

      // Return the successful response with CORS headers
      return new NextResponse(JSON.stringify(data), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }
      });
    } catch (fetchError: unknown) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return NextResponse.json(
          { error: 'Request timeout' },
          { status: 504 }
        );
      }
      throw fetchError; // Re-throw for outer catch block
    }
  } catch (error: unknown) {
    console.error('Error fetching proxy402 links:', error);
    
    // Type guard for Error objects
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode = error instanceof Error && 'code' in error ? 
      (error as { code?: string }).code : 'UNKNOWN';

    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: errorMessage,
        code: errorCode
      },
      { status: 500 }
    );
  }
}

// Handle OPTIONS requests for CORS
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
} 