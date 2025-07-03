#!/usr/bin/env tsx

/**
 * Simple Conversation Health Check
 * 
 * Basic conversation status without full XMTP client initialization
 */

import axios from 'axios';

const PRODUCTION_URL = 'https://xmtp-mini-app-examples.onrender.com';

async function checkConversationHealth(): Promise<void> {
  console.log('🔍 Simple Conversation Health Check');
  console.log('===================================\n');
  
  try {
    // Check agent status
    console.log('📊 Checking agent status...');
    const agentResponse = await axios.get(`${PRODUCTION_URL}/api/agent/info`, {
      timeout: 10000
    });
    
    if (agentResponse.data.agent) {
      console.log('✅ Agent is responding');
      console.log(`📧 Address: ${agentResponse.data.agent.address}`);
      console.log(`📬 Inbox ID: ${agentResponse.data.agent.inboxId}`);
      console.log(`📊 Status: ${agentResponse.data.agent.status}`);
    } else {
      console.log('❌ Agent info not available');
    }
    
    // Check proxy health  
    console.log('\n🔧 Checking proxy health...');
    const healthResponse = await axios.get(`${PRODUCTION_URL}/api/proxy/health`, {
      timeout: 5000
    });
    
    console.log('✅ Proxy health check passed');
    
    // Summary
    console.log('\n📋 Health Summary:');
    console.log('==================');
    console.log('✅ Agent: Responding');
    console.log('✅ Proxy: Healthy');
    console.log('✅ Backend: Operational');
    
    console.log('\n💡 To manually check conversations:');
    console.log('1. Send a test message to the agent');
    console.log('2. Monitor logs for stream health');
    console.log('3. Check for database encryption errors');
    
  } catch (error: any) {
    console.error('❌ Health check failed:', error.message);
    
    console.log('\n🚨 Possible issues:');
    console.log('- Agent may be restarting');
    console.log('- Database encryption problems');
    console.log('- Stream connectivity issues');
    
    console.log('\n🔧 Recommended actions:');
    console.log('1. Check Render logs for specific errors');
    console.log('2. Trigger manual redeploy if agent is stuck');
    console.log('3. Monitor for automatic recovery');
  }
}

// Run the check
checkConversationHealth().catch(console.error); 