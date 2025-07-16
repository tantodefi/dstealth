/**
 * Migration Script: Migrate Stealth Data to Primary Addresses
 * 
 * This script migrates existing stealth data from any wrong addresses
 * to the correct primary addresses based on the source and metadata.
 * 
 * USAGE:
 * cd backend
 * npx tsx scripts/migrate-stealth-data-to-primary-addresses.ts
 */

import { agentDb } from '../src/lib/agent-database.js';
import { env } from '../src/config/env.js';

interface MigrationResult {
  total: number;
  successful: number;
  failed: number;
  skipped: number;
  errors: string[];
}

async function migrateStealthDataToPrimaryAddresses(dryRun: boolean = true): Promise<MigrationResult> {
  console.log('\n🔄 Starting stealth data migration to primary addresses...\n');
  
  const result: MigrationResult = {
    total: 0,
    successful: 0,
    failed: 0,
    skipped: 0,
    errors: []
  };

  try {
    // Get all stealth data
    const allStealthData = await agentDb.getAllStealthData();
    result.total = allStealthData.length;
    
    console.log(`📊 Found ${allStealthData.length} stealth data records to analyze`);
    
    if (allStealthData.length === 0) {
      console.log('✅ No stealth data found - migration not needed');
      return result;
    }

    for (const stealthData of allStealthData) {
      const { userId, fkeyId, metadata } = stealthData;
      
      console.log(`\n🔍 Processing: ${fkeyId} (current userId: ${userId})`);
      
      let correctPrimaryAddress: string | null = null;
      let migrationReason = '';
      
      // Determine correct primary address based on source and metadata
      if (metadata?.source === 'frontend-settings' || metadata?.source === 'miniapp-settings') {
        // For frontend/miniapp: use connected wallet address
        if (metadata?.connectedWallet) {
          correctPrimaryAddress = metadata.connectedWallet.toLowerCase();
          migrationReason = 'Connected wallet from metadata';
        } else {
          // If no connected wallet in metadata, assume current userId is correct
          correctPrimaryAddress = userId.toLowerCase();
          migrationReason = 'Assuming current userId is connected wallet';
        }
      } else if (metadata?.source === 'farcaster-cast') {
        // For Farcaster: use custody address or verified address
        if (metadata?.primaryAddressSource === 'farcaster_custody' || metadata?.primaryAddressSource === 'farcaster_verified') {
          // Already has correct primary address metadata
          correctPrimaryAddress = userId.toLowerCase();
          migrationReason = 'Already has correct Farcaster primary address';
        } else {
          // Legacy Farcaster data - need to determine primary address
          // This is complex since we'd need to re-fetch Farcaster data
          console.log(`  ⚠️ Legacy Farcaster data needs manual review`);
          result.skipped++;
          continue;
        }
      } else if (metadata?.source === 'xmtp-agent') {
        // For XMTP: need to resolve inbox ID to wallet address
        if (metadata?.xmtpInboxId) {
          console.log(`  📧 XMTP data needs inbox ID resolution: ${metadata.xmtpInboxId}`);
          // This would require XMTP client to resolve - skip for now
          result.skipped++;
          continue;
        } else {
          correctPrimaryAddress = userId.toLowerCase();
          migrationReason = 'Assuming current userId is correct for XMTP';
        }
      } else {
        // Unknown source - skip
        console.log(`  ❓ Unknown source: ${metadata?.source}`);
        result.skipped++;
        continue;
      }
      
      if (!correctPrimaryAddress) {
        console.log(`  ❌ Could not determine correct primary address`);
        result.failed++;
        result.errors.push(`${fkeyId}: Could not determine correct primary address`);
        continue;
      }
      
      // Check if migration is needed
      if (userId.toLowerCase() === correctPrimaryAddress) {
        console.log(`  ✅ CORRECT: Already using primary address (${migrationReason})`);
        result.skipped++;
        continue;
      }
      
      console.log(`  🔄 MIGRATE: ${userId} → ${correctPrimaryAddress} (${migrationReason})`);
      
      if (!dryRun) {
        try {
          // Update the stealth data with correct primary address
          const updatedStealthData = {
            ...stealthData,
            userId: correctPrimaryAddress,
            lastUpdated: Date.now(),
            metadata: {
              ...stealthData.metadata,
              migrationDate: Date.now(),
              originalUserId: userId, // Keep original for reference
              migrationReason: migrationReason,
              migratedToPrimaryAddress: true
            }
          };
          
          await agentDb.storeUserStealthData(updatedStealthData);
          
          console.log(`  ✅ Successfully migrated to primary address`);
          result.successful++;
          
        } catch (error) {
          console.log(`  ❌ Failed to migrate: ${error instanceof Error ? error.message : 'Unknown error'}`);
          result.failed++;
          result.errors.push(`${fkeyId}: Migration failed - ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      } else {
        console.log(`  🔍 DRY RUN: Would migrate to ${correctPrimaryAddress}`);
        result.successful++;
      }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`  Total records: ${result.total}`);
    console.log(`  Successful: ${result.successful}`);
    console.log(`  Failed: ${result.failed}`);
    console.log(`  Skipped: ${result.skipped}`);
    
    if (result.errors.length > 0) {
      console.log(`\n❌ Errors encountered:`);
      result.errors.forEach(error => console.log(`  - ${error}`));
    }
    
    if (dryRun) {
      console.log(`\n🔍 This was a DRY RUN - no actual changes made`);
      console.log(`To perform actual migration, run: npx tsx scripts/migrate-stealth-data-to-primary-addresses.ts --execute`);
    } else {
      console.log(`\n✅ Migration completed!`);
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    result.errors.push(`General failure: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');
  
  if (dryRun) {
    console.log('🔍 Running in DRY RUN mode - no changes will be made');
    console.log('Use --execute flag to perform actual migration');
  } else {
    console.log('⚠️  EXECUTING MIGRATION - changes will be made!');
  }
  
  const result = await migrateStealthDataToPrimaryAddresses(dryRun);
  
  if (result.failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

// Run the migration
main().catch(console.error); 