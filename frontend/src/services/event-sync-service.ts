/**
 * Event-driven synchronization service
 * Provides real-time updates between all data sources
 */

import { storageManager } from '../lib/localStorage-manager';

export interface SyncEvent {
  type: 'user_data_updated' | 'fkey_changed' | 'settings_updated' | 'backend_sync' | 'storage_cleared';
  payload: any;
  timestamp: number;
  source: 'frontend' | 'backend' | 'storage' | 'user';
  userId?: string;
}

export interface SyncEventListener {
  id: string;
  event: SyncEvent['type'];
  callback: (event: SyncEvent) => void | Promise<void>;
  priority?: number; // Higher number = higher priority
}

export class EventSyncService {
  private static instance: EventSyncService;
  private listeners: Map<string, SyncEventListener[]> = new Map();
  private eventQueue: SyncEvent[] = [];
  private isProcessing = false;
  private syncHistory: SyncEvent[] = [];
  private maxHistorySize = 100;

  private constructor() {
    this.initializeEventListeners();
  }

  public static getInstance(): EventSyncService {
    if (!EventSyncService.instance) {
      EventSyncService.instance = new EventSyncService();
    }
    return EventSyncService.instance;
  }

  /**
   * Initialize global event listeners
   */
  private initializeEventListeners(): void {
    // Listen for storage events (cross-tab synchronization)
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (event) => {
        if (event.key && event.key.startsWith('xmtp_dstealth_')) {
          this.emit({
            type: 'user_data_updated',
            payload: {
              key: event.key,
              oldValue: event.oldValue,
              newValue: event.newValue
            },
            timestamp: Date.now(),
            source: 'storage'
          });
        }
      });

      // Listen for beforeunload to sync pending data
      window.addEventListener('beforeunload', () => {
        this.flushPendingSync();
      });

      // Listen for online/offline events
      window.addEventListener('online', () => {
        this.emit({
          type: 'backend_sync',
          payload: { status: 'online' },
          timestamp: Date.now(),
          source: 'frontend'
        });
      });

