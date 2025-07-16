#!/usr/bin/env tsx

/**
 * Test script for Farcaster webhook functionality
 * Tests the real-time cast mention processing
 */

import { env } from '../src/config/env.js';

// Mock webhook payload for testing
const mockWebhookPayload = {
  data: {
    object: 'cast',
    hash: '0x123456789abcdef',
    thread_hash: '0x123456789abcdef',
    author: {
      object: 'user',
      fid: 12345,
      username: 'testuser',
      display_name: 'Test User',
      pfp_url: 'https://example.com/pfp.jpg',
      custody_address: '0x742d35Cc6634C0532925a3b8D0b4E15AAD4F4b55',
      verified_addresses: {
        eth_addresses: ['0x742d35Cc6634C0532925a3b8D0b4E15AAD4F4b55'],
        sol_addresses: []
      },
      profile: {
        bio: {
          text: 'Test user for dStealth'
        }
      },
      follower_count: 100,
      following_count: 50,
      power_badge: false
    },
    text: '@dstealth tantodefi.fkey.id',
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
  created_at: Date.now(),
  type: 'cast.created'
};

const mockLookupPayload = {
  data: {
    object: 'cast',
    hash: '0x123456789abcdef',
    thread_hash: '0x123456789abcdef',
    author: {
      object: 'user',
      fid: 12345,
      username: 'testuser',
      display_name: 'Test User',
      pfp_url: 'https://example.com/pfp.jpg',
      custody_address: '0x742d35Cc6634C0532925a3b8D0b4E15AAD4F4b55',
      verified_addresses: {
        eth_addresses: ['0x742d35Cc6634C0532925a3b8D0b4E15AAD4F4b55'],
        sol_addresses: []
      },
      profile: {
        bio: {
          text: 'Test user for dStealth'
        }
      },
      follower_count: 100,
      following_count: 50,
      power_badge: false
    },
    text: '@dstealth tantodefi',
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
  created_at: Date.now(),
  type: 'cast.created'
};

async function testFarcasterWebhook() {
  console.log('🧪 Testing Farcaster Webhook Integration\n');
  
  // Check environment variables
  console.log('📋 Environment Check:');
  console.log(`  NEYNAR_API_KEY: ${env.NEYNAR_API_KEY ? '✅ Set' : '❌ Missing'}`);
  console.log(`  NEYNAR_SIGNER_UUID: ${env.NEYNAR_SIGNER_UUID ? '✅ Set' : '❌ Missing'}`);
  console.log(`  FRONTEND_URL: ${env.FRONTEND_URL || 'http://localhost:3000'}`);
  console.log();
  
  // Test webhook endpoints
  const backendUrl = env.BACKEND_URL || 'http://localhost:5001';
  const webhookUrl = `${backendUrl}/api/webhooks/farcaster/cast`;
  
  console.log('🔍 Testing Webhook Endpoints:');
  console.log(`  Webhook URL: ${webhookUrl}`);
  console.log();
  
  // Test 1: Test endpoint availability
  console.log('🧪 Test 1: Webhook Endpoint Availability');
  try {
    const testResponse = await fetch(`${backendUrl}/api/webhooks/farcaster/test`);
    if (testResponse.ok) {
      const testData = await testResponse.json();
      console.log('✅ Webhook endpoint is available');
      console.log(`  Status: ${testData.status}`);
      console.log(`  Features: ${testData.features.length} features available`);
    } else {
      console.log('❌ Webhook endpoint not available');
      console.log(`  Status: ${testResponse.status}`);
    }
  } catch (error) {
    console.log('❌ Failed to reach webhook endpoint');
    console.log(`  Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  console.log();
  
  // Test 2: Test fkey.id setting via cast
  console.log('🧪 Test 2: Cast with fkey.id Setting');
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(mockWebhookPayload)
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ fkey.id setting webhook processed successfully');
      console.log(`  Message: ${data.message}`);
      console.log(`  fkey.id: ${data.fkeyId}`);
      console.log(`  Username: ${data.username}`);
      console.log(`  FID: ${data.fid}`);
    } else {
      const errorData = await response.json();
      console.log('❌ fkey.id setting webhook failed');
      console.log(`  Status: ${response.status}`);
      console.log(`  Error: ${errorData.error}`);
    }
  } catch (error) {
    console.log('❌ Failed to test fkey.id setting');
    console.log(`  Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  console.log();
  
  // Test 3: Test fkey.id lookup via cast
  console.log('🧪 Test 3: Cast with fkey.id Lookup');
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(mockLookupPayload)
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ fkey.id lookup webhook processed successfully');
      console.log(`  Message: ${data.message}`);
      console.log(`  Reply: ${data.reply}`);
      if (data.fkeyId) {
        console.log(`  Found fkey.id: ${data.fkeyId}`);
      } else {
        console.log(`  Search query: ${data.searchQuery}`);
      }
    } else {
      const errorData = await response.json();
      console.log('❌ fkey.id lookup webhook failed');
      console.log(`  Status: ${response.status}`);
      console.log(`  Error: ${errorData.error}`);
    }
  } catch (error) {
    console.log('❌ Failed to test fkey.id lookup');
    console.log(`  Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  console.log();
  
  console.log('🎯 Test Summary:');
  console.log('  - Webhook endpoint registration: Check server logs');
  console.log('  - Cast mention processing: Check above results');
  console.log('  - fkey.id setting: Check database for new entries');
  console.log('  - Cast replies: Check Neynar API logs');
  console.log();
  
  console.log('📝 To enable real-time processing:');
  console.log('  1. Register webhook with Neynar:');
  console.log(`     URL: ${webhookUrl}`);
  console.log('     Events: ["cast.created"]');
  console.log('     Filters: {"mentions": ["dstealth"]}');
  console.log('  2. Configure NEYNAR_SIGNER_UUID for cast replies');
  console.log('  3. Test with real Farcaster cast: "@dstealth yourusername.fkey.id"');
}

// Run tests
testFarcasterWebhook().catch(console.error); 