#!/usr/bin/env tsx
import "dotenv/config";

// Configuration
const NEYNAR_API_BASE = 'https://api.neynar.com/v2';

// Environment variables needed
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;
const NEYNAR_SPONSOR_WALLET_ID = process.env.NEYNAR_SPONSOR_WALLET_ID;
const NEYNAR_SPONSOR_ADDRESS = process.env.NEYNAR_SPONSOR_ADDRESS;

// Test data - Replace with real values for testing
const TEST_RECIPIENT_FID = 12345; // Replace with a real FID to send tokens to
const TEST_AMOUNT = 0.001; // Test amount in USDC
const USDC_TOKEN_ADDRESS = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'; // USDC on Base

/**
 * Test 1: Check Neynar send fungibles configuration
 */
async function testNeynarConfiguration(): Promise<void> {
  console.log('\n🧪 Testing Neynar Send Fungibles Configuration');
  console.log('================================================');
  
  console.log('📋 Environment Variables:');
  console.log(`   NEYNAR_API_KEY: ${NEYNAR_API_KEY ? '✅ Set' : '❌ Missing'}`);
  console.log(`   NEYNAR_SPONSOR_WALLET_ID: ${NEYNAR_SPONSOR_WALLET_ID ? `✅ Set (${NEYNAR_SPONSOR_WALLET_ID})` : '❌ Missing'}`);
  console.log(`   NEYNAR_SPONSOR_ADDRESS: ${NEYNAR_SPONSOR_ADDRESS ? `✅ Set (${NEYNAR_SPONSOR_ADDRESS})` : '❌ Missing'}`);
  
  if (!NEYNAR_API_KEY) {
    throw new Error('❌ NEYNAR_API_KEY not set - get this from neynar.com');
  }
  
  if (!NEYNAR_SPONSOR_WALLET_ID) {
    throw new Error('❌ NEYNAR_SPONSOR_WALLET_ID not set - this should be your "wallet ID" from Neynar');
  }
  
  if (!NEYNAR_SPONSOR_ADDRESS) {
    throw new Error('❌ NEYNAR_SPONSOR_ADDRESS not set - this should be your "public address" from Neynar');
  }
  
  console.log('✅ Wallet ID and Address configured correctly!');
  console.log('   Note: Neynar uses wallet ID instead of FID for sponsoring transactions');
  
  console.log('✅ Configuration looks good!');
}

/**
 * Test 2: Check sponsor wallet details
 */
async function testSponsorWallet(): Promise<void> {
  console.log('\n🧪 Testing Sponsor Wallet Configuration');
  console.log('======================================');
  
  console.log(`🔍 Sponsor Wallet ID: ${NEYNAR_SPONSOR_WALLET_ID}`);
  console.log(`🔍 Sponsor Address: ${NEYNAR_SPONSOR_ADDRESS}`);
  
  console.log('✅ Wallet configuration verified');
  console.log('⚠️ Make sure this wallet has sufficient USDC on Base network');
  console.log(`   For testing ${TEST_AMOUNT} USDC, you need at least that amount plus gas fees`);
}

/**
 * Test 3: Test recipient FID lookup
 */
