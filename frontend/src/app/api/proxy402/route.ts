import { NextResponse } from 'next/server';
import { headers } from 'next/headers';

// Helper function to add CORS headers
function corsHeaders(response: Response) {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
}

export async function OPTIONS() {
  return corsHeaders(new NextResponse(null, { status: 200 }));
}

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return corsHeaders(
        NextResponse.json({ error: 'No authorization token provided' }, { status: 401 })
      );
    }

    console.log('Proxying GET request to proxy402.com/links');
    const response = await fetch('https://proxy402.com/links', {
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Proxy402 API error:', errorText);
      return corsHeaders(
        NextResponse.json({ error: `Proxy402 API error: ${errorText}` }, { status: response.status })
      );
    }

    const data = await response.json();
    return corsHeaders(NextResponse.json(data));
  } catch (error) {
    console.error('Proxy402 API error:', error);
    return corsHeaders(
      NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to fetch endpoints' },
        { status: 500 }
      )
    );
  }
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return corsHeaders(
        NextResponse.json({ error: 'No authorization token provided' }, { status: 401 })
      );
    }

    const body = await request.json();
    console.log('Proxying POST request to proxy402.com/links/shrink', body);

    const response = await fetch('https://proxy402.com/links/shrink', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Proxy402 API error:', errorText);
      return corsHeaders(
        NextResponse.json({ error: `Proxy402 API error: ${errorText}` }, { status: response.status })
      );
    }

    const data = await response.json();
    return corsHeaders(NextResponse.json(data));
  } catch (error) {
    console.error('Proxy402 API error:', error);
    return corsHeaders(
      NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to create endpoint' },
        { status: 500 }
      )
    );
  }
} 