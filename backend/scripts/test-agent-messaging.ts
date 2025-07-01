#!/usr/bin/env tsx

import 'dotenv/config';
import { createSigner, getEncryptionKeyFromHex, validateEnvironment } from '../src/helper.js';
import { Client, type XmtpEnv, IdentifierKind } from '@xmtp/node-sdk';

// Test user credentials (you can change these)
const TEST_PRIVATE_KEY = '0x' + '1'.repeat(64); // Test private key
const TEST_ENCRYPTION_KEY = '1'.repeat(64); // Test encryption key

async function main() {
  console.log('🧪 Testing Agent Messaging...\n');
  
  try {
    // Get environment variables
    const { XMTP_ENV } = validateEnvironment(['XMTP_ENV']);
    
    // Agent address from your logs (updated to match running agent)
    const AGENT_ADDRESS = '0xa0fe9a00280c2b74af3187817b34dc5b0c582078';
    
    console.log('🤖 Agent Address:', AGENT_ADDRESS);
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
    
    // Sync conversations
    console.log('🔄 Syncing conversations...');
    await testClient.conversations.sync();
    
    // Create or get conversation with agent
    console.log('💬 Creating conversation with agent...');
    const conversation = await testClient.conversations.newDmWithIdentifier({
      identifier: AGENT_ADDRESS,
      identifierKind: IdentifierKind.Ethereum,
    });
    
    console.log('✅ Conversation created:', conversation.id);
    
    // Send test message
    const testMessage = 'Hello dStealth agent! This is a test message. Can you help me with stealth payments?';
    console.log('📤 Sending test message:', testMessage);
    
    await conversation.send(testMessage);
    console.log('✅ Message sent successfully!');
    
    // Wait for response
    console.log('⏳ Waiting for agent response (30 seconds max)...');
    
    let responseReceived = false;
    const startTime = Date.now();
    const maxWaitTime = 30000; // 30 seconds
    
    // Start listening for responses
    const stream = await conversation.stream();
    
    const timeout = setTimeout(() => {
      if (!responseReceived) {
        console.log('⏰ Timeout reached - no response received');
        process.exit(0);
      }
    }, maxWaitTime);
    
    for await (const message of stream) {
      if (message && message.senderInboxId !== testClient.inboxId) {
        console.log('\n🎉 **AGENT RESPONDED!**');
        console.log('📨 Response:', message.content);
        console.log('⏱️  Response time:', Date.now() - startTime, 'ms');
        
        responseReceived = true;
        clearTimeout(timeout);
        break;
      }
    }
    
    console.log('\n✅ Agent messaging test completed successfully!');
    
  } catch (error) {
    console.error('❌ Error testing agent messaging:', error);
    
    // If it's a "user not registered" error, provide instructions
    if (error instanceof Error && error.message.includes('not registered')) {
      console.log('\n💡 **SOLUTION**: The test user needs to be registered with XMTP first.');
      console.log('   Try using a real wallet address that has used XMTP before.');
      console.log('   Or create a conversation from a real XMTP app like Converse.');
    }
    
    process.exit(1);
  }
}

main().catch(console.error); 