import { NextRequest } from 'next/server';
import { env } from '@/lib/env';

export const dynamic = 'force-static';

type Props = {
  params: {
    username: string;
  };
};

export async function GET(
  request: NextRequest,
  { params }: Props
) {
  const { username } = params;
  
  try {
    console.log(`Proxying fkey lookup request for username: ${username}`);
    const response = await fetch(`${env.BACKEND_URL}/api/fkey/lookup/${username}`, {
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
      { error: 'Failed to lookup profile', success: false },
      { status: 500 }
    );
  }
} 