#!/usr/bin/env tsx

import 'dotenv/config';
import { createSigner, getEncryptionKeyFromHex, validateEnvironment } from '../src/helper.js';
import { Client, type XmtpEnv, IdentifierKind } from '@xmtp/node-sdk';

// Test user credentials (you can change these)
const TEST_PRIVATE_KEY = '0x' + '1'.repeat(64); // Test private key
const TEST_ENCRYPTION_KEY = '1'.repeat(64); // Test encryption key

async function main() {
  console.log('🧪 Testing PRODUCTION Agent Messaging with FORCED SYNC...\n');
  
  try {
    // Get environment variables
    const { XMTP_ENV } = validateEnvironment(['XMTP_ENV']);
    
    // Production agent address from logs
    const AGENT_ADDRESS = '0xcbc46acb62a71fdaea2205cfe3ba16832699670b';
    
    console.log('🤖 Production Agent Address:', AGENT_ADDRESS);
    console.log('🌍 Environment:', XMTP_ENV);
    console.log('⏳ Creating test client...\n');
    
    // Create test client
    const testSigner = createSigner(TEST_PRIVATE_KEY);
    const testEncryptionKey = getEncryptionKeyFromHex(TEST_ENCRYPTION_KEY);
    
    const testClient = await Client.create(testSigner, {
      dbEncryptionKey: testEncryptionKey,
      env: XMTP_ENV as XmtpEnv,
    });
    
    console.log('✅ Test client created');
    console.log('📬 Test client inbox ID:', testClient.inboxId);
    
    // Get test client address
    const testIdentifier = testSigner.getIdentifier();
    const testAddress = typeof testIdentifier === 'object' && 'identifier' in testIdentifier 
      ? testIdentifier.identifier 
      : (await testIdentifier).identifier;
    console.log('🔑 Test client address:', testAddress);
    
    // FORCE multiple sync attempts
    console.log('🔄 FORCED SYNC - Multiple sync attempts...');
    for (let i = 0; i < 3; i++) {
      console.log(`   Sync attempt ${i + 1}/3...`);
      await testClient.conversations.sync();
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s between syncs
    }
    
    // Create conversation with agent
    console.log('💬 Creating conversation with PRODUCTION agent...');
    const conversation = await testClient.conversations.newDmWithIdentifier({
      identifier: AGENT_ADDRESS,
      identifierKind: IdentifierKind.Ethereum,
    });
    
    console.log('✅ Conversation created:', conversation.id);
    
    // SYNC the conversation immediately after creation
    console.log('🔄 Syncing newly created conversation...');
    await conversation.sync();
    
    // Send multiple test messages to increase chance of discovery
    const messages = [
      'PRODUCTION TEST 1: /help - agent discovery message',
      'PRODUCTION TEST 2: Hello production agent!',
      'PRODUCTION TEST 3: Please respond to confirm you are working'
    ];
    
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      console.log(`📤 Sending message ${i + 1}/${messages.length}:`, msg);
      await conversation.send(msg);
      
      // Wait between messages
      if (i < messages.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    console.log('✅ All messages sent to PRODUCTION agent!');
    
    // Wait longer for production and try additional syncs
    console.log('⏳ Waiting for PRODUCTION agent response (60 seconds max with periodic syncs)...');
    
    let responseReceived = false;
    const startTime = Date.now();
    const maxWaitTime = 60000; // 60 seconds for production
    
    // Start listening for responses
    const stream = await conversation.stream();
    
    // Periodic sync while waiting
    const syncInterval = setInterval(async () => {
      if (!responseReceived) {
        console.log('🔄 Periodic sync while waiting for response...');
        try {
          await testClient.conversations.sync();
          await conversation.sync();
        } catch (syncError) {
          console.warn('⚠️ Sync error:', syncError);
        }
      }
    }, 10000); // Sync every 10 seconds
    
    const timeout = setTimeout(() => {
      if (!responseReceived) {
        clearInterval(syncInterval);
        console.log('⏰ Timeout reached - PRODUCTION agent did not respond');
        console.log('🔍 This confirms the production agent is not processing messages correctly');
        console.log('📋 Possible issues:');
        console.log('   - Agent stream not detecting new conversations');
        console.log('   - XMTP network sync issues in production');
        console.log('   - Agent conversation discovery logic needs fixing');
        process.exit(1);
      }
    }, maxWaitTime);
    
    for await (const message of stream) {
      if (message && message.senderInboxId !== testClient.inboxId) {
        console.log('\n🎉 **PRODUCTION AGENT RESPONDED!**');
        console.log('📨 Response:', message.content);
        console.log('⏱️  Response time:', Date.now() - startTime, 'ms');
        console.log('✅ Production agent is working correctly!');
        
        responseReceived = true;
        clearInterval(syncInterval);
        clearTimeout(timeout);
        break;
      }
    }
    
    console.log('\n✅ Production agent messaging test completed successfully!');
    
  } catch (error) {
    console.error('❌ Error testing PRODUCTION agent messaging:', error);
    
    // If it's a "user not registered" error, provide instructions
    if (error instanceof Error && error.message.includes('not registered')) {
      console.log('\n💡 **SOLUTION**: The test user needs to be registered with XMTP first.');
      console.log('   Try using a real wallet address that has used XMTP before.');
      console.log('   Or create a conversation from a real XMTP app like Converse.');
    } else {
      console.log('\n🔍 **PRODUCTION AGENT ISSUE DETECTED**');
      console.log('   The production agent is not processing messages correctly.');
      console.log('   Check the Render logs for the backend service.');
      console.log('   The agent may need a conversation discovery fix.');
    }
    
    process.exit(1);
  }
}

main().catch(console.error); 