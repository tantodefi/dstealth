import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { randomBytes } from 'crypto';
import { daimoPayClient, getDaimoChainId } from '@/lib/daimo-pay';

// Redis client setup - with safe initialization
const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

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
    const paymentUrl = await generatePaymentUrl(contentId, userAddress, amount);
    
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

    if (redis) {
    await redis.set(paymentKey, JSON.stringify(paymentRecord), { ex: 86400 }); // 24 hours
    }

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
  if (!redis) {
    console.warn('⚠️ Redis unavailable, skipping content stats update');
    return;
  }
  
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

async function generatePaymentUrl(contentId: string, userAddress?: string, userAmount?: string): Promise<string> {
  // 🚨 SECURITY: Require userAddress for all payment link generation
  if (!userAddress) {
    console.log(`❌ Frontend payment creation BLOCKED - no userAddress provided for content: ${contentId}`);
    throw new Error(`USER_REQUIRED: Payment link creation requires verified user identity. Please connect wallet and complete fkey.id setup at https://dstealth.xyz`);
  }

  // Get content metadata safely - use user's amount if provided
  let price = userAmount || '0.003'; // Use user's input amount or fallback
  let currency = 'USDC';
  let recipient = '0x706AfBE28b1e1CB40cd552Fa53A380f658e38332'; // Default fallback
  
  if (redis) {
    try {
    const contentData = await redis.get(`x402:content:${contentId}`);
    if (contentData) {
      const content = typeof contentData === 'string' ? JSON.parse(contentData) : contentData;
      price = content.pricing?.[0]?.amount?.toString() || price;
      currency = content.pricing?.[0]?.currency || currency;
      recipient = content.paymentRecipient || content.pricing?.[0]?.payTo || recipient;
    }
    } catch (redisError) {
      console.warn('⚠️ Redis unavailable, using default pricing:', redisError);
    }
  }

  // 🔥 CRITICAL: Get user's stealth address - FAIL if no fkey.id found
  let finalRecipient = recipient;
  let zkReceiptData = null;
  let userFkeyId = null;
  
  if (!redis) {
    console.log(`❌ Frontend payment creation BLOCKED - Redis unavailable for user verification`);
    throw new Error(`SYSTEM_ERROR: User verification system unavailable. Please try again later.`);
  }

  try {
    const userStealthKey = `dstealth_agent:stealth:${userAddress.toLowerCase()}`;
    const stealthData = await redis.get(userStealthKey);
    
    if (stealthData) {
      const userData = typeof stealthData === 'string' ? JSON.parse(stealthData) : stealthData;
      
      if (userData.stealthAddress && userData.fkeyId) {
        finalRecipient = userData.stealthAddress;
        userFkeyId = userData.fkeyId;
        console.log(`🥷 Using stealth address for payment: ${userData.stealthAddress} (${userData.fkeyId})`);
        
        zkReceiptData = {
          contentId,
          userStealthAddress: userData.stealthAddress,
          fkeyId: userData.fkeyId,
          zkProof: userData.zkProof,
          timestamp: Date.now(),
          paymentIntent: `X402 Content ${contentId}`,
          privacyLevel: 'stealth'
        };
      } else {
        // 🚨 HARD FAIL: User has data but missing fkey.id
        console.log(`❌ Frontend payment creation BLOCKED - incomplete setup for user: ${userAddress}`);
        throw new Error(`SETUP_REQUIRED: User ${userAddress} missing fkey.id or stealth address. Complete setup at https://dstealth.xyz first.`);
      }
    } else {
      // 🚨 HARD FAIL: User address provided but no stealth data found
      console.log(`❌ Frontend payment creation BLOCKED - no fkey.id for user: ${userAddress}`);
      throw new Error(`FKEY_REQUIRED: No FluidKey ID found for ${userAddress}. Get one at https://app.fluidkey.com/?ref=62YNSG then complete setup at https://dstealth.xyz`);
    }
  } catch (stealthError) {
    // Re-throw setup/fkey errors, catch other technical errors
    if (stealthError.message.startsWith('SETUP_REQUIRED') || stealthError.message.startsWith('FKEY_REQUIRED')) {
      throw stealthError;
    }
    console.warn('⚠️ Technical error retrieving stealth address:', stealthError);
    throw new Error(`TECHNICAL_ERROR: Could not retrieve user data for ${userAddress}. Please try again.`);
  }

  // 🔥 FIXED: Daimo expects dollar amounts, not smallest units
  const amountInDollars = parseFloat(price).toFixed(2);
  
  console.log('💰 Amount conversion details:', {
    originalPrice: price,
    parsedFloat: parseFloat(price),
    finalAmountInDollars: amountInDollars,
    daimoLimit: 4000,
    withinLimit: parseFloat(amountInDollars) <= 4000
  });
  
  console.log('🔗 Creating Daimo payment link with:', {
    destinationAddress: finalRecipient,
    amountUnits: amountInDollars,
    originalAmount: price,
    tokenSymbol: currency,
    chainId: getDaimoChainId('base'),
    userFkeyId: userFkeyId || 'none' // 🔥 Include fkey.id in logs for verification
  });
  
  // Build metadata without null values (Daimo API rejects null values)
  const metadata: Record<string, any> = {
    contentId,
    type: 'x402-content',
    service: 'dstealth-xmtp',
    recipientType: 'stealth', // 🔥 Always stealth now since we require fkey.id
  };
  
  // 🔥 ENHANCED: Always include fkey.id in metadata for trust verification
  metadata.verifiedFkeyId = userFkeyId;
  metadata.trustedIdentity = true;
  
  // Only add zkReceiptId if it exists
  if (zkReceiptData) {
    metadata.zkReceiptId = `zk_${contentId}_${Date.now()}`;
    // Add other zkReceiptData fields
    Object.assign(metadata, zkReceiptData);
  }

  const paymentLink = await daimoPayClient.createPaymentLink({
    destinationAddress: finalRecipient,
    amountUnits: amountInDollars,
    displayAmount: price, // Send the original dollar amount for display
    tokenSymbol: currency,
    chainId: getDaimoChainId('base'),
    externalId: contentId,
    intent: `ZK receipt for stealth payment to ${userFkeyId} at dstealth.xyz`,
    metadata
  });
  
  // Store ZK receipt if we have stealth address data
  if (zkReceiptData && redis) {
    try {
      const zkReceiptKey = `zk_receipt:${contentId}:${userAddress}:${Date.now()}`;
      await redis.set(zkReceiptKey, JSON.stringify({
        ...zkReceiptData,
        paymentLinkId: paymentLink.id,
        paymentUrl: paymentLink.url,
        status: 'pending',
        // 🔥 ENHANCED: Include verification details
        verification: {
          fkeyId: userFkeyId,
          stealthAddress: finalRecipient,
          timestamp: Date.now(),
          source: 'frontend-api'
        }
      }), { ex: 86400 * 7 }); // 7 days
      
      console.log(`🧾 ZK receipt created for stealth payment to ${userFkeyId}`);
    } catch (receiptError) {
      console.warn('⚠️ Failed to create ZK receipt:', receiptError);
    }
  }
  
  console.log(`✅ Created Daimo payment link via API: ${paymentLink.url}`);
  console.log(`🎯 Payment recipient: ${finalRecipient} (stealth-${userFkeyId})`);
  
  return paymentLink.url;
}

export async function OPTIONS(request: NextRequest) {
  return corsHeaders(new NextResponse(null, { status: 200 }));
} 