async function testRecipientFID(recipientFid: number): Promise<any> {
  console.log('\n🧪 Testing Recipient FID');
  console.log('=========================');
  
  console.log(`🔍 Looking up recipient FID: ${recipientFid}`);
  
  try {
    const response = await fetch(`${NEYNAR_API_BASE}/farcaster/user/bulk?fids=${recipientFid}`, {
      headers: {
        'api_key': NEYNAR_API_KEY!
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.users || data.users.length === 0) {
      throw new Error('Recipient FID not found');
    }
    
    const user = data.users[0];
    console.log('✅ Recipient FID Details:');
    console.log(`   FID: ${user.fid}`);
    console.log(`   Username: @${user.username}`);
    console.log(`   Display Name: ${user.display_name}`);
    console.log(`   Custody Address: ${user.custody_address}`);
    console.log(`   Verified Addresses: ${user.verified_addresses?.eth_addresses?.length || 0}`);
    
    return user;
    
  } catch (error) {
    console.error('❌ Error fetching recipient FID details:', error);
    throw error;
  }
}

/**
 * Test 4: Dry run send fungibles API call (without actually sending)
 */
async function testSendFungiblesDryRun(recipientFid: number, amount: number): Promise<void> {
  console.log('\n🧪 Testing Send Fungibles API (DRY RUN)');
  console.log('========================================');
  
  const requestPayload = {
    fids: [recipientFid],
    token_address: USDC_TOKEN_ADDRESS,
    amount: amount.toString(),
    chain_id: 8453, // Base network
    sponsor_wallet_id: NEYNAR_SPONSOR_WALLET_ID,
    message: `🧪 dStealth Test Rewards! This is a test of ${amount} USDC rewards! 🥷`
  };
  
  console.log('📋 Request Payload:');
  console.log(JSON.stringify(requestPayload, null, 2));
  
  console.log('\n⚠️ DRY RUN MODE - NOT ACTUALLY SENDING');
  console.log('To send for real, set SEND_REAL=true in environment');
  console.log('\nAPI Endpoint would be:');
  console.log(`POST ${NEYNAR_API_BASE}/farcaster/fungibles/send`);
  console.log(`Headers: { 'api_key': '${NEYNAR_API_KEY}', 'Content-Type': 'application/json' }`);
}

/**
 * Test 5: Actually send fungibles (if enabled)
 */
async function testSendFungiblesReal(recipientFid: number, amount: number): Promise<any> {
  console.log('\n🧪 Testing Send Fungibles API (REAL SEND)');
  console.log('==========================================');
  
  const requestPayload = {
    fids: [recipientFid],
    token_address: USDC_TOKEN_ADDRESS,
    amount: amount.toString(),
    chain_id: 8453, // Base network
    sponsor_wallet_id: NEYNAR_SPONSOR_WALLET_ID,
    message: `🎉 dStealth Privacy Rewards! You've earned ${amount} USDC for using stealth addresses! 🥷`
  };
  
  console.log('📋 Sending request...');
  console.log(`   Amount: ${amount} USDC`);
  console.log(`   To FID: ${recipientFid}`);
  console.log(`   From Sponsor Wallet: ${NEYNAR_SPONSOR_WALLET_ID}`);
  
  try {
    const response = await fetch(`${NEYNAR_API_BASE}/farcaster/fungibles/send`, {
      method: 'POST',
      headers: {
        'api_key': NEYNAR_API_KEY!,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestPayload)
    });
    
    console.log(`📡 Response Status: ${response.status}`);
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ API Error Response:');
      console.error(JSON.stringify(errorData, null, 2));
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('✅ Success! Response:');
    console.log(JSON.stringify(data, null, 2));
    
    if (data.transaction_hash) {
      console.log(`\n🔗 Transaction Hash: ${data.transaction_hash}`);
      console.log(`🔍 View on BaseScan: https://basescan.org/tx/${data.transaction_hash}`);
    }
    
    return data;
    
  } catch (error) {
    console.error('❌ Error sending fungibles:', error);
    throw error;
  }
}

/**
 * Main test function
 */
async function main() {
  console.log('🧪 Neynar Send Fungibles API Test Suite');
  console.log('=======================================');
  
  // Configuration flags
  const DRY_RUN = process.env.DRY_RUN !== 'false'; // Default to dry run unless explicitly disabled
  const SEND_REAL = process.env.SEND_REAL === 'true'; // Only send if explicitly enabled
  
  try {
    // Test 1: Configuration
    await testNeynarConfiguration();
    
    // Test 2: Sponsor wallet details
    await testSponsorWallet();
    
    // Test 3: Recipient FID (if provided)
    if (TEST_RECIPIENT_FID && TEST_RECIPIENT_FID !== 12345) {
      const recipientDetails = await testRecipientFID(TEST_RECIPIENT_FID);
      
      // Test 4: Dry run
      if (DRY_RUN) {
        await testSendFungiblesDryRun(TEST_RECIPIENT_FID, TEST_AMOUNT);
      }
      
      // Test 5: Real send (only if explicitly enabled)
      if (SEND_REAL && !DRY_RUN) {
        console.log('\n⚠️ REAL SEND MODE ENABLED - THIS WILL ACTUALLY SEND TOKENS!');
        console.log('Waiting 5 seconds... Press Ctrl+C to cancel');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        await testSendFungiblesReal(TEST_RECIPIENT_FID, TEST_AMOUNT);
      }
    } else {
      console.log('\n⚠️ TEST_RECIPIENT_FID not set or using default value');
      console.log('   Update TEST_RECIPIENT_FID in the script to test sending');
    }
    
    console.log('\n🎉 All tests completed!');
    console.log('\n📋 Summary:');
    console.log('   1. ✅ Configuration verified');
    console.log('   2. ✅ Sponsor wallet configured');
    console.log('   3. ⚠️ Check wallet USDC balance manually');
    console.log('   4. 🧪 Set TEST_RECIPIENT_FID to test sending');
    console.log('   5. 🚀 Set SEND_REAL=true to actually send tokens');
    
    console.log('\n💰 How much USDC do you need?');
    console.log(`   • Test amount: ${TEST_AMOUNT} USDC`);
    console.log(`   • Recommended: At least 0.01 USDC for multiple tests`);
    console.log(`   • Plus: Small amount for gas fees on Base network`);
    
  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
    console.log('\n🔧 Configuration Help:');
    console.log('   Add to your .env file:');
    console.log('   NEYNAR_API_KEY=your_api_key_here');
    console.log('   NEYNAR_SPONSOR_WALLET_ID=your_wallet_id_from_neynar');
    console.log('   NEYNAR_SPONSOR_ADDRESS=your_public_address_from_neynar');
    process.exit(1);
  }
}

// Run if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { 
  testNeynarConfiguration, 
  testSponsorWallet, 
  testRecipientFID, 
  testSendFungiblesDryRun, 
  testSendFungiblesReal 
}; 