import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { daimoPayClient, getDaimoChainId } from '@/lib/daimo-pay';

// Redis client setup
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

interface PaymentStatus {
  isPaid: boolean;
  paymentUrl?: string;
  expiresAt?: string;
  accessToken?: string;
  transactionHash?: string;
}

function corsHeaders(response: NextResponse) {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Payment');
  return response;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const contentId = searchParams.get('id');
    const userAddress = searchParams.get('address');
    
    if (!contentId) {
      return corsHeaders(
        NextResponse.json({ error: 'Content ID is required' }, { status: 400 })
      );
    }

    console.log('💳 Checking payment status for content:', contentId);

    // Check for existing payment
    const paymentKey = userAddress ? `payment:${contentId}:${userAddress}` : `payment:${contentId}:guest`;
    const existingPayment = await redis.get(paymentKey);
    
    if (existingPayment) {
      const payment = typeof existingPayment === 'string' ? JSON.parse(existingPayment) : existingPayment;
      
      // Check if payment is still valid (not expired)
      if (payment.expiresAt && new Date(payment.expiresAt) > new Date()) {
        console.log('✅ Valid payment found');
        
        const status: PaymentStatus = {
          isPaid: true,
          accessToken: payment.accessToken,
          expiresAt: payment.expiresAt,
          transactionHash: payment.transactionHash
        };
        
        return corsHeaders(NextResponse.json(status));
      } else {
        console.log('⏰ Payment expired, removing from cache');
        await redis.del(paymentKey);
      }
    }

    // No valid payment found, generate payment URL
    const paymentStatus: PaymentStatus = {
      isPaid: false,
      paymentUrl: await generatePaymentUrl(contentId)
    };

    console.log('❌ No valid payment found, payment required');
    return corsHeaders(NextResponse.json(paymentStatus));

  } catch (error) {
    console.error('Payment status check error:', error);
    return corsHeaders(
      NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to check payment status' },
        { status: 500 }
      )
    );
  }
}

async function generatePaymentUrl(contentId: string): Promise<string> {
  try {
    // Get content metadata to determine payment details
    const contentData = await redis.get(`x402:content:${contentId}`);
    
    let price = '0.01';
    let currency = 'USDC';
    let recipient = '0x706AfBE28b1e1CB40cd552Fa53A380f658e38332'; // Default recipient
    
    if (contentData) {
      const content = typeof contentData === 'string' ? JSON.parse(contentData) : contentData;
      price = content.pricing?.[0]?.amount?.toString() || price;
      currency = content.pricing?.[0]?.currency || currency;
      recipient = content.paymentRecipient || content.pricing?.[0]?.payTo || recipient;
    }

    // 🔥 NEW: Use Daimo Pay API instead of deprecated deep links
    try {
      const paymentLink = await daimoPayClient.createPaymentLink({
        destinationAddress: recipient,
        amountUnits: price,
        tokenSymbol: currency,
        chainId: getDaimoChainId('base'),
        externalId: contentId,
        intent: `X402 Content ${contentId}`,
        metadata: {
          contentId,
          type: 'x402-content',
          service: 'dstealth-xmtp'
        }
      });
      
      console.log('💰 Generated payment URL via Daimo API:', { contentId, price, currency, recipient });
      return paymentLink.url;
      
    } catch (apiError) {
      console.warn('⚠️ Daimo API failed, falling back to legacy link:', apiError);
      
      // Fallback to legacy deep link if API fails
      return daimoPayClient.generateLegacyLink({
        amount: price,
        token: currency,
        chain: 'base',
        to: recipient,
        memo: `X402 Content ${contentId}`
      });
    }

  } catch (error) {
    console.error('Error generating payment URL:', error);
    // Ultimate fallback payment URL
    return daimoPayClient.generateLegacyLink({
      amount: '0.01',
      token: 'USDC',
      chain: 'base',
      to: '0x706AfBE28b1e1CB40cd552Fa53A380f658e38332',
      memo: 'X402 Content Payment'
    });
  }
}

export async function OPTIONS(request: NextRequest) {
  return corsHeaders(new NextResponse(null, { status: 200 }));
} 