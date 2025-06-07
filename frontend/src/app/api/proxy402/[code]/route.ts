import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const proxy402Url = `https://proxy402.com/${code}`;
    
    // Redirect to our viewer with the proxy402 URL
    const viewerUrl = `/viewer?uri=${encodeURIComponent(proxy402Url)}`;
    
    return NextResponse.redirect(new URL(viewerUrl, request.url));
    
  } catch (error) {
    console.error('Proxy402 redirect error:', error);
    return NextResponse.json(
      { error: 'Failed to process proxy402 URL' },
      { status: 500 }
    );
  }
} 