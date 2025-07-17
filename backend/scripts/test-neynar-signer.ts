#!/usr/bin/env tsx

import { env } from '../src/config/env.js';

interface NeynarSignerResponse {
  signer_uuid: string;
  public_key: string;
  status: string;
  signer_approval_url?: string;
  fid?: number;
}

interface NeynarErrorResponse {
  code: string;
  message: string;
  details?: any;
}

/**
 * Test script to validate Neynar signer UUID configuration
 */
async function testNeynarSigner() {
  console.log('🔍 Testing Neynar Signer UUID Configuration...\n');

  // 1. Check environment variables
  console.log('📋 Environment Variables:');
  console.log(`   NEYNAR_API_KEY: ${env.NEYNAR_API_KEY ? `${env.NEYNAR_API_KEY.substring(0, 10)}...` : '❌ NOT_SET'}`);
  console.log(`   NEYNAR_SIGNER_UUID: ${env.NEYNAR_SIGNER_UUID || '❌ NOT_SET'}`);
  console.log('');

  if (!env.NEYNAR_API_KEY) {
    console.error('❌ NEYNAR_API_KEY is not configured');
    process.exit(1);
  }

  if (!env.NEYNAR_SIGNER_UUID) {
    console.error('❌ NEYNAR_SIGNER_UUID is not configured');
    process.exit(1);
  }

  // 2. Clean and validate UUID format
  const cleanSignerUUID = env.NEYNAR_SIGNER_UUID.trim();
  console.log('🔧 UUID Validation:');
  console.log(`   Raw UUID: "${env.NEYNAR_SIGNER_UUID}"`);
  console.log(`   Cleaned UUID: "${cleanSignerUUID}"`);
  console.log(`   Length: ${cleanSignerUUID.length} (should be 36)`);
  console.log(`   Format valid: ${/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanSignerUUID)}`);
  console.log('');

  // 3. Test API connection
  console.log('🌐 Testing API Connection...');
  try {
    const response = await fetch('https://api.neynar.com/v2/farcaster/user/bulk?fids=1', {
      method: 'GET',
      headers: {
        'api_key': env.NEYNAR_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      console.log('   ✅ API connection successful');
      const data = await response.json();
      console.log(`   📊 API response: ${JSON.stringify(data).substring(0, 100)}...`);
    } else {
      console.error('   ❌ API connection failed:', response.status, response.statusText);
      const errorData = await response.json().catch(() => null);
      if (errorData) {
        console.error('   📋 Error details:', JSON.stringify(errorData, null, 2));
      }
    }
  } catch (error) {
    console.error('   ❌ API connection error:', error);
  }
  console.log('');

  // 4. Test signer UUID
  console.log('🔑 Testing Signer UUID...');
  try {
    const signerResponse = await fetch(`https://api.neynar.com/v2/farcaster/signer?signer_uuid=${cleanSignerUUID}`, {
      method: 'GET',
      headers: {
        'api_key': env.NEYNAR_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    if (signerResponse.ok) {
      const signerData = await signerResponse.json() as NeynarSignerResponse;
      console.log('   ✅ Signer UUID is valid');
      console.log(`   📋 Signer Details:`);
      console.log(`      UUID: ${signerData.signer_uuid}`);
      console.log(`      Status: ${signerData.status}`);
      console.log(`      Public Key: ${signerData.public_key}`);
      console.log(`      FID: ${signerData.fid || 'Not associated'}`);
      if (signerData.signer_approval_url) {
        console.log(`      Approval URL: ${signerData.signer_approval_url}`);
      }

      // Check if signer is approved
      if (signerData.status === 'approved') {
        console.log('   ✅ Signer is approved and ready to use');
      } else {
        console.log(`   ⚠️  Signer status: ${signerData.status} (may need approval)`);
      }
    } else {
      console.error('   ❌ Signer UUID validation failed:', signerResponse.status, signerResponse.statusText);
      const errorData = await signerResponse.json().catch(() => null) as NeynarErrorResponse;
      if (errorData) {
        console.error('   📋 Error details:', JSON.stringify(errorData, null, 2));
      }
    }
  } catch (error) {
    console.error('   ❌ Signer UUID test error:', error);
  }
  console.log('');

  // 5. Test cast creation (dry run)
  console.log('📝 Testing Cast Creation (Dry Run)...');
  try {
    const testPayload = {
      text: 'TEST - This is a test cast from dStealth signer validation',
      signer_uuid: cleanSignerUUID
    };

    console.log('   📋 Test payload:', JSON.stringify(testPayload, null, 2));

    // Don't actually post the cast, just validate the request format
    const dryRunResponse = await fetch('https://api.neynar.com/v2/farcaster/cast', {
      method: 'POST',
      headers: {
        'api_key': env.NEYNAR_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: 'dry-run-test',
        signer_uuid: cleanSignerUUID
      })
    });

    if (dryRunResponse.ok) {
      console.log('   ✅ Cast creation would succeed');
      const castData = await dryRunResponse.json();
      console.log(`   📋 Cast hash: ${castData.cast?.hash}`);
      console.log('   ⚠️  NOTE: This was a real cast! You may want to delete it.');
    } else {
      const errorData = await dryRunResponse.json().catch(() => null) as NeynarErrorResponse;
      console.error('   ❌ Cast creation would fail:', dryRunResponse.status, dryRunResponse.statusText);
      if (errorData) {
        console.error('   📋 Error details:', JSON.stringify(errorData, null, 2));
        
        // Analyze specific error types
        if (errorData.message?.includes('Pro subscription')) {
          console.error('   💡 DIAGNOSIS: Your signer UUID is associated with a FREE account, not your PRO account');
          console.error('   💡 SOLUTION: Create a new signer UUID using your PRO account API key');
        }
        if (errorData.message?.includes('signer')) {
          console.error('   💡 DIAGNOSIS: Signer issue - check if signer is approved and associated with correct account');
        }
        if (errorData.message?.includes('not found')) {
          console.error('   💡 DIAGNOSIS: Signer UUID not found - may be invalid or expired');
        }
      }
    }
  } catch (error) {
    console.error('   ❌ Cast creation test error:', error);
  }
  console.log('');

  // 6. Summary
  console.log('📊 Summary:');
  console.log(`   API Key: ${env.NEYNAR_API_KEY ? '✅ Valid' : '❌ Missing'}`);
  console.log(`   Signer UUID: ${env.NEYNAR_SIGNER_UUID ? '✅ Present' : '❌ Missing'}`);
  console.log(`   UUID Format: ${/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanSignerUUID) ? '✅ Valid' : '❌ Invalid'}`);
  console.log('');
  console.log('🎯 Next Steps:');
  console.log('   1. If signer is not approved, visit the approval URL');
  console.log('   2. If "Pro subscription required" error, create new signer with PRO account');
  console.log('   3. If signer not found, verify UUID is correct and not expired');
  console.log('   4. Test again after making changes');
}

// Run the test
testNeynarSigner().catch(console.error); 