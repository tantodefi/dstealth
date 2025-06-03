import { NextResponse } from 'next/server';
import { type NextRequest } from 'next/server';

// Correct Proxy402 API endpoint (no /api prefix)
const PROXY402_BASE_URL = 'https://proxy402.com';

export async function POST(request: NextRequest) {
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

    // Get the request body
    const body = await request.json();
    console.log('📝 Create endpoint request body:', body);

    // Validate required fields
    if (!body.target_url || !body.method || !body.price) {
      console.error('❌ Missing required fields:', {
        hasTargetUrl: !!body.target_url,
        hasMethod: !!body.method,
        hasPrice: !!body.price
      });
      return NextResponse.json(
        { 
          error: 'Missing required fields: target_url, method, and price are required',
          received: {
            target_url: body.target_url,
            method: body.method,
            price: body.price
          }
        },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(body.target_url);
    } catch (urlError) {
      console.error('❌ Invalid URL format:', body.target_url);
      return NextResponse.json(
        { error: 'Invalid target_url format. Must be a valid URL starting with http:// or https://' },
        { status: 400 }
      );
    }

    // Validate price format
    const price = parseFloat(body.price);
    if (isNaN(price) || price <= 0) {
      console.error('❌ Invalid price:', body.price);
      return NextResponse.json(
        { error: 'Invalid price. Must be a positive number.' },
        { status: 400 }
      );
    }

    const requestPayload = {
      TargetURL: body.target_url,
      Method: body.method.toUpperCase(),
      Price: price.toString(),
      IsTest: body.is_test ?? true,
      Type: body.type ?? 'credit',
      Credits: body.credits ?? 1
    };

    console.log('🚀 Creating proxy402 endpoint:', {
      url: `${PROXY402_BASE_URL}/links/shrink`,
      payload: requestPayload,
      jwtLength: jwt.length
    });

    // Forward the request to Proxy402 API with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

    try {
      const response = await fetch(`${PROXY402_BASE_URL}/links/shrink`, {
        method: 'POST',
        headers: {
          // Use Cookie authentication like the working links route
          'Cookie': `jwt=${jwt}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'XMTP-MiniApp/1.0'
        },
        body: JSON.stringify(requestPayload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      console.log('📊 Proxy402 create response:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries())
      });

      // Get response text first for debugging
      const responseText = await response.text();
      console.log('📄 Create response text:', responseText);

      // Handle redirect responses (which indicate auth failure)
      if (response.status === 302) {
        console.error('🔒 Authentication failed - received redirect');
        return NextResponse.json(
          { 
            error: 'Authentication failed. Please check your JWT token.',
            details: 'Received redirect response, indicating invalid authentication'
          },
          { status: 401 }
        );
      }

      // Try to parse as JSON
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (jsonError) {
        console.error('❌ Failed to parse create response JSON:', jsonError);
        return NextResponse.json(
          { 
            error: 'Invalid JSON response from Proxy402 API', 
            details: responseText.substring(0, 200),
            status: response.status
          },
          { status: 500 }
        );
      }

      // If the response wasn't successful, forward the error
      if (!response.ok) {
        console.error('❌ Proxy402 create error:', {
          status: response.status,
          statusText: response.statusText,
          data: data
        });
        return NextResponse.json(
          { 
            error: data.error || data.message || 'Failed to create endpoint', 
            status: response.status,
            details: data
          },
          { status: response.status }
        );
      }

      console.log('✅ Successfully created proxy402 endpoint:', data.short_code);

      // Return the successful response
      return NextResponse.json(data, { status: 201 });

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
    console.error('💥 Error creating proxy402 link:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
} 