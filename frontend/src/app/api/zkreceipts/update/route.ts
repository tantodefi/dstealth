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
  console.warn('⚠️ Failed to initialize Redis for ZK receipts update API:', error);
}

export async function POST(request: NextRequest) {
  try {
    const { pattern, updates } = await request.json();
    
    if (!pattern || !updates) {
      return NextResponse.json({ error: 'Pattern and updates are required' }, { status: 400 });
    }

    if (!redis) {
      return NextResponse.json({ error: 'Redis not available' }, { status: 500 });
    }

    // Find keys matching the pattern
    const keys = await redis.keys(pattern);
    
    if (!keys || keys.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'No matching keys found',
        updatedCount: 0 
      });
    }

    let updatedCount = 0;
    
    // Update each matching key
    for (const key of keys) {
      try {
        const existingData = await redis.get(key);
        if (existingData) {
          const parsed = typeof existingData === 'string' ? JSON.parse(existingData) : existingData;
          
          // Merge updates with existing data
          const updatedData = {
            ...parsed,
            ...updates
          };
          
          // Store updated data back to Redis with 7-day expiration (local-first system)
          await redis.set(key, JSON.stringify(updatedData), { ex: 86400 * 7 });
          updatedCount++;
        }
      } catch (updateError) {
        console.warn(`⚠️ Failed to update ZK receipt ${key}:`, updateError);
      }
    }

    return NextResponse.json({ 
      success: true, 
      updatedCount,
      message: `Updated ${updatedCount} ZK receipts`
    });

  } catch (error) {
    console.error('❌ Error updating ZK receipts:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 