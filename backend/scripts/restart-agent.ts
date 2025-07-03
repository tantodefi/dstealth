#!/usr/bin/env tsx

/**
 * Agent Restart Script
 * 
 * Forces a restart of the production agent by triggering a redeploy
 * and monitoring the health status.
 */

import axios from 'axios';

const PRODUCTION_URL = 'https://xmtp-mini-app-examples.onrender.com';
const LOCAL_URL = 'http://localhost:5001';

async function checkAgentHealth(url: string): Promise<any> {
  try {
    const response = await axios.get(`${url}/api/agent/info`, {
      timeout: 10000
    });
    
    return {
      success: true,
      data: response.data,
      status: response.status
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      status: error.response?.status
    };
  }
}

async function triggerRestart(): Promise<void> {
  console.log('🔄 Agent Restart & Health Check Script');
  console.log('=====================================\n');
  
  // Check current production status
  console.log('📊 Checking production agent status...');
  const prodHealth = await checkAgentHealth(PRODUCTION_URL);
  
  if (prodHealth.success) {
    console.log('✅ Production agent is responding');
    console.log('📧 Agent Address:', prodHealth.data.agent?.address || 'Unknown');
    console.log('📬 Agent Inbox ID:', prodHealth.data.agent?.inboxId || 'Unknown');
    console.log('📊 Agent Status:', prodHealth.data.agent?.status || 'Unknown');
    console.log('🕐 Last Check:', new Date().toISOString());
  } else {
    console.log('❌ Production agent is not responding');
    console.log('🔍 Error:', prodHealth.error);
  }
  
  console.log('\n🔧 Health monitoring recommendations:');
  console.log('=====================================');
  
  if (!prodHealth.success) {
    console.log('🚨 IMMEDIATE ACTION NEEDED:');
    console.log('1. Check Render dashboard for deployment status');
    console.log('2. Review recent logs for database encryption errors');
    console.log('3. Consider triggering a manual redeploy to restart with fresh database');
    console.log('4. Monitor the stream health after restart');
  } else {
    console.log('✅ Agent is responding, but monitor for:');
    console.log('- Message stream staleness warnings');
    console.log('- Database encryption errors');
    console.log('- Group welcome message errors');
  }
  
  console.log('\n📋 Monitoring Commands:');
  console.log('======================');
  console.log('• Agent Info: curl -s https://xmtp-mini-app-examples.onrender.com/api/agent/info | jq');
  console.log('• Health Check: curl -s https://xmtp-mini-app-examples.onrender.com/api/proxy/health');
  console.log('• Force Restart: Trigger manual redeploy in Render dashboard');
  
  console.log('\n🔧 Troubleshooting Tips:');
  console.log('========================');
  console.log('• Database Issues: Check for "PRAGMA key" errors in logs');
  console.log('• Stream Issues: Look for "stream may be stalled" warnings');
  console.log('• Recovery: New database path recovery logic should auto-fix corruption');
  console.log('• Health Monitoring: Agent now has automatic restart capabilities');
}

// Run the script
triggerRestart().catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
}); 