import { NextResponse } from 'next/server';

function corsHeaders(response: Response) {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
}

export async function OPTIONS() {
  return corsHeaders(new NextResponse(null, { status: 200 }));
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
    console.log('Proxying POST request to proxy402.com/files/upload', body);

    const response = await fetch('https://proxy402.com/files/upload', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Proxy402 files upload error:', errorText);
      return corsHeaders(
        NextResponse.json({ error: `Proxy402 API error: ${errorText}` }, { status: response.status })
      );
    }

    const data = await response.json();
    return corsHeaders(NextResponse.json(data));
  } catch (error) {
    console.error('Proxy402 files upload error:', error);
    return corsHeaders(
      NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to initiate file upload' },
        { status: 500 }
      )
    );
  }
} 