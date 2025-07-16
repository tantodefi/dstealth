#!/usr/bin/env node

/**
 * Test script for Farcaster webhook endpoint
 */

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5001';
const WEBHOOK_URL = `${BACKEND_URL}/api/webhooks/farcaster/cast`;

// Mock Farcaster webhook data
const mockWebhookData = {
  type: 'cast.created',
  data: {
    object: 'cast',
    hash: '0x123456789abcdef',
    thread_hash: '0x987654321fedcba',
    author: {
      object: 'user',
      fid: 12345,
      username: 'testuser',
      display_name: 'Test User',
      pfp_url: 'https://example.com/pfp.png',
      custody_address: '0x1234567890123456789012345678901234567890',
      verified_addresses: {
        eth_addresses: ['0x1234567890123456789012345678901234567890'],
        sol_addresses: []
      },
      profile: {
        bio: {
          text: 'Test user bio'
        }
      },
      follower_count: 100,
      following_count: 50,
      power_badge: false
    },
    text: '@dstealth testuser.fkey.id',
    timestamp: new Date().toISOString(),
    embeds: [],
    reactions: {
      likes_count: 0,
      recasts_count: 0,
      likes: [],
      recasts: []
    },
    replies: {
      count: 0
    },
    mentioned_profiles: []
  },
  created_at: Math.floor(Date.now() / 1000)
};

async function testWebhook() {
  console.log('🧪 Testing Farcaster webhook endpoint...');
  console.log(`📍 Webhook URL: ${WEBHOOK_URL}`);
  console.log('📨 Sending mock cast data...');
  
  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Neynar-Webhook/1.0'
      },
      body: JSON.stringify(mockWebhookData)
    });

    console.log(`📊 Response status: ${response.status}`);
    console.log(`📊 Response status text: ${response.statusText}`);
    
    const responseText = await response.text();
    console.log('📄 Response body:', responseText);
    
    if (response.ok) {
      console.log('✅ Webhook endpoint is working!');
    } else {
      console.log('❌ Webhook endpoint returned an error');
    }
    
  } catch (error) {
    console.error('❌ Error testing webhook:', error.message);
    console.log('🔍 This might indicate:');
    console.log('  - Backend server is not running');
    console.log('  - Webhook route is not properly registered');
    console.log('  - Network connectivity issues');
  }
}

// Test the webhook endpoint
testWebhook().catch(console.error); 