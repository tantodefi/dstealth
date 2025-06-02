import { NextRequest } from 'next/server';
import { env } from '@/lib/env';

export const dynamic = 'force-static';

type RouteContext = {
  params: { username: string };
  searchParams: { [key: string]: string | string[] | undefined };
};

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  const { username } = context.params;
  
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