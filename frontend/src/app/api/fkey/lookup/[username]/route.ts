import { NextRequest } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { username: string } }
) {
  const { username } = params;
  
  try {
    console.log(`Proxying fkey lookup request for username: ${username}`);
    const response = await fetch(`http://localhost:5001/api/fkey/lookup/${username}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Backend responded with status: ${response.status}`);
    }

    const data = await response.json();
    return Response.json(data);
  } catch (error) {
    console.error('Error in fkey lookup:', error);
    return Response.json(
      { error: 'Failed to lookup profile', isRegistered: false },
      { status: 500 }
    );
  }
} 