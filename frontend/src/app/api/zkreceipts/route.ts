import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

// Initialize Redis client
let redis: Redis | null = null;
try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
} catch (error) {
  console.warn('⚠️ Failed to initialize Redis for ZK receipts API:', error);
}

export async function POST(request: NextRequest) {
  try {
    const { key, data } = await request.json();
    
    if (!key || !data) {
      return NextResponse.json({ error: 'Key and data are required' }, { status: 400 });
    }

    if (!redis) {
      return NextResponse.json({ error: 'Redis not available' }, { status: 500 });
    }

    // Store ZK receipt in Redis with 7-day expiration (local-first system)
    await redis.set(key, JSON.stringify(data), { ex: 86400 * 7 });

    return NextResponse.json({ success: true, key });
  } catch (error) {
    console.error('❌ Error saving ZK receipt:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userAddress = searchParams.get('userAddress');
    
    if (!userAddress) {
      return NextResponse.json({ error: 'User address is required' }, { status: 400 });
    }

    if (!redis) {
      return NextResponse.json({ zkReceipts: [] }); // Return empty array if Redis not available
    }

    // Get all ZK receipt keys for this user
    const pattern = `zk_receipt:*:${userAddress.toLowerCase()}:*`;
    const keys = await redis.keys(pattern);

    if (!keys || keys.length === 0) {
      return NextResponse.json({ zkReceipts: [] });
    }

    // Retrieve all ZK receipts
    const zkReceipts = [];
    for (const key of keys) {
      try {
        const receiptData = await redis.get(key);
        if (receiptData) {
          const receipt = typeof receiptData === 'string' ? JSON.parse(receiptData) : receiptData;
          zkReceipts.push({
            id: key,
            ...receipt
          });
        }
      } catch (parseError) {
        console.warn(`⚠️ Failed to parse ZK receipt ${key}:`, parseError);
      }
    }

    // Sort by timestamp (newest first)
    zkReceipts.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    return NextResponse.json({
      zkReceipts,
      total: zkReceipts.length
    });
  } catch (error) {
    console.error('❌ Error fetching ZK receipts:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 