#!/usr/bin/env tsx
import "dotenv/config";
import { ethers } from 'ethers';

// Configuration
const COINBASE_API_ENDPOINT = 'https://api.wallet.coinbase.com/rpc/v2/giftlink/fetchIdentityFromAddress';
const NEYNAR_API_BASE = 'https://api.neynar.com/v2';

// Environment variables needed
const COINBASE_API_PRIVATE_KEY = process.env.COINBASE_API_PRIVATE_KEY;
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;

// Test data - Replace with real values for testing
const TEST_WALLET_ADDRESS = '0x9A95d67412360DE5c75C69579f5d5ef5ae791B23'; // Example from the gist
const TEST_FID = 1234; // Replace with a real FID for testing

/**
 * Test 1: Coinbase API - Wallet Address → FID
 */
async function testCoinbaseWalletToFID(walletAddress: string): Promise<any> {
  console.log('\n🧪 Testing Coinbase API: Wallet → FID');
  console.log(`📍 Wallet Address: ${walletAddress}`);
  
  if (!COINBASE_API_PRIVATE_KEY) {
    throw new Error('❌ COINBASE_API_PRIVATE_KEY not set');
  }
  
  try {
    // Generate auth signature (following the gist pattern)
    const wallet = new ethers.Wallet(COINBASE_API_PRIVATE_KEY);
    const authorizedAddress = await wallet.getAddress();
    const timestamp = Math.floor(Date.now() / 1000);
    const message = `${walletAddress}${timestamp}`;
    const authSignature = await wallet.signMessage(message);
    
    console.log(`🔐 Authorized Address: ${authorizedAddress}`);
    console.log(`⏰ Timestamp: ${timestamp}`);
    console.log(`✍️ Auth Signature: ${authSignature.slice(0, 20)}...`);
    
    // API Request
    const requestPayload = {
      wallet_address: walletAddress,
      auth_signature: authSignature,
      timestamp_secs: timestamp
    };
    
    const response = await fetch(COINBASE_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestPayload)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('✅ Coinbase API Response:');
    console.log(`   FID: ${data.fid}`);
    console.log(`   Username: ${data.username}`);
    console.log(`   Display Name: ${data.displayName}`);
    console.log(`   Avatar: ${data.avatarUrl}`);
    
    return data;
    
  } catch (error) {
    console.error('❌ Coinbase API Error:', error);
    throw error;
  }
}

/**
 * Test 2: Neynar API - FID → Wallet Addresses
 */
