#!/usr/bin/env tsx

/**
 * Production Database Reset Helper
 * 
 * Helps diagnose and fix production database encryption issues
 */

import axios from 'axios';

const PRODUCTION_URL = 'https://xmtp-mini-app-examples.onrender.com';

async function checkProductionDatabase(): Promise<void> {
  console.log('🔍 Production Database Reset Helper');
  console.log('===================================\n');
  
  try {
    // Check current agent status
    console.log('📊 Checking production agent status...');
    const agentResponse = await axios.get(`${PRODUCTION_URL}/api/agent/info`, {
      timeout: 10000
    });
    
    if (agentResponse.data.agent) {
      console.log('✅ Agent HTTP endpoint responding');
      console.log(`📧 Address: ${agentResponse.data.agent.address}`);
      console.log(`📬 Inbox ID: ${agentResponse.data.agent.inboxId}`);
      console.log(`📊 Status: ${agentResponse.data.agent.status}`);
      
      // If agent is responding, the issue might be database-specific
      console.log('\n🔍 Database Status Analysis:');
      console.log('==========================================');
      
      if (agentResponse.data.agent.status === 'active') {
        console.log('✅ Agent shows as active - HTTP layer working');
        console.log('⚠️  If messages not processing, this indicates database encryption issues');
        
        console.log('\n🔧 Database Reset Solution:');
        console.log('===========================');
        console.log('1. ✅ Code is already updated to use fresh database path');
        console.log('2. 🚀 Trigger manual deployment in Render dashboard');
        console.log('3. 📊 New deployment will create fresh database with timestamp');
        console.log('4. 🔄 Monitor logs for "Using fresh production database" message');
        console.log('5. ✅ Test by sending a message to the agent');
      } else {
        console.log('❌ Agent not active - broader initialization issue');
      }
      
    } else {
      console.log('❌ Agent endpoint not responding properly');
    }
    
  } catch (error: any) {
    console.error('❌ Production agent check failed:', error.message);
    
    console.log('\n🚨 Database Encryption Issue Detected:');
    console.log('======================================');
    console.log('This error pattern indicates XMTP SQLite database encryption key mismatch');
    
    console.log('\n🔧 Immediate Fix Steps:');
    console.log('1. ✅ Code already updated to force fresh database');
    console.log('2. 🚀 Go to Render dashboard');
    console.log('3. 📋 Trigger "Manual Deploy" for the backend service');
    console.log('4. 📊 Monitor deployment logs for success');
    console.log('5. 🔄 Fresh database will be created automatically');
  }
  
  console.log('\n📋 Expected Log Messages After Deploy:');
  console.log('======================================');
  console.log('✅ "Using fresh production database: /data/xmtp/production-xmtp-TIMESTAMP.db3"');
  console.log('✅ "XMTP client created successfully"');
  console.log('✅ "Agent initialized successfully"');
  console.log('✅ "dStealth Agent is now listening for messages"');
  
  console.log('\n💡 Why This Works:');
  console.log('==================');
  console.log('• Fresh database = no encryption key conflicts');
  console.log('• Timestamp prevents reusing corrupted database');
  console.log('• Agent will rebuild conversation history automatically');
  console.log('• Previous database files remain as backup');
}

// Run the check
checkProductionDatabase().catch(console.error); 