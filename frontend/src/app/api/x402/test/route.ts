import { NextResponse } from 'next/server';

function corsHeaders(response: Response) {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Payment');
  return response;
}

export async function OPTIONS() {
  return corsHeaders(new NextResponse(null, { status: 200 }));
}

export async function GET(request: Request) {
  try {
    const paymentHeader = request.headers.get('X-Payment');
    
    if (!paymentHeader) {
      // Return 402 Payment Required with X402 payment requirements
      const paymentRequirements = {
        x402Version: 1,
        schemes: ['exact', 'proportional'],
        network: 'ethereum',
        amount: '0.01',
        asset: 'USD',
        recipient: '0x742d35Cc6123459cC2c19B6bfda17215Ba4F9fa0',
        memo: 'X402 test payment for protected content'
      };
      
      const encodedRequirements = Buffer.from(JSON.stringify(paymentRequirements)).toString('base64');
      
      const response = new NextResponse(
        JSON.stringify({ 
          error: 'Payment required',
          message: 'This content requires payment via X402 protocol',
          requirements: paymentRequirements
        }), 
        { 
          status: 402,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
      
      response.headers.set('X-Accept-Payment', encodedRequirements);
      
      return corsHeaders(response);
    }
    
    // Validate payment (in production, verify with payment provider)
    try {
      const paymentData = JSON.parse(Buffer.from(paymentHeader, 'base64').toString('utf-8'));
      
      if (paymentData && paymentData.payload && paymentData.payload.txHash) {
        // Payment verified - return protected content
        return corsHeaders(NextResponse.json({
          success: true,
          message: '🎉 Payment verified! You now have access to the protected content.',
          content: {
            title: 'Protected X402 Content',
            body: 'This is premium content that was protected by the X402 protocol. You successfully paid to access it!',
            metadata: {
              contentType: 'text',
              size: 142,
              timestamp: new Date().toISOString(),
              paymentVerified: true
            }
          },
          paymentInfo: {
            txHash: paymentData.payload.txHash,
            amount: paymentData.payload.amount || '0.01',
            verifiedAt: new Date().toISOString()
          }
        }));
      } else {
        throw new Error('Invalid payment data');
      }
    } catch (err) {
      return corsHeaders(
        NextResponse.json({ 
          error: 'Invalid payment',
          message: 'Payment verification failed'
        }, { status: 402 })
      );
    }
    
  } catch (error) {
    console.error('X402 test error:', error);
    return corsHeaders(
      NextResponse.json(
        { error: error instanceof Error ? error.message : 'Internal server error' },
        { status: 500 }
      )
    );
  }
} 