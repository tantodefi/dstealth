#!/usr/bin/env tsx

/**
 * XMTP Conversation Sync Script
 * 
 * Syncs conversations from XMTP network to fresh production database
 * Addresses the issue where fresh database starts with 0 conversations
 */

import { createSigner, getEncryptionKeyFromHex } from '../src/helper';
import { Client, type XmtpEnv } from '@xmtp/node-sdk';
import * as fs from 'fs';

interface ConversationSyncReport {
  timestamp: string;
  environment: string;
  agentInboxId: string;
  agentAddress: string;
  conversationsFound: number;
  conversationIds: string[];
  syncDuration: number;
  errors: string[];
}

class XMTPConversationSync {
  private client: Client | null = null;
  private report: ConversationSyncReport;

  constructor() {
    this.report = {
      timestamp: new Date().toISOString(),
      environment: process.env.XMTP_ENV || 'unknown',
      agentInboxId: '',
      agentAddress: '',
      conversationsFound: 0,
      conversationIds: [],
      syncDuration: 0,
      errors: []
    };
  }

  // 🚀 Initialize XMTP client
  async initialize(): Promise<void> {
    console.log('🔧 Initializing XMTP client for conversation sync...\n');

    if (!process.env.WALLET_KEY || !process.env.ENCRYPTION_KEY) {
      throw new Error('Missing WALLET_KEY or ENCRYPTION_KEY environment variables');
    }

    const signer = createSigner(process.env.WALLET_KEY as `0x${string}`);
    const encryptionKey = getEncryptionKeyFromHex(process.env.ENCRYPTION_KEY);
    const environment = process.env.XMTP_ENV || 'dev';

    console.log(`🌍 Environment: ${environment}`);
    console.log(`🔐 Using encryption key: ${process.env.ENCRYPTION_KEY.substring(0, 8)}...`);

    try {
      this.client = await Client.create(signer, {
        dbEncryptionKey: encryptionKey,
        env: environment as XmtpEnv
      });

      const identifier = signer.getIdentifier();
      this.report.agentAddress = typeof identifier === 'object' && 'identifier' in identifier 
        ? identifier.identifier 
        : (await identifier).identifier;
      
      this.report.agentInboxId = this.client.inboxId;
      
      console.log(`✅ XMTP client initialized`);
      console.log(`📧 Agent Address: ${this.report.agentAddress}`);
      console.log(`📬 Agent Inbox ID: ${this.report.agentInboxId}`);
      console.log(`📁 Database Path: ${environment === 'production' ? '/data/xmtp/production-xmtp-*.db3' : 'local'}\n`);

    } catch (error) {
      const errorMsg = `Failed to initialize XMTP client: ${error instanceof Error ? error.message : String(error)}`;
      this.report.errors.push(errorMsg);
      throw new Error(errorMsg);
    }
  }

  // 🔄 Perform conversation sync
  async syncConversations(): Promise<ConversationSyncReport> {
    if (!this.client) {
      throw new Error('XMTP client not initialized');
    }

    console.log('🔄 Starting conversation sync from XMTP network...\n');
    const startTime = Date.now();

    try {
      // Force full sync from network
      console.log('📊 Pre-sync conversation count check...');
      let preConversations = await this.client.conversations.list();
      console.log(`📋 Conversations before sync: ${preConversations.length}`);

      console.log('🌊 Performing network sync (this may take a moment)...');
      await this.client.conversations.sync();

      console.log('📋 Retrieving conversation list after sync...');
      const conversations = await this.client.conversations.list();
      
      this.report.conversationsFound = conversations.length;
      this.report.conversationIds = conversations.map(c => c.id);
      this.report.syncDuration = Date.now() - startTime;

      console.log(`✅ Sync completed in ${this.report.syncDuration}ms`);
      console.log(`📊 Conversations found: ${this.report.conversationsFound}`);

      if (this.report.conversationsFound > 0) {
        console.log('\n📋 Conversation Details:');
        console.log('=====================');
        
        for (let i = 0; i < Math.min(conversations.length, 10); i++) {
          const conv = conversations[i];
          try {
            // Get basic conversation info
            console.log(`${i + 1}. ${conv.id.substring(0, 8)}... (${conv.constructor.name})`);
            
            // Try to get message count
            try {
              await conv.sync();
              const messages = await conv.messages();
              console.log(`   📨 Messages: ${messages.length}`);
              
              if (messages.length > 0) {
                const firstMessage = messages[0];
                const lastMessage = messages[messages.length - 1];
                console.log(`   📅 First: ${firstMessage.sentAt.toISOString().split('T')[0]}`);
                console.log(`   📅 Last: ${lastMessage.sentAt.toISOString().split('T')[0]}`);
              }
            } catch (msgError) {
              console.log(`   ⚠️ Could not load messages: ${msgError instanceof Error ? msgError.message : 'Unknown error'}`);
            }
          } catch (convError) {
            console.log(`   ❌ Error processing conversation: ${convError instanceof Error ? convError.message : 'Unknown error'}`);
            this.report.errors.push(`Conversation ${conv.id}: ${convError instanceof Error ? convError.message : 'Unknown error'}`);
          }
        }

        if (conversations.length > 10) {
          console.log(`   ... and ${conversations.length - 10} more conversations`);
        }
      } else {
        console.log('⚠️ No conversations found after sync');
        console.log('This could indicate:');
        console.log('- Fresh agent that hasn\'t received messages yet');
        console.log('- Different environment than expected');
        console.log('- Network connectivity issues');
      }

      return this.report;

    } catch (error) {
      const errorMsg = `Sync failed: ${error instanceof Error ? error.message : String(error)}`;
      this.report.errors.push(errorMsg);
      this.report.syncDuration = Date.now() - startTime;
      throw new Error(errorMsg);
    }
  }

