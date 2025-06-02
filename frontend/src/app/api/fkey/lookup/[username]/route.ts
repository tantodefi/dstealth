import { type NextRequest } from 'next/server';

export const dynamic = 'force-static';

type Props = {
  params: { username: string }
}

export const GET = async (
  req: NextRequest,
  props: Props
): Promise<Response> => {
  const { username } = props.params;
  
  try {
    console.log(`Proxying fkey lookup request for username: ${username}`);
    const response = await fetch(`${process.env.BACKEND_URL}/api/fkey/lookup/${username}`, {
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