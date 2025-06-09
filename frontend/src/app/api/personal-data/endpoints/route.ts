import { NextResponse } from 'next/server';

// Configure maximum duration for Vercel Functions (60s for hobby tier)
export const maxDuration = 60;

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';

export async function GET() {
  try {
    console.log('Fetching endpoints from:', `${BACKEND_URL}/personal-data/endpoints`);
    const response = await fetch(`${BACKEND_URL}/personal-data/endpoints`, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Backend response not ok:', response.status, response.statusText);
      const text = await response.text();
      console.error('Response body:', text);
      throw new Error(`Backend error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Endpoints data received:', data);
    
    if (!data.success) {
      throw new Error(data.error || 'Backend returned unsuccessful response');
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in endpoints GET route:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to fetch endpoints',
        success: false 
      },
      { status: 500 }
    );
  }
}

interface EndpointRequest {
  resourceUrl: string;    // URL of the resource to protect
  endpointPath: string;   // Path where the endpoint will be accessible
  price: number;          // Price in USD for x402 payment
  description: string;    // Description of the endpoint
  owner: string;          // Ethereum address of the endpoint owner
  requiresZkfetch: boolean; // Whether to use zkfetch for proof+verification
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as EndpointRequest;
    const { resourceUrl, endpointPath, price, description, owner, requiresZkfetch } = body;

    // Validate required fields
    if (!resourceUrl || !endpointPath || !price || !description || !owner) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate endpoint path format
    if (!endpointPath.startsWith('/api/')) {
      return NextResponse.json(
        { success: false, error: 'Endpoint path must start with /api/' },
        { status: 400 }
      );
    }

    // Create the endpoint in the backend
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:5001';
    const response = await fetch(`${backendUrl}/personal-data/endpoints`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        resourceUrl,
        endpointPath,
        price,
        description,
        owner,
        requiresZkfetch
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { 
          success: false, 
          error: errorData.error || `Failed to create endpoint: ${response.status}` 
        },
        { status: response.status }
      );
    }

    // Set up zkfetch integration if required
    if (requiresZkfetch) {
      try {
        // Initialize zkfetch for the endpoint
        const zkfetchResponse = await fetch(`${backendUrl}/zkfetch/init`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            resourceUrl,
            endpointPath,
            owner
          })
        });

        if (!zkfetchResponse.ok) {
          console.error('Failed to initialize zkfetch:', await zkfetchResponse.text());
        }
      } catch (error) {
        console.error('Error initializing zkfetch:', error);
      }
    }

    const data = await response.json();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error creating endpoint:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to create endpoint' 
      },
      { status: 500 }
    );
  }
} 