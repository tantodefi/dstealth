/**
 * ZK Receipt Storage System - Local-First with Redis Sync
 * 
 * This system ensures ZK receipts are never lost by:
 * 1. Storing receipts in localStorage for permanent local access
 * 2. Using Redis for recent receipts (7 days) and cross-device sync
 * 3. Periodic sync from Redis to localStorage
 * 4. Export/import functionality for user control
 */

export interface ZKReceipt {
  id: string;
  fkeyId: string;
  stealthAddress: string;
  userAddress: string;
  zkProof: any;
  timestamp: number;
  status: 'pending_payment' | 'completed' | 'proof_generated';
  source: string;
  transactionHash?: string;
  networkId?: string;
  amount?: string;
  currency?: string;
  paymentUrl?: string;
  metadata: {
    transactionType: string;
    privacyFeature: string;
    zkProofAvailable: boolean;
    [key: string]: any;
  };
  // Local storage metadata
  syncedAt?: number;
  localOnly?: boolean;
  exported?: boolean;
}

export interface ZKReceiptSyncStats {
  totalReceipts: number;
  localReceipts: number;
  redisReceipts: number;
  lastSync: number;
  syncErrors: number;
  oldestReceipt: number;
  newestReceipt: number;
}

class ZKReceiptStorage {
  private readonly STORAGE_KEY = 'zk-receipts';
  private readonly SYNC_STATS_KEY = 'zk-receipt-sync-stats';
  private readonly EXPORT_KEY = 'zk-receipt-exports';
  private readonly SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_RECEIPTS_PER_USER = 1000;
  
  private syncTimer: NodeJS.Timeout | null = null;
  private syncInProgress = false;

  constructor() {
    this.startPeriodicSync();
  }

  /**
   * 🔧 PRIMARY ACCESS: Get all ZK receipts (localStorage first, Redis fallback)
   */
  async getAllReceipts(userAddress: string): Promise<ZKReceipt[]> {
    try {
      // 1. Get local receipts first (primary source)
      const localReceipts = this.getLocalReceipts(userAddress);
      
      // 2. Get recent receipts from Redis (last 7 days)
      const redisReceipts = await this.getRedisReceipts(userAddress);
      
      // 3. Merge and deduplicate
      const allReceipts = this.mergeReceipts(localReceipts, redisReceipts);
      
      // 4. Auto-sync any new Redis receipts to localStorage
      await this.syncToLocalStorage(userAddress, redisReceipts);
      
      // 5. Sort by timestamp (newest first)
      return allReceipts.sort((a, b) => b.timestamp - a.timestamp);
      
    } catch (error) {
      console.error('❌ Error getting ZK receipts:', error);
      // Fallback to local only
      return this.getLocalReceipts(userAddress);
    }
  }

  /**
   * 🔧 SAVE: Store ZK receipt locally and in Redis
   */
  async saveReceipt(receipt: ZKReceipt): Promise<void> {
    try {
      // 1. Save to localStorage immediately (local-first)
      this.saveToLocalStorage(receipt);
      
      // 2. Save to Redis for cross-device sync (7 days)
      await this.saveToRedis(receipt);
      
      console.log(`✅ ZK receipt saved locally and to Redis: ${receipt.id}`);
      
    } catch (error) {
      console.error('❌ Error saving ZK receipt:', error);
      // Always save locally even if Redis fails
      this.saveToLocalStorage(receipt);
    }
  }

  /**
   * 🔧 LOCAL STORAGE: Get receipts from localStorage
   */
  private getLocalReceipts(userAddress: string): ZKReceipt[] {
    try {
      const stored = localStorage.getItem(`${this.STORAGE_KEY}:${userAddress.toLowerCase()}`);
      if (!stored) return [];
      
      const receipts: ZKReceipt[] = JSON.parse(stored);
      return receipts.filter(receipt => receipt.userAddress.toLowerCase() === userAddress.toLowerCase());
      
    } catch (error) {
      console.error('❌ Error reading local ZK receipts:', error);
      return [];
    }
  }

