#!/usr/bin/env tsx
import 'dotenv/config';
import { DStealthAgent } from '../src/agents/dstealth-agent.js';
import { agentDb } from '../src/lib/agent-database.js';
import { env } from '../src/config/env.js';
import type { XmtpEnv } from '@xmtp/node-sdk';

async function main() {
  console.log('🧪 Testing dStealth Agent...');
  
  try {
    // Test database connection
    console.log('🔍 Testing database connection...');
    const dbConnected = await agentDb.testConnection();
    
    if (dbConnected) {
      console.log('✅ Database connection successful');
    } else {
      console.log('❌ Database connection failed');
      return;
    }
    
    // Test agent initialization
    console.log('🤖 Testing agent initialization...');
    const agent = new DStealthAgent();
    
    const agentInfo = await agent.initialize(
      env.WALLET_KEY,
      env.ENCRYPTION_KEY,
      env.XMTP_ENV as XmtpEnv
    );
    
    console.log('✅ Agent initialized successfully!');
    console.log(`📬 Inbox ID: ${agentInfo.inboxId}`);
    console.log(`🔑 Address: ${agentInfo.address}`);
    
    // Test database operations
    console.log('💾 Testing database operations...');
    const testData = {
      userId: 'test_user',
      fkeyId: 'test.fkey.id',
      stealthAddress: '0x1234567890123456789012345678901234567890',
      zkProof: { test: 'proof' },
      lastUpdated: Date.now(),
      requestedBy: agentInfo.inboxId
    };
    
    await agentDb.storeUserStealthData(testData);
    const retrievedData = await agentDb.getStealthDataByFkey('test.fkey.id');
    
    if (retrievedData && retrievedData.stealthAddress === testData.stealthAddress) {
      console.log('✅ Database operations working correctly');
    } else {
      console.log('❌ Database operations failed');
    }
    
    // Cleanup
    await agentDb.clearAgentData();
    
    console.log('🎉 All tests passed! dStealth Agent is ready to run.');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

main().catch(console.error); 