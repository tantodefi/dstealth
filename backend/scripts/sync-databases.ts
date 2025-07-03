import { createSigner, getEncryptionKeyFromHex } from '../src/helper';
import { Client } from '@xmtp/node-sdk';
import { agentDb } from '../src/lib/agent-database';
import * as fs from 'fs';
import * as path from 'path';

interface SyncOptions {
  direction: 'pull' | 'push' | 'compare';
  environment: 'production' | 'local';
  backup: boolean;
}

class DatabaseSyncManager {
  // 📊 Get agent database stats
  async getAgentStats() {
    console.log('📊 Getting agent database stats...');
    
    try {
      const stats = await agentDb.getStats();
      console.log('📈 Agent Database Stats:', stats);
      return stats;
    } catch (error) {
      console.error('❌ Failed to get agent stats:', error);
      throw error;
    }
  }

  // 🔄 Test Redis connection
  async testConnection() {
    console.log('🔌 Testing Redis connection...');
    
    try {
      const isConnected = await agentDb.testConnection();
      if (isConnected) {
        console.log('✅ Redis connection successful');
      } else {
        console.log('❌ Redis connection failed');
      }
      return isConnected;
    } catch (error) {
      console.error('❌ Connection test failed:', error);
      return false;
    }
  }

  // 🔍 Compare database environments
  async compareEnvironments() {
    console.log('🔍 Comparing database environments...');
    
    try {
      // Get production stats
      console.log('📊 Checking production environment...');
      const prodEnv = process.env.XMTP_ENV;
      process.env.XMTP_ENV = 'production';
      
      const prodStats = await this.getAgentStats();
      
      // Get local stats  
      console.log('📊 Checking local environment...');
      process.env.XMTP_ENV = 'dev';
      
      const localStats = await this.getAgentStats();
      
      // Restore original environment
      process.env.XMTP_ENV = prodEnv;

      // Compare results
      const comparison = {
        production: prodStats,
        local: localStats,
        differences: {
          stealthDataDiff: Math.abs((prodStats.stealthData || 0) - (localStats.stealthData || 0)),
          fkeyDataDiff: Math.abs((prodStats.fkeyData || 0) - (localStats.fkeyData || 0)),
          interactionsDiff: Math.abs((prodStats.interactions || 0) - (localStats.interactions || 0))
        }
      };

      console.log('📊 Environment Comparison:');
      console.log('🔴 Production:', comparison.production);
      console.log('🔵 Local:', comparison.local);
      console.log('📈 Differences:', comparison.differences);

      return comparison;
      
    } catch (error) {
      console.error('❌ Failed to compare environments:', error);
      throw error;
    }
  }

  // 🧹 Clear agent data (with confirmation)
  async clearAgentData(confirm: boolean = false) {
    if (!confirm) {
      console.log('⚠️ This will clear ALL agent data. Run with --confirm to proceed.');
      return;
    }

    console.log('🧹 Clearing agent database...');
    
    try {
      await agentDb.clearAgentData();
      console.log('✅ Agent data cleared');
    } catch (error) {
      console.error('❌ Failed to clear agent data:', error);
      throw error;
    }
  }

  // 🔄 Perform sync operation
  async performSync(options: SyncOptions) {
    console.log(`🚀 Starting database sync (${options.direction})...`);
    
    try {
      // Test connection first
      const isConnected = await this.testConnection();
      if (!isConnected) {
        throw new Error('Redis connection failed - cannot perform sync');
      }

      switch (options.direction) {
        case 'compare':
          await this.compareEnvironments();
          break;
          
        default:
          console.log('ℹ️ Only comparison mode is available with current agent database setup');
          console.log('ℹ️ For full sync, export/import individual user data manually');
          await this.compareEnvironments();
          break;
      }
      
      console.log('✅ Sync operation complete');
      
    } catch (error) {
      console.error('❌ Sync operation failed:', error);
      throw error;
    }
  }
}

// 🚀 Main execution
async function main() {
  const args = process.argv.slice(2);
  const direction = (args[0] as 'pull' | 'push' | 'compare') || 'compare';
  
  const options: SyncOptions = {
    direction,
    environment: process.env.XMTP_ENV === 'production' ? 'production' : 'local',
    backup: !args.includes('--no-backup')
  };

  console.log('🔄 Database Sync Tool');
  console.log('📋 Options:', options);
  
  const syncManager = new DatabaseSyncManager();
  
  // Handle special commands
  if (args.includes('--clear')) {
    await syncManager.clearAgentData(args.includes('--confirm'));
    return;
  }

  if (args.includes('--stats')) {
    await syncManager.getAgentStats();
    return;
  }

  if (args.includes('--test')) {
    await syncManager.testConnection();
    return;
  }
  
  try {
    await syncManager.performSync(options);
    process.exit(0);
  } catch (error) {
    console.error('❌ Sync failed:', error);
    process.exit(1);
  }
}

// Run if called directly (ES module compatible)
const isMainModule = process.argv[1] && process.argv[1].endsWith('sync-databases.ts');
if (isMainModule) {
  main().catch(console.error);
}

export { DatabaseSyncManager }; 