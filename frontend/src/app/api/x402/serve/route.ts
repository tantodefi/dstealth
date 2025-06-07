import { NextRequest, NextResponse } from 'next/server';
import { X402Server } from '@/lib/x402-server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const contentId = searchParams.get('id');
    const accessToken = searchParams.get('token') || request.headers.get('authorization')?.replace('Bearer ', '');

    if (!contentId) {
      return NextResponse.json(
        { error: 'Content ID required' },
        { status: 400 }
      );
    }

    const x402Server = X402Server.getInstance();
    const content = await x402Server.getContent(contentId, accessToken || undefined);

    if (!content) {
      // Return payment required response
      return NextResponse.json(
        {
          error: 'Payment Required',
          message: 'This content requires payment to access',
          contentId,
          preview: `Preview of content: ${contentId}`,
          paymentUrl: `/api/x402/pay?id=${contentId}`
        },
        { 
          status: 402,
          headers: {
            'WWW-Authenticate': 'Bearer',
            'X-Payment-Required': 'true'
          }
        }
      );
    }

    // Track access for analytics
    if (accessToken) {
      const decoded = JSON.parse(atob(accessToken.split('.')[1]));
      await x402Server.trackAccess(contentId, decoded.payerAddress);
    }

    // Return content based on type
    switch (content.category) {
      case 'text':
        return NextResponse.json({
          type: 'text',
          title: content.title,
          content: content.content,
          metadata: {
            creator: content.creator,
            createdAt: content.createdAt,
            accessCount: content.accessCount
          }
        });

      case 'url':
        // Redirect to protected URL
        return NextResponse.redirect(content.content);

      case 'image':
      case 'video':
      case 'pdf':
        // In production, serve from secure storage
        return NextResponse.json({
          type: content.category,
          title: content.title,
          mediaUrl: content.content,
          metadata: {
            creator: content.creator,
            createdAt: content.createdAt
          }
        });

      default:
        return NextResponse.json({
          type: 'unknown',
          title: content.title,
          content: content.content
        });
    }

  } catch (error) {
    console.error('Error serving X402 content:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { contentId, paymentProof, userAddress } = body;

    if (!contentId || !paymentProof || !userAddress) {
      return NextResponse.json(
        { error: 'Missing required fields: contentId, paymentProof, userAddress' },
        { status: 400 }
      );
    }

    const x402Server = X402Server.getInstance();
    
    // Verify payment proof (in production, verify on-chain transaction)
    const paymentId = `payment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const payment = {
      id: paymentId,
      contentId,
      payerAddress: userAddress,
      amount: '500', // Get from content
      currency: 'USD',
      txHash: paymentProof,
      status: 'confirmed' as const,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      createdAt: new Date().toISOString()
    };

    // Generate access token
    const accessToken = await x402Server.processPayment(payment);

    return NextResponse.json({
      success: true,
      accessToken,
      expiresAt: payment.expiresAt,
      contentUrl: `/api/x402/serve?id=${contentId}&token=${accessToken}`
    });

  } catch (error) {
    console.error('Error processing X402 payment:', error);
    return NextResponse.json(
      { error: 'Payment processing failed' },
      { status: 500 }
    );
  }
} 