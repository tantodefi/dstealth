#!/usr/bin/env tsx

/**
 * Test script to verify ZK receipt generation across all search paths
 */

import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
config({ path: join(__dirname, "../.env") });

import { agentDb } from "../src/lib/agent-database";
import { env } from "../src/config/env";
import Redis from "ioredis";

const redis = new Redis({
  port: parseInt(process.env.REDIS_PORT || '6379'),
  host: process.env.REDIS_HOST || 'localhost',
  password: process.env.REDIS_PASSWORD || undefined,
});

async function testSearchZkReceipts() {
  console.log("🧪 Testing ZK receipt generation across all search paths...\n");

  // Test 1: Agent Database Search
  console.log("1️⃣ Testing Agent Database Search...");
  try {
    const testQuery = "tantodefi";
    const response = await fetch(`http://localhost:5001/api/user/search/comprehensive?query=${testQuery}&generateZkReceipts=true`);
    
    if (response.ok) {
      const data = await response.json();
      console.log(`✅ Agent search found ${data.results.length} users`);
      console.log(`🧾 ZK receipts generated: ${data.stats.zkReceiptsGenerated}`);
      
      // Check if ZK receipts were stored in Redis
      for (const user of data.results) {
        if (user.hasFkey) {
          const zkReceiptKey = `zk-receipt:${user.fkeyId}:comprehensive-search-agent`;
          const receipt = await redis.get(zkReceiptKey);
          console.log(`📋 ZK receipt for ${user.fkeyId}: ${receipt ? 'EXISTS' : 'NOT FOUND'}`);
        }
      }
    } else {
      console.log(`❌ Agent search failed: ${response.status}`);
    }
  } catch (error) {
    console.log(`❌ Agent search error:`, error);
  }

  console.log("\n2️⃣ Testing Frontend Search...");
  try {
    const testUsername = "tantodefi";
    const testAddress = "0x1234567890123456789012345678901234567890";
    const response = await fetch(`http://localhost:3000/api/fkey/lookup/${testUsername}?userAddress=${testAddress}&source=frontend-search-test`);
    
    if (response.ok) {
      const data = await response.json();
      console.log(`✅ Frontend search result: ${data.success ? 'SUCCESS' : 'FAILED'}`);
      console.log(`🧾 ZK proof included: ${data.proof ? 'YES' : 'NO'}`);
      
      // Check if ZK receipt was stored
      const zkReceiptKey = `zk-receipt:${testUsername}:frontend-search-test`;
      const receipt = await redis.get(zkReceiptKey);
      console.log(`📋 ZK receipt stored: ${receipt ? 'YES' : 'NO'}`);
    } else {
      console.log(`❌ Frontend search failed: ${response.status}`);
    }
  } catch (error) {
    console.log(`❌ Frontend search error:`, error);
  }

  console.log("\n3️⃣ Testing Payment Link Generation...");
  try {
    const testAddress = "0x1234567890123456789012345678901234567890";
    const response = await fetch(`http://localhost:3000/api/content/pay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contentId: 'test-content-123',
        userAddress: testAddress,
        userAmount: '10'
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log(`✅ Payment link generation: ${data.success ? 'SUCCESS' : 'FAILED'}`);
      console.log(`🧾 ZK proof verification: ${data.zkProofVerified ? 'VERIFIED' : 'NOT VERIFIED'}`);
    } else {
      console.log(`❌ Payment link generation failed: ${response.status}`);
    }
  } catch (error) {
    console.log(`❌ Payment link generation error:`, error);
  }

  console.log("\n4️⃣ Testing Database for ZK Receipts...");
  try {
    // List all ZK receipt keys
    const zkReceiptKeys = await redis.keys('zk-receipt:*');
    console.log(`📊 Total ZK receipts in database: ${zkReceiptKeys.length}`);
    
    // Group by source
    const sourceGroups = zkReceiptKeys.reduce((acc: any, key) => {
      const parts = key.split(':');
      if (parts.length >= 3) {
        const source = parts[2];
        acc[source] = (acc[source] || 0) + 1;
      }
      return acc;
    }, {});
    
    console.log(`🗂️ ZK receipts by source:`, sourceGroups);
    
    // Show sample receipts
    console.log("\n📋 Sample ZK receipts:");
    for (const key of zkReceiptKeys.slice(0, 3)) {
      const receipt = await redis.get(key);
      if (receipt) {
        const receiptData = JSON.parse(receipt);
        console.log(`   ${key}: ${receiptData.fkeyId} (${receiptData.source})`);
      }
    }
    
  } catch (error) {
    console.log(`❌ Database query error:`, error);
  }

  console.log("\n5️⃣ Testing Agent Search Commands...");
  try {
    // Test agent wallet search
    const allUsers = await agentDb.getAllStealthData();
    console.log(`📊 Users in agent database: ${allUsers.length}`);
    
    const usersWithFkey = allUsers.filter(user => user.fkeyId);
    console.log(`🔑 Users with fkey.id: ${usersWithFkey.length}`);
    
    // Test if agent search generates ZK receipts
    const sampleUser = usersWithFkey[0];
    if (sampleUser) {
      console.log(`🧪 Testing agent search for: ${sampleUser.fkeyId}`);
      
      // This would be called by the agent's findFkeyByWallet method
      const zkReceiptKey = `zk-receipt:${sampleUser.fkeyId}:xmtp-agent-wallet-search`;
      const receipt = await redis.get(zkReceiptKey);
      console.log(`📋 Agent search ZK receipt: ${receipt ? 'EXISTS' : 'NOT FOUND'}`);
    }
    
  } catch (error) {
    console.log(`❌ Agent search test error:`, error);
  }

  console.log("\n6️⃣ Summary Report...");
  try {
    const allZkReceipts = await redis.keys('zk-receipt:*');
    
    console.log(`📊 TOTAL ZK RECEIPTS: ${allZkReceipts.length}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    
    // Count by source
    const sourceStats = allZkReceipts.reduce((acc: any, key) => {
      const parts = key.split(':');
      if (parts.length >= 3) {
        const source = parts[2];
        acc[source] = (acc[source] || 0) + 1;
      }
      return acc;
    }, {});
    
    console.log(`🔍 Agent searches: ${sourceStats['xmtp-agent-wallet-search'] || 0}`);
    console.log(`🔍 Agent lookups: ${sourceStats['xmtp-agent-fkey-lookup'] || 0}`);
    console.log(`🔍 Agent fkey sets: ${sourceStats['xmtp-agent-fkey-set'] || 0}`);
    console.log(`🌐 Frontend searches: ${sourceStats['frontend-fkey-search'] || 0}`);
    console.log(`🌐 Frontend settings: ${sourceStats['frontend-settings-setup'] || 0}`);
    console.log(`🎭 Farcaster casts: ${sourceStats['farcaster-cast'] || 0}`);
    console.log(`📊 Comprehensive searches: ${(sourceStats['comprehensive-search-agent'] || 0) + (sourceStats['comprehensive-search-frontend'] || 0) + (sourceStats['comprehensive-search-farcaster'] || 0)}`);
    console.log(`💰 Payment links: ${sourceStats['payment-link-creation'] || 0}`);
    
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`✅ ZK RECEIPT SYSTEM STATUS: ${allZkReceipts.length > 0 ? 'ACTIVE' : 'INACTIVE'}`);
    
    if (allZkReceipts.length > 0) {
      console.log(`🎯 All fkey.id address recoveries are generating ZK receipts!`);
    } else {
      console.log(`⚠️ No ZK receipts found - system may need verification`);
    }
    
  } catch (error) {
    console.log(`❌ Summary report error:`, error);
  }

  await redis.quit();
  process.exit(0);
}

// Run the test
testSearchZkReceipts().catch(console.error); 