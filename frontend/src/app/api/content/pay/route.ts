import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { randomBytes } from 'crypto';

// Redis client setup
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

interface PaymentRequest {
  transactionHash?: string;
  userAddress?: string;
  amount?: string;
  currency?: string;
  network?: string;
}

interface PaymentResponse {
  success: boolean;
  accessToken?: string;
  expiresAt?: string;
  paymentUrl?: string;
  contentUrl?: string;
  error?: string;
}

function corsHeaders(response: NextResponse) {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Payment');
  return response;
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const contentId = searchParams.get('id');
    
    if (!contentId) {
      return corsHeaders(
        NextResponse.json({ error: 'Content ID is required' }, { status: 400 })
      );
    }

    const body = await request.json().catch(() => ({}));
    const { transactionHash, userAddress, amount, currency, network }: PaymentRequest = body;

    console.log('💳 Processing payment for content:', contentId, { transactionHash, userAddress, amount });

    // If transaction hash is provided, verify it (simplified for demo)
    if (transactionHash) {
      const paymentResult = await processBlockchainPayment(contentId, {
        transactionHash,
        userAddress,
        amount,
        currency,
        network
      });
      
      return corsHeaders(NextResponse.json(paymentResult));
    }

    // If no transaction hash, return payment URL for user to complete payment
    const paymentUrl = await generatePaymentUrl(contentId);
    
    const response: PaymentResponse = {
      success: false,
      paymentUrl,
      error: 'Payment required'
    };

    return corsHeaders(NextResponse.json(response));

  } catch (error) {
    console.error('Payment processing error:', error);
    return corsHeaders(
      NextResponse.json(
        { 
          success: false, 
          error: error instanceof Error ? error.message : 'Payment processing failed' 
        },
        { status: 500 }
      )
    );
  }
}

async function processBlockchainPayment(contentId: string, payment: PaymentRequest): Promise<PaymentResponse> {
  try {
    // In a real implementation, you would:
    // 1. Verify the transaction on-chain
    // 2. Check the amount matches the content price
    // 3. Confirm the recipient is correct
    // 4. Ensure the transaction is confirmed
    
    // For demo purposes, we'll simulate verification
    const isValidPayment = await verifyPayment(payment);
    
    if (!isValidPayment) {
      return {
        success: false,
        error: 'Payment verification failed'
      };
    }

    // Generate access token
    const accessToken = generateAccessToken(contentId, payment.userAddress || 'anonymous');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours
    
    // Store payment record in Redis
    const paymentKey = payment.userAddress ? 
      `payment:${contentId}:${payment.userAddress}` : 
      `payment:${contentId}:guest`;
    
    const paymentRecord = {
      contentId,
      transactionHash: payment.transactionHash,
      userAddress: payment.userAddress,
      amount: payment.amount,
      currency: payment.currency,
      network: payment.network,
      accessToken,
      expiresAt,
      paidAt: new Date().toISOString()
    };

    await redis.set(paymentKey, JSON.stringify(paymentRecord), { ex: 86400 }); // 24 hours

    // Update content access stats
    await updateContentStats(contentId, payment);

    console.log('✅ Payment processed successfully');

    return {
      success: true,
      accessToken,
      expiresAt,
      contentUrl: `${process.env.NEXT_PUBLIC_URL}/api/content/load?id=${contentId}&token=${accessToken}`
    };

  } catch (error) {
    console.error('Blockchain payment processing error:', error);
    return {
      success: false,
      error: 'Failed to process blockchain payment'
    };
  }
}

async function verifyPayment(payment: PaymentRequest): Promise<boolean> {
  // Simplified verification for demo
  // In production, you would:
  // 1. Call blockchain RPC to get transaction details
  // 2. Verify recipient address
  // 3. Check transaction amount
  // 4. Confirm transaction is confirmed
  
  if (!payment.transactionHash || payment.transactionHash.length < 10) {
    return false;
  }
  
  // Mock verification - in real implementation, check on-chain
  console.log('🔍 Verifying payment (mock):', payment.transactionHash);
  
  // Simulate async blockchain verification
  await new Promise(resolve => setTimeout(resolve, 100));
  
  return true; // Simplified for demo
}

function generateAccessToken(contentId: string, userAddress: string): string {
  const payload = {
    contentId,
    userAddress,
    issuedAt: Date.now(),
    issuer: 'x402-payment-system'
  };
  
  // Simple base64 token for demo
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

async function updateContentStats(contentId: string, payment: PaymentRequest): Promise<void> {
  try {
    const statsKey = `content:stats:${contentId}`;
    const stats = await redis.get(statsKey);
    
    let currentStats = {
      totalPurchases: 0,
      totalRevenue: 0,
      uniquePayers: new Set<string>(),
      lastPurchase: null
    };

    if (stats) {
      const parsed = typeof stats === 'string' ? JSON.parse(stats) : stats;
      currentStats = {
        totalPurchases: parsed.totalPurchases || 0,
        totalRevenue: parsed.totalRevenue || 0,
        uniquePayers: new Set(parsed.uniquePayers || []),
        lastPurchase: parsed.lastPurchase
      };
    }

    // Update stats
    currentStats.totalPurchases += 1;
    currentStats.totalRevenue += parseFloat(payment.amount || '0.01');
    if (payment.userAddress) {
      currentStats.uniquePayers.add(payment.userAddress);
    }
    currentStats.lastPurchase = new Date().toISOString();

    // Store updated stats
    const updatedStats = {
      ...currentStats,
      uniquePayers: Array.from(currentStats.uniquePayers)
    };

    await redis.set(statsKey, JSON.stringify(updatedStats), { ex: 86400 * 30 }); // 30 days

    console.log('📊 Updated content stats for:', contentId);

  } catch (error) {
    console.error('Error updating content stats:', error);
  }
}

async function generatePaymentUrl(contentId: string): Promise<string> {
  try {
    // Get content metadata
    const contentData = await redis.get(`x402:content:${contentId}`);
    
    let price = '0.01';
    let currency = 'USDC';
    let recipient = '0x706AfBE28b1e1CB40cd552Fa53A380f658e38332';
    
    if (contentData) {
      const content = typeof contentData === 'string' ? JSON.parse(contentData) : contentData;
      price = content.pricing?.[0]?.amount?.toString() || price;
      currency = content.pricing?.[0]?.currency || currency;
      recipient = content.paymentRecipient || content.pricing?.[0]?.payTo || recipient;
    }

    // Generate payment URL
    return `https://daimo.com/l/pay?amount=${price}&token=${currency}&chain=base&to=${recipient}&memo=X402%20Content%20${contentId}`;

  } catch (error) {
    console.error('Error generating payment URL:', error);
    return `https://daimo.com/l/pay?amount=0.01&token=USDC&chain=base&memo=X402%20Payment`;
  }
}

export async function OPTIONS(request: NextRequest) {
  return corsHeaders(new NextResponse(null, { status: 200 }));
} 