import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { target_url, method, price, description } = body;

    // Get API key from request headers
    const proxy402ApiKey = req.headers.get('x-proxy402-api-key');
    if (!proxy402ApiKey) {
      return NextResponse.json(
        { success: false, error: 'Proxy402 API key is required' },
        { status: 401 }
      );
    }

    // Create a new paid route using Proxy402 API
    const response = await fetch('https://api.proxy402.com/links/shrink', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${proxy402ApiKey}`
      },
      body: JSON.stringify({
        target_url,
        method: method || 'GET',
        price: price.toString(),
        type: 'credit',
        credits: 1,
        is_test: false
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { 
          success: false, 
          error: errorData.error || `Failed to create Proxy402 link: ${response.status}` 
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error creating Proxy402 link:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to create Proxy402 link' 
      },
      { status: 500 }
    );
  }
} 