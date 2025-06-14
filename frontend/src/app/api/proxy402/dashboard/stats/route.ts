import { NextResponse } from 'next/server';
import { type NextRequest } from 'next/server';

// Proxy402 API endpoint for dashboard stats
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

    console.log('Fetching dashboard stats from Proxy402:', {
      url: `${PROXY402_BASE_URL}/dashboard/stats`,
      jwtLength: jwt.length,
      jwtPreview: jwt.substring(0, 10) + '...'
    });

    // Forward the request to Proxy402 API with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(`${PROXY402_BASE_URL}/dashboard/stats`, {
        method: 'GET',
        headers: {
          'Cookie': `jwt=${jwt}`,
          'Accept': 'application/json',
          'User-Agent': 'XMTP-MiniApp/1.0',
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      console.log('Proxy402 dashboard stats response:', {
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get('content-type'),
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries())
      });

      // Get response text first for debugging
      const responseText = await response.text();
      console.log('Dashboard stats response preview:', responseText.substring(0, 500));

      // If the response wasn't successful, return error
      if (!response.ok) {
        console.error('Proxy402 dashboard stats API error:', {
          status: response.status,
          statusText: response.statusText,
          responseText
        });
        return NextResponse.json(
          { 
            error: 'Failed to fetch dashboard stats',
            status: response.status,
            details: responseText
          },
          { status: response.status }
        );
      }

      // Try to parse as JSON
      let data;
      try {
        data = JSON.parse(responseText);
        
        // Validate the response structure matches the API spec
        if (!data || typeof data !== 'object') {
          throw new Error('Invalid response structure');
        }

        // Ensure required fields are present
        const requiredFields = ['test_earnings', 'test_purchases', 'real_earnings', 'real_purchases', 'daily_purchases'];
        const missingFields = requiredFields.filter(field => !(field in data));
        if (missingFields.length > 0) {
          throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
        }

        // Validate daily_purchases array
        if (!Array.isArray(data.daily_purchases)) {
          throw new Error('daily_purchases must be an array');
        }

        // Validate each daily purchase entry
        data.daily_purchases.forEach((entry: any, index: number) => {
          const requiredDailyFields = ['date', 'test_earnings', 'test_count', 'real_earnings', 'real_count'];
          const missingDailyFields = requiredDailyFields.filter(field => !(field in entry));
          if (missingDailyFields.length > 0) {
            throw new Error(`Missing required fields in daily_purchases[${index}]: ${missingDailyFields.join(', ')}`);
          }
        });

      } catch (jsonError) {
        console.error('Failed to parse or validate dashboard stats JSON:', {
          error: jsonError,
          responseText,
          contentType: response.headers.get('content-type')
        });
        return NextResponse.json(
          { 
            error: 'Invalid JSON response from Proxy402 API',
            details: jsonError instanceof Error ? jsonError.message : 'Unknown error',
            responseText
          },
          { status: 500 }
        );
      }

      console.log('Successfully fetched proxy402 dashboard stats:', {
        dataKeys: Object.keys(data),
        hasDailyPurchases: Array.isArray(data.daily_purchases),
        dailyPurchasesLength: data.daily_purchases?.length
      });

      // Return the successful response with CORS headers
      return new NextResponse(JSON.stringify(data), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Credentials': 'true'
        }
      });
    } catch (fetchError) {
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
    console.error('Error fetching proxy402 dashboard stats:', error);
    
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
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Credentials': 'true'
    }
  });
} 