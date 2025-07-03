#!/usr/bin/env tsx

import { agentDb } from '../src/lib/agent-database';
import * as fs from 'fs';
import * as path from 'path';

class DatabaseSyncTool {
  // 📊 Get database stats for current environment
  async getStats() {
    console.log(`📊 Getting database stats for ${process.env.XMTP_ENV || 'unknown'} environment...`);
    
    try {
      const stats = await agentDb.getStats();
      console.log('Database Stats:', JSON.stringify(stats, null, 2));
      return stats;
    } catch (error) {
      console.error('❌ Failed to get stats:', error);
      throw error;
    }
  }

  // 🔌 Test Redis connection
  async testConnection() {
    console.log('🔌 Testing Redis connection...');
    
    try {
      const isConnected = await agentDb.testConnection();
      console.log(`Connection status: ${isConnected ? '✅ Connected' : '❌ Failed'}`);
      return isConnected;
    } catch (error) {
      console.error('❌ Connection test failed:', error);
      return false;
    }
  }

  // 📤 Export database stats to file
  async exportStats(outputFile?: string) {
    const stats = await this.getStats();
    
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = outputFile || `db-stats-${process.env.XMTP_ENV || 'unknown'}-${timestamp}.json`;
    
    if (!fs.existsSync('.data')) {
      fs.mkdirSync('.data', { recursive: true });
    }
    
    const filepath = path.join('.data', filename);
    fs.writeFileSync(filepath, JSON.stringify(stats, null, 2));
    
    console.log(`📁 Stats exported to: ${filepath}`);
    return filepath;
  }
}

// 🚀 Main execution
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'stats';
  
  console.log('🔄 Database Sync Tool');
  console.log(`🎯 Command: ${command}`);
  console.log(`🌍 Environment: ${process.env.XMTP_ENV || 'unknown'}`);
  console.log('');
  
  const syncTool = new DatabaseSyncTool();
  
  try {
    switch (command) {
      case 'stats':
        await syncTool.getStats();
        break;
        
      case 'test':
        await syncTool.testConnection();
        break;
        
      case 'export':
        await syncTool.exportStats(args[1]);
        break;
        
      default:
        console.log('📋 Available commands:');
        console.log('   stats     - Get database statistics');
        console.log('   test      - Test Redis connection');
        console.log('   export    - Export stats to JSON file');
        break;
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Command failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}
