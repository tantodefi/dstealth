import { type NextRequest } from 'next/server';

type Props = {
  params: { username: string }
}

export const GET = async (
  req: NextRequest,
  props: Props
): Promise<Response> => {
  const { username } = props.params;
  
  try {
    console.log(`Proxying convos lookup request for username: ${username}`);
    const response = await fetch(`${process.env.BACKEND_URL}/api/convos/lookup/${username}`, {
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
    console.error('Error in convos lookup:', error);
    return Response.json(
      { error: 'Failed to lookup profile', success: false },
      { status: 500 }
    );
  }
} 