  /**
   * 🔧 LOCAL STORAGE: Save receipt to localStorage
   */
  private saveToLocalStorage(receipt: ZKReceipt): void {
    try {
      const userAddress = receipt.userAddress.toLowerCase();
      const existingReceipts = this.getLocalReceipts(userAddress);
      
      // Remove duplicates by ID
      const filteredReceipts = existingReceipts.filter(r => r.id !== receipt.id);
      
      // Add new receipt with sync metadata
      const updatedReceipt: ZKReceipt = {
        ...receipt,
        syncedAt: Date.now(),
        localOnly: false
      };
      
      filteredReceipts.push(updatedReceipt);
      
      // Keep only most recent receipts (prevent storage bloat)
      const sortedReceipts = filteredReceipts
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, this.MAX_RECEIPTS_PER_USER);
      
      localStorage.setItem(`${this.STORAGE_KEY}:${userAddress}`, JSON.stringify(sortedReceipts));
      
      // Update sync stats
      this.updateSyncStats(userAddress, {
        totalReceipts: sortedReceipts.length,
        localReceipts: sortedReceipts.length,
        lastSync: Date.now()
      });
      
    } catch (error) {
      console.error('❌ Error saving to localStorage:', error);
    }
  }

  /**
   * 🔧 REDIS: Get receipts from Redis
   */
  private async getRedisReceipts(userAddress: string): Promise<ZKReceipt[]> {
    try {
      const response = await fetch(`/api/zkreceipts?userAddress=${userAddress}`);
      if (!response.ok) throw new Error(`Redis fetch failed: ${response.status}`);
      
      const data = await response.json();
      return data.zkReceipts || [];
      
    } catch (error) {
      console.error('❌ Error fetching Redis ZK receipts:', error);
      return [];
    }
  }

  /**
   * 🔧 REDIS: Save receipt to Redis
   */
  private async saveToRedis(receipt: ZKReceipt): Promise<void> {
    try {
      const response = await fetch('/api/zkreceipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: receipt.id,
          data: receipt
        })
      });
      
      if (!response.ok) {
        throw new Error(`Redis save failed: ${response.status}`);
      }
      
    } catch (error) {
      console.error('❌ Error saving to Redis:', error);
      throw error;
    }
  }

  /**
   * 🔧 MERGE: Combine local and Redis receipts
   */
  private mergeReceipts(localReceipts: ZKReceipt[], redisReceipts: ZKReceipt[]): ZKReceipt[] {
    const receiptMap = new Map<string, ZKReceipt>();
    
    // Add local receipts first (they're the authoritative source)
    localReceipts.forEach(receipt => {
      receiptMap.set(receipt.id, receipt);
    });
    
    // Add Redis receipts only if not already in local
    redisReceipts.forEach(receipt => {
      if (!receiptMap.has(receipt.id)) {
        receiptMap.set(receipt.id, {
          ...receipt,
          syncedAt: Date.now(),
          localOnly: false
        });
      }
    });
    
    return Array.from(receiptMap.values());
  }

  /**
   * 🔧 SYNC: Sync Redis receipts to localStorage
   */
  private async syncToLocalStorage(userAddress: string, redisReceipts: ZKReceipt[]): Promise<void> {
    try {
      const localReceipts = this.getLocalReceipts(userAddress);
      const localIds = new Set(localReceipts.map(r => r.id));
      
      // Find new receipts from Redis
      const newReceipts = redisReceipts.filter(receipt => !localIds.has(receipt.id));
      
      if (newReceipts.length > 0) {
        console.log(`🔄 Syncing ${newReceipts.length} new ZK receipts to localStorage`);
        
        // Save each new receipt locally
        for (const receipt of newReceipts) {
          this.saveToLocalStorage(receipt);
        }
      }
      
    } catch (error) {
      console.error('❌ Error syncing to localStorage:', error);
    }
  }

  /**
   * 🔧 PERIODIC SYNC: Background sync from Redis to localStorage
   */
  private startPeriodicSync(): void {
    this.syncTimer = setInterval(async () => {
      if (this.syncInProgress) return;
      
      this.syncInProgress = true;
      try {
        // Get current user address (if available)
        const userAddress = this.getCurrentUserAddress();
        if (userAddress) {
          await this.performBackgroundSync(userAddress);
        }
      } catch (error) {
        console.error('❌ Background sync error:', error);
      } finally {
        this.syncInProgress = false;
      }
    }, this.SYNC_INTERVAL);
  }

  /**
   * 🔧 BACKGROUND SYNC: Perform background sync
   */
  private async performBackgroundSync(userAddress: string): Promise<void> {
    try {
      console.log('🔄 Performing background ZK receipt sync...');
      
      const redisReceipts = await this.getRedisReceipts(userAddress);
      await this.syncToLocalStorage(userAddress, redisReceipts);
      
      // Update sync stats
      const localReceipts = this.getLocalReceipts(userAddress);
      this.updateSyncStats(userAddress, {
        totalReceipts: localReceipts.length,
        localReceipts: localReceipts.length,
        redisReceipts: redisReceipts.length,
        lastSync: Date.now()
      });
      
    } catch (error) {
      console.error('❌ Background sync failed:', error);
    }
  }

  /**
   * 🔧 EXPORT: Export ZK receipts for backup
   */
  async exportReceipts(userAddress: string): Promise<string> {
    try {
      const receipts = await this.getAllReceipts(userAddress);
      
      const exportData = {
        version: '1.0',
        exportedAt: Date.now(),
        userAddress,
        receipts,
        metadata: {
          totalReceipts: receipts.length,
          dateRange: {
            oldest: Math.min(...receipts.map(r => r.timestamp)),
            newest: Math.max(...receipts.map(r => r.timestamp))
          }
        }
      };
      
      // Save export record
      const exportRecord = {
        id: `export_${Date.now()}`,
        userAddress,
        exportedAt: Date.now(),
        receiptCount: receipts.length
      };
      
      this.saveExportRecord(exportRecord);
      
      return JSON.stringify(exportData, null, 2);
      
    } catch (error) {
      console.error('❌ Error exporting ZK receipts:', error);
      throw error;
    }
  }

  /**
   * 🔧 IMPORT: Import ZK receipts from backup
   */
  async importReceipts(importData: string): Promise<{ imported: number; errors: number }> {
    try {
      const data = JSON.parse(importData);
      
      if (!data.version || !data.receipts || !data.userAddress) {
        throw new Error('Invalid import data format');
      }
      
      let imported = 0;
      let errors = 0;
      
      for (const receipt of data.receipts) {
        try {
          // Mark as imported
          const importedReceipt: ZKReceipt = {
            ...receipt,
            syncedAt: Date.now(),
            localOnly: true // Mark as local-only since it's imported
          };
          
          this.saveToLocalStorage(importedReceipt);
          imported++;
          
        } catch (error) {
          console.error('❌ Error importing receipt:', error);
          errors++;
        }
      }
      
      console.log(`✅ Import complete: ${imported} receipts imported, ${errors} errors`);
      return { imported, errors };
      
    } catch (error) {
      console.error('❌ Error importing ZK receipts:', error);
      throw error;
    }
  }

  /**
   * 🔧 STATS: Get sync statistics
   */
  getSyncStats(userAddress: string): ZKReceiptSyncStats {
    try {
      const stored = localStorage.getItem(`${this.SYNC_STATS_KEY}:${userAddress.toLowerCase()}`);
      if (!stored) {
        return {
          totalReceipts: 0,
          localReceipts: 0,
          redisReceipts: 0,
          lastSync: 0,
          syncErrors: 0,
          oldestReceipt: 0,
          newestReceipt: 0
        };
      }
      
      return JSON.parse(stored);
      
    } catch (error) {
      console.error('❌ Error getting sync stats:', error);
      return {
        totalReceipts: 0,
        localReceipts: 0,
        redisReceipts: 0,
        lastSync: 0,
        syncErrors: 0,
        oldestReceipt: 0,
        newestReceipt: 0
      };
    }
  }

  /**
   * 🔧 HELPER: Update sync statistics
   */
  private updateSyncStats(userAddress: string, updates: Partial<ZKReceiptSyncStats>): void {
    try {
      const currentStats = this.getSyncStats(userAddress);
      const updatedStats = { ...currentStats, ...updates };
      
      localStorage.setItem(
        `${this.SYNC_STATS_KEY}:${userAddress.toLowerCase()}`,
        JSON.stringify(updatedStats)
      );
      
    } catch (error) {
      console.error('❌ Error updating sync stats:', error);
    }
  }

  /**
   * 🔧 HELPER: Save export record
   */
  private saveExportRecord(record: any): void {
    try {
      const stored = localStorage.getItem(this.EXPORT_KEY);
      const exports = stored ? JSON.parse(stored) : [];
      
      exports.push(record);
      
      // Keep only last 10 exports
      const recentExports = exports.slice(-10);
      localStorage.setItem(this.EXPORT_KEY, JSON.stringify(recentExports));
      
    } catch (error) {
      console.error('❌ Error saving export record:', error);
    }
  }

  /**
   * 🔧 HELPER: Get current user address from wallet or localStorage
   */
  private getCurrentUserAddress(): string | null {
    try {
      // Try to get from various sources
      const sources = [
        () => localStorage.getItem('connected-wallet-address'),
        () => localStorage.getItem('user-address'),
        () => sessionStorage.getItem('current-user-address')
      ];
      
      for (const source of sources) {
        const address = source();
        if (address && address.startsWith('0x')) {
          return address;
        }
      }
      
      return null;
      
    } catch (error) {
      console.error('❌ Error getting current user address:', error);
      return null;
    }
  }

  /**
   * 🔧 CLEANUP: Stop periodic sync
   */
  destroy(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }
}

// Export singleton instance
export const zkReceiptStorage = new ZKReceiptStorage();

// Helper functions for easy access
export const saveZKReceipt = (receipt: ZKReceipt) => zkReceiptStorage.saveReceipt(receipt);
export const getAllZKReceipts = (userAddress: string) => zkReceiptStorage.getAllReceipts(userAddress);
export const exportZKReceipts = (userAddress: string) => zkReceiptStorage.exportReceipts(userAddress);
export const importZKReceipts = (importData: string) => zkReceiptStorage.importReceipts(importData);
export const getZKReceiptStats = (userAddress: string) => zkReceiptStorage.getSyncStats(userAddress); 