      window.addEventListener('offline', () => {
        this.emit({
          type: 'backend_sync',
          payload: { status: 'offline' },
          timestamp: Date.now(),
          source: 'frontend'
        });
      });
    }
  }

  /**
   * Register an event listener
   */
  addListener(eventType: SyncEvent['type'], callback: (event: SyncEvent) => void | Promise<void>, priority = 0): string {
    const id = `${eventType}_${Date.now()}_${Math.random()}`;
    const listener: SyncEventListener = { id, event: eventType, callback, priority };

    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }

    const eventListeners = this.listeners.get(eventType)!;
    eventListeners.push(listener);
    
    // Sort by priority (higher priority first)
    eventListeners.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    console.log(`📡 Event listener registered: ${eventType} (ID: ${id}, Priority: ${priority})`);
    return id;
  }

  /**
   * Remove an event listener
   */
  removeListener(listenerId: string): boolean {
    for (const [eventType, listeners] of this.listeners.entries()) {
      const index = listeners.findIndex(l => l.id === listenerId);
      if (index !== -1) {
        listeners.splice(index, 1);
        console.log(`📡 Event listener removed: ${listenerId}`);
        return true;
      }
    }
    return false;
  }

  /**
   * Emit an event to all listeners
   */
  async emit(event: SyncEvent): Promise<void> {
    // Add to history
    this.syncHistory.push(event);
    if (this.syncHistory.length > this.maxHistorySize) {
      this.syncHistory.shift();
    }

    // Add to processing queue
    this.eventQueue.push(event);

    // Process queue if not already processing
    if (!this.isProcessing) {
      await this.processEventQueue();
    }
  }

  /**
   * Process the event queue
   */
  private async processEventQueue(): Promise<void> {
    if (this.isProcessing || this.eventQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.eventQueue.length > 0) {
        const event = this.eventQueue.shift()!;
        await this.processEvent(event);
      }
    } catch (error) {
      console.error('Error processing event queue:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single event
   */
  private async processEvent(event: SyncEvent): Promise<void> {
    const listeners = this.listeners.get(event.type) || [];
    
    console.log(`📡 Processing event: ${event.type} (${listeners.length} listeners)`);

    // Process listeners in priority order
    for (const listener of listeners) {
      try {
        await listener.callback(event);
      } catch (error) {
        console.error(`Error in event listener ${listener.id}:`, error);
      }
    }
  }

  /**
   * High-level methods for common sync operations
   */

  /**
   * Notify when user data changes
   */
  notifyUserDataChanged(userId: string, changes: any, source: SyncEvent['source'] = 'user'): void {
    this.emit({
      type: 'user_data_updated',
      payload: { userId, changes },
      timestamp: Date.now(),
      source,
      userId
    });
  }

  /**
   * Notify when fkey changes
   */
  notifyFkeyChanged(userId: string, oldFkey: string | null, newFkey: string, source: SyncEvent['source'] = 'user'): void {
    this.emit({
      type: 'fkey_changed',
      payload: { userId, oldFkey, newFkey },
      timestamp: Date.now(),
      source,
      userId
    });
  }

  /**
   * Notify when settings change
   */
  notifySettingsChanged(settingsType: string, changes: any, source: SyncEvent['source'] = 'user'): void {
    this.emit({
      type: 'settings_updated',
      payload: { settingsType, changes },
      timestamp: Date.now(),
      source
    });
  }

  /**
   * Notify backend sync events
   */
  notifyBackendSync(syncType: string, status: 'started' | 'completed' | 'failed', details?: any): void {
    this.emit({
      type: 'backend_sync',
      payload: { syncType, status, details },
      timestamp: Date.now(),
      source: 'backend'
    });
  }

  /**
   * Setup automatic sync listeners
   */
  setupAutomaticSync(): void {
    // Listen for user data changes and sync to backend
    this.addListener('user_data_updated', async (event) => {
      if (event.source === 'user' && event.userId) {
        await this.syncUserToBackend(event.userId, event.payload.changes);
      }
    }, 10);

    // Listen for fkey changes and update all data sources
    this.addListener('fkey_changed', async (event) => {
      if (event.source === 'user' && event.userId) {
        await this.syncFkeyToAllSources(event.userId, event.payload.newFkey);
      }
    }, 10);

    // Listen for backend sync events and update frontend
    this.addListener('backend_sync', async (event) => {
      if (event.payload.status === 'completed' && event.payload.syncType === 'user_data') {
        await this.updateFrontendFromBackend(event.payload.details);
      }
    }, 5);

    // Listen for storage events and propagate changes
    this.addListener('user_data_updated', async (event) => {
      if (event.source === 'storage') {
        await this.propagateStorageChanges(event.payload);
      }
    }, 1);

    console.log('🔄 Automatic sync listeners configured');
  }

  /**
   * Sync user data to backend
   */
  private async syncUserToBackend(userId: string, changes: any): Promise<void> {
    try {
      console.log(`🔄 Syncing user ${userId} to backend:`, changes);

      const response = await fetch('/api/user/stealth-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userAddress: userId,
          ...changes,
          source: 'event-sync'
        })
      });

      if (response.ok) {
        const result = await response.json();
        this.notifyBackendSync('user_data', 'completed', { userId, result });
      } else {
        throw new Error(`Backend sync failed: ${response.status}`);
      }
    } catch (error) {
      console.error(`Failed to sync user ${userId} to backend:`, error);
      this.notifyBackendSync('user_data', 'failed', { userId, error: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * Sync fkey to all data sources
   */
  private async syncFkeyToAllSources(userId: string, newFkey: string): Promise<void> {
    try {
      // Update localStorage
      storageManager.setUserFkey(userId, newFkey);

      // Update backend
      await this.syncUserToBackend(userId, { fkeyId: newFkey });

      console.log(`✅ Fkey synced across all sources for user ${userId}`);
    } catch (error) {
      console.error(`Failed to sync fkey for user ${userId}:`, error);
    }
  }

  /**
   * Update frontend from backend data
   */
  private async updateFrontendFromBackend(details: any): Promise<void> {
    try {
      if (details.userId && details.result?.stealthData) {
        const { fkeyId, stealthAddress } = details.result.stealthData;
        
        // Update storage manager
        storageManager.setAllUserData(details.userId, {
          fkeyId,
          stealthAddress
        });

        console.log(`✅ Frontend updated from backend for user ${details.userId}`);
      }
    } catch (error) {
      console.error('Failed to update frontend from backend:', error);
    }
  }

  /**
   * Propagate storage changes to other components
   */
  private async propagateStorageChanges(payload: any): Promise<void> {
    try {
      // Extract user ID from storage key
      const key = payload.key;
      if (key && key.includes('fkey_')) {
        const userId = key.replace(/.*fkey_/, '');
        
        if (payload.newValue !== payload.oldValue) {
          // Notify components about the change
          this.notifyUserDataChanged(userId, {
            fkeyId: payload.newValue
          }, 'storage');
        }
      }
    } catch (error) {
      console.error('Failed to propagate storage changes:', error);
    }
  }

  /**
   * Flush any pending synchronization
   */
  flushPendingSync(): void {
    try {
      // Force process any remaining events synchronously
      while (this.eventQueue.length > 0) {
        const event = this.eventQueue.shift()!;
        const listeners = this.listeners.get(event.type) || [];
        
        for (const listener of listeners) {
          try {
            // Call synchronously for critical cleanup
            const result = listener.callback(event);
            if (result instanceof Promise) {
              // For promises, we can't wait, but we log
              result.catch(error => console.error('Async listener error during flush:', error));
            }
          } catch (error) {
            console.error('Sync listener error during flush:', error);
          }
        }
      }
    } catch (error) {
      console.error('Error flushing pending sync:', error);
    }
  }

  /**
   * Get sync statistics
   */
  getSyncStats(): {
    activeListeners: number;
    pendingEvents: number;
    historySize: number;
    isProcessing: boolean;
    listenersByType: Record<string, number>;
  } {
    const listenersByType: Record<string, number> = {};
    
    for (const [eventType, listeners] of this.listeners.entries()) {
      listenersByType[eventType] = listeners.length;
    }

    return {
      activeListeners: Array.from(this.listeners.values()).reduce((sum, listeners) => sum + listeners.length, 0),
      pendingEvents: this.eventQueue.length,
      historySize: this.syncHistory.length,
      isProcessing: this.isProcessing,
      listenersByType
    };
  }

  /**
   * Get recent sync history
   */
  getSyncHistory(limit = 20): SyncEvent[] {
    return this.syncHistory.slice(-limit);
  }

  /**
   * Clear sync history
   */
  clearSyncHistory(): void {
    this.syncHistory = [];
    console.log('🧹 Sync history cleared');
  }

  /**
   * Cleanup and shutdown
   */
  shutdown(): void {
    this.flushPendingSync();
    this.listeners.clear();
    this.eventQueue = [];
    this.syncHistory = [];
    console.log('🛑 Event sync service shutdown');
  }
}

/**
 * React hook for using event sync in components
 */
export function useEventSync() {
  const syncService = EventSyncService.getInstance();

  const addListener = (eventType: SyncEvent['type'], callback: (event: SyncEvent) => void | Promise<void>, priority = 0) => {
    return syncService.addListener(eventType, callback, priority);
  };

  const removeListener = (listenerId: string) => {
    return syncService.removeListener(listenerId);
  };

  const notifyUserDataChanged = (userId: string, changes: any) => {
    syncService.notifyUserDataChanged(userId, changes);
  };

  const notifyFkeyChanged = (userId: string, oldFkey: string | null, newFkey: string) => {
    syncService.notifyFkeyChanged(userId, oldFkey, newFkey);
  };

  const notifySettingsChanged = (settingsType: string, changes: any) => {
    syncService.notifySettingsChanged(settingsType, changes);
  };

  return {
    addListener,
    removeListener,
    notifyUserDataChanged,
    notifyFkeyChanged,
    notifySettingsChanged,
    getSyncStats: () => syncService.getSyncStats(),
    getSyncHistory: (limit?: number) => syncService.getSyncHistory(limit)
  };
}

// Global instance
export const eventSyncService = EventSyncService.getInstance(); 