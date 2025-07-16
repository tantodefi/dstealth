#!/usr/bin/env node

/**
 * Test script for Farcaster webhook endpoint without signature verification
 */

const BACKEND_URL = process.env.BACKEND_URL || 'https://xmtp-mini-app-examples.onrender.com';
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

async function testWebhookLogic() {
  console.log('🧪 Testing Farcaster webhook logic (bypassing signature verification)...');
  console.log(`📍 Webhook URL: ${WEBHOOK_URL}`);
  console.log('📨 Sending mock cast data...');
  
  try {
    // Test without signature first to see if logic works
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Neynar-Webhook/1.0'
        // No signature header - should be rejected but we can see the error
      },
      body: JSON.stringify(mockWebhookData)
    });

    console.log(`📊 Response status: ${response.status}`);
    console.log(`📊 Response status text: ${response.statusText}`);
    
    const responseText = await response.text();
    console.log('📄 Response body:', responseText);
    
    if (response.status === 401) {
      console.log('✅ Signature verification is working (expected 401)');
      console.log('');
      console.log('🔍 WEBHOOK DIAGNOSIS:');
      console.log('✅ Webhook endpoint is accessible');
      console.log('✅ Webhook signature verification is active');
      console.log('✅ Route is properly registered');
      console.log('');
      console.log('❓ POSSIBLE ISSUES:');
      console.log('1. Webhook URL in Neynar dashboard might be wrong');
      console.log('2. Webhook secret in Neynar might not match your .env');
      console.log('3. Webhook might not be triggered by your cast');
      console.log('4. Cast might not contain the right mention format');
      console.log('');
      console.log('🔧 NEXT STEPS:');
      console.log('1. Check your Neynar webhook URL should be:');
      console.log(`   ${WEBHOOK_URL}`);
      console.log('2. Verify NEYNAR_WEBHOOK_SECRET in your .env matches Neynar dashboard');
      console.log('3. Try casting: "@dstealth username.fkey.id" (replace username with actual fkey.id)');
      console.log('4. Check your backend logs for webhook attempts');
      
    } else if (response.ok) {
      console.log('⚠️  Signature verification might be disabled');
    } else {
      console.log('❌ Webhook endpoint has other issues');
    }
    
  } catch (error) {
    console.error('❌ Error testing webhook:', error.message);
  }
}

// Test the webhook endpoint
testWebhookLogic().catch(console.error); 