  // 💾 Save sync report
  async saveReport(): Promise<string> {
    const outputDir = '.data/xmtp-sync';
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().split('T')[0];
    const reportPath = `${outputDir}/xmtp-sync-${this.report.environment}-${timestamp}-${Date.now()}.json`;
    
    fs.writeFileSync(reportPath, JSON.stringify(this.report, null, 2));
    
    console.log(`\n💾 Sync report saved: ${reportPath}`);
    return reportPath;
  }

  // 🔌 Cleanup
  async cleanup(): Promise<void> {
    if (this.client) {
      // XMTP client cleanup is automatic
      this.client = null;
    }
  }
}

// 🚀 Main execution
async function main() {
  console.log('🔄 XMTP Conversation Network Sync');
  console.log('=================================\n');

  const environment = process.env.XMTP_ENV || 'dev';
  console.log(`🌍 Environment: ${environment}`);

  if (!process.env.WALLET_KEY || !process.env.ENCRYPTION_KEY) {
    console.error('❌ Missing WALLET_KEY or ENCRYPTION_KEY environment variables');
    process.exit(1);
  }

  try {
    // Initialize XMTP client
    const signer = createSigner(process.env.WALLET_KEY as `0x${string}`);
    const encryptionKey = getEncryptionKeyFromHex(process.env.ENCRYPTION_KEY);

    console.log('🔧 Creating XMTP client...');
    const client = await Client.create(signer, {
      dbEncryptionKey: encryptionKey,
      env: environment as XmtpEnv
    });

    console.log(`✅ XMTP client created`);
    console.log(`📬 Agent Inbox ID: ${client.inboxId}`);

    // Pre-sync count
    console.log('\n📊 Checking conversations before sync...');
    const preSyncConversations = await client.conversations.list();
    console.log(`📋 Conversations before sync: ${preSyncConversations.length}`);

    // Perform sync
    console.log('\n🌊 Syncing conversations from XMTP network...');
    await client.conversations.sync();

    // Post-sync count
    console.log('📋 Checking conversations after sync...');
    const postSyncConversations = await client.conversations.list();
    console.log(`📊 Conversations after sync: ${postSyncConversations.length}`);

    if (postSyncConversations.length > 0) {
      console.log('\n📋 Found conversations:');
      for (let i = 0; i < Math.min(postSyncConversations.length, 5); i++) {
        const conv = postSyncConversations[i];
        console.log(`${i + 1}. ${conv.id.substring(0, 8)}... (${conv.constructor.name})`);
      }
      if (postSyncConversations.length > 5) {
        console.log(`... and ${postSyncConversations.length - 5} more`);
      }
    }

    console.log('\n✅ Sync completed successfully!');
    console.log(`📊 Total conversations: ${postSyncConversations.length}`);

  } catch (error) {
    console.error('❌ Sync failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run if called directly
const isMainModule = process.argv[1] && process.argv[1].endsWith('xmtp-conversation-sync.ts');
if (isMainModule) {
  main().catch(console.error);
}

export { XMTPConversationSync }; 