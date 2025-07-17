#!/usr/bin/env tsx

import { env } from '../src/config/env.js';

/**
 * Test replying to the specific cast that failed in the webhook
 */
async function testCastReply() {
  console.log('🔍 Testing Cast Reply (the exact scenario that failed)...\n');

  const parentCastHash = '0xa47f9a7ccdfc981e6ff6917d30bb8af7f9356cff';
  const testMessage = 'Test reply - checking if this specific cast can be replied to';

  console.log('📋 Test Details:');
  console.log(`   Parent Cast Hash: ${parentCastHash}`);
  console.log(`   Reply Message: ${testMessage}`);
  console.log(`   Signer UUID: ${env.NEYNAR_SIGNER_UUID}`);
  console.log('');

  const payload = {
    text: testMessage,
    parent: parentCastHash,
    signer_uuid: env.NEYNAR_SIGNER_UUID
  };

  console.log('📋 API Request Payload:');
  console.log(JSON.stringify(payload, null, 2));
  console.log('');

  try {
    console.log('🚀 Sending reply request...');
    const response = await fetch('https://api.neynar.com/v2/farcaster/cast', {
      method: 'POST',
      headers: {
        'api_key': env.NEYNAR_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ REPLY SUCCESSFUL!');
      console.log(`   Cast Hash: ${data.cast.hash}`);
      console.log(`   Cast URL: https://warpcast.com/${data.cast.author.username}/${data.cast.hash}`);
      console.log('');
      console.log('🎯 DIAGNOSIS: Your signer works for both root casts AND replies!');
      console.log('💡 The webhook issue might be:');
      console.log('   1. Content length (GPT response might be too long)');
      console.log('   2. Rate limiting (too many requests)');
      console.log('   3. Parent cast validation issue');
      console.log('   4. Different API behavior under load');
    } else {
      const errorData = await response.json();
      console.error('❌ REPLY FAILED:');
      console.error(`   Status: ${response.status}`);
      console.error(`   Error: ${JSON.stringify(errorData, null, 2)}`);
      console.log('');
      console.log('🎯 DIAGNOSIS: Issue found with cast replying!');
      
      if (errorData.message?.includes('Pro subscription')) {
        console.log('💡 Pro subscription issue detected');
      }
      if (errorData.message?.includes('parent')) {
        console.log('💡 Parent cast issue - might not exist or be replyable');
      }
      if (errorData.message?.includes('rate')) {
        console.log('💡 Rate limiting issue');
      }
    }
  } catch (error) {
    console.error('❌ Network/Request Error:', error);
  }
}

testCastReply().catch(console.error); 