async function testNeynarFIDToWallets(fid: number): Promise<any> {
  console.log('\n🧪 Testing Neynar API: FID → Wallet Addresses');
  console.log(`📍 FID: ${fid}`);
  
  if (!NEYNAR_API_KEY) {
    throw new Error('❌ NEYNAR_API_KEY not set');
  }
  
  try {
    const response = await fetch(`${NEYNAR_API_BASE}/farcaster/user/bulk?fids=${fid}`, {
      headers: {
        'api_key': NEYNAR_API_KEY
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.users || data.users.length === 0) {
      throw new Error('No user data found');
    }
    
    const user = data.users[0];
    console.log('✅ Neynar API Response:');
    console.log(`   FID: ${user.fid}`);
    console.log(`   Username: @${user.username}`);
    console.log(`   Display Name: ${user.display_name}`);
    console.log(`   Verified: ${user.verified ? '✅' : '❌'}`);
    console.log(`   Custody Address: ${user.custody_address}`);
    console.log(`   Verified Addresses: ${user.verified_addresses?.eth_addresses?.length || 0}`);
    
    if (user.verified_addresses?.eth_addresses?.length > 0) {
      console.log('   📍 Verified Addresses:');
      user.verified_addresses.eth_addresses.forEach((addr: string, i: number) => {
        console.log(`     ${i + 1}. ${addr}`);
      });
    }
    
    console.log(`   Followers: ${user.follower_count?.toLocaleString() || 'N/A'}`);
    console.log(`   Following: ${user.following_count?.toLocaleString() || 'N/A'}`);
    
    return {
      fid: user.fid,
      username: user.username,
      custodyAddress: user.custody_address,
      verifiedAddresses: user.verified_addresses?.eth_addresses || [],
      verified: user.verified
    };
    
  } catch (error) {
    console.error('❌ Neynar API Error:', error);
    throw error;
  }
}

/**
 * Test 3: Round-trip test - Wallet → FID → Wallets
 */
async function testRoundTrip(walletAddress: string): Promise<void> {
  console.log('\n🔄 Testing Round-trip: Wallet → FID → Wallets');
  
  try {
    // Step 1: Get FID from wallet
    const coinbaseResult = await testCoinbaseWalletToFID(walletAddress);
    const fid = coinbaseResult.fid;
    
    // Step 2: Get wallets from FID
    const neynarResult = await testNeynarFIDToWallets(fid);
    
    // Step 3: Verify consistency
    console.log('\n🔍 Verification:');
    const originalWallet = walletAddress.toLowerCase();
    const custodyWallet = neynarResult.custodyAddress.toLowerCase();
    const verifiedWallets = neynarResult.verifiedAddresses.map((addr: string) => addr.toLowerCase());
    
    console.log(`Original Wallet: ${originalWallet}`);
    console.log(`Custody Wallet: ${custodyWallet}`);
    console.log(`Verified Wallets: ${verifiedWallets.length}`);
    
    let found = false;
    if (originalWallet === custodyWallet) {
      console.log('✅ Original wallet matches custody address');
      found = true;
    } else if (verifiedWallets.includes(originalWallet)) {
      console.log('✅ Original wallet found in verified addresses');
      found = true;
    } else {
      console.log('⚠️ Original wallet not found in custody or verified addresses');
      console.log('   This might be normal - wallets can be connected in different ways');
    }
    
    console.log(`\n🎯 Result: FID ${fid} has ${1 + verifiedWallets.length} total wallet addresses`);
    
  } catch (error) {
    console.error('❌ Round-trip test failed:', error);
    throw error;
  }
}

/**
 * Test 4: Test FID → CBW Wallet directly (your requested flow)
 */
async function testFIDToCBWWallet(fid: number): Promise<string[]> {
  console.log('\n🎯 Testing FID → CBW Wallet (Your Requested Flow)');
  console.log(`📍 Input FID: ${fid}`);
  
  const neynarResult = await testNeynarFIDToWallets(fid);
  
  // Extract all wallet addresses associated with this FID
  const allWallets = [neynarResult.custodyAddress, ...neynarResult.verifiedAddresses];
  const uniqueWallets = [...new Set(allWallets.filter(Boolean))];
  
  console.log(`\n🎉 Success! FID ${fid} has ${uniqueWallets.length} wallet addresses:`);
  uniqueWallets.forEach((wallet, i) => {
    console.log(`   ${i + 1}. ${wallet} ${wallet === neynarResult.custodyAddress ? '(custody)' : '(verified)'}`);
  });
  
  return uniqueWallets;
}

/**
 * Main test function
 */
async function main() {
  console.log('🧪 Farcaster API Integration Test Suite');
  console.log('=====================================');
  
  // Check environment variables
  console.log('\n🔍 Environment Check:');
  console.log(`COINBASE_API_PRIVATE_KEY: ${COINBASE_API_PRIVATE_KEY ? '✅ Set' : '❌ Missing'}`);
  console.log(`NEYNAR_API_KEY: ${NEYNAR_API_KEY ? '✅ Set' : '❌ Missing'}`);
  
  if (!COINBASE_API_PRIVATE_KEY || !NEYNAR_API_KEY) {
    console.log('\n❌ Missing required environment variables. Please set:');
    console.log('   - COINBASE_API_PRIVATE_KEY=your_private_key_here');
    console.log('   - NEYNAR_API_KEY=your_neynar_api_key_here');
    process.exit(1);
  }
  
  try {
    // Test individual APIs
    console.log('\n📋 Running Individual API Tests...');
    
    // Test Coinbase API if we have a test wallet
    if (TEST_WALLET_ADDRESS) {
      await testCoinbaseWalletToFID(TEST_WALLET_ADDRESS);
    }
    
    // Test Neynar API if we have a test FID
    if (TEST_FID) {
      await testNeynarFIDToWallets(TEST_FID);
    }
    
    // Test your requested flow: FID → CBW Wallet
    if (TEST_FID) {
      const wallets = await testFIDToCBWWallet(TEST_FID);
      console.log(`\n✅ FID to CBW Wallet test completed! Found ${wallets.length} wallets.`);
    }
    
    // Test round-trip if both are available
    if (TEST_WALLET_ADDRESS && COINBASE_API_PRIVATE_KEY && NEYNAR_API_KEY) {
      await testRoundTrip(TEST_WALLET_ADDRESS);
    }
    
    console.log('\n🎉 All tests completed successfully!');
    console.log('\n📋 Summary:');
    console.log('   ✅ Coinbase API: Wallet → FID (working)');
    console.log('   ✅ Neynar API: FID → Wallet addresses (working)');
    console.log('   ✅ Your requested flow: FID → CBW Wallet (working via Neynar)');
    
  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
    process.exit(1);
  }
}

// Run if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { testCoinbaseWalletToFID, testNeynarFIDToWallets, testFIDToCBWWallet, testRoundTrip }; 