"use client";

import React, { createContext, useContext, useEffect, ReactNode } from 'react';
import { eventSyncService } from '../services/event-sync-service';

interface EventSyncContextType {
  syncService: typeof eventSyncService;
  isInitialized: boolean;
}

const EventSyncContext = createContext<EventSyncContextType | null>(null);

interface EventSyncProviderProps {
  children: ReactNode;
}

export function EventSyncProvider({ children }: EventSyncProviderProps) {
  const [isInitialized, setIsInitialized] = React.useState(false);

  useEffect(() => {
    // Initialize the event sync service
    try {
      console.log('🚀 Initializing event sync service...');
      
      // Setup automatic synchronization
      eventSyncService.setupAutomaticSync();
      
      // Add a global error handler for sync events
      eventSyncService.addListener('backend_sync', (event) => {
        if (event.payload.status === 'failed') {
          console.warn('🚨 Backend sync failed:', event.payload);
        }
      }, 0);

      // Add a listener for storage events to debug cross-tab sync
      eventSyncService.addListener('user_data_updated', (event) => {
        if (event.source === 'storage') {
          console.log('📡 Cross-tab sync detected:', event);
        }
      }, 0);

      setIsInitialized(true);
      console.log('✅ Event sync service initialized successfully');
      
      // Log initial sync statistics
      const stats = eventSyncService.getSyncStats();
      console.log('📊 Initial sync stats:', stats);
      
    } catch (error) {
      console.error('❌ Failed to initialize event sync service:', error);
    }

    // Cleanup on unmount
    return () => {
      try {
        eventSyncService.shutdown();
        console.log('🛑 Event sync service shut down');
      } catch (error) {
        console.error('Error shutting down event sync service:', error);
      }
    };
  }, []);

  // Log sync stats periodically in development
  useEffect(() => {
    if (!isInitialized || process.env.NODE_ENV !== 'development') return;

    const interval = setInterval(() => {
      const stats = eventSyncService.getSyncStats();
      if (stats.pendingEvents > 0 || stats.activeListeners > 0) {
        console.log('📊 Sync stats:', stats);
      }
    }, 30000); // Every 30 seconds

    return () => clearInterval(interval);
  }, [isInitialized]);

  const contextValue: EventSyncContextType = {
    syncService: eventSyncService,
    isInitialized
  };

  return (
    <EventSyncContext.Provider value={contextValue}>
      {children}
    </EventSyncContext.Provider>
  );
}

export function useEventSyncContext(): EventSyncContextType {
  const context = useContext(EventSyncContext);
  if (!context) {
    throw new Error('useEventSyncContext must be used within an EventSyncProvider');
  }
  return context;
}

// Hook to check if sync is ready
export function useSyncReady(): boolean {
  const { isInitialized } = useEventSyncContext();
  return isInitialized;
}

// Hook to get sync statistics
export function useSyncStats() {
  const { syncService } = useEventSyncContext();
  const [stats, setStats] = React.useState(syncService.getSyncStats());

  useEffect(() => {
    const interval = setInterval(() => {
      setStats(syncService.getSyncStats());
    }, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, [syncService]);

  return stats;
}

// Hook to get sync history
export function useSyncHistory(limit = 10) {
  const { syncService } = useEventSyncContext();
  const [history, setHistory] = React.useState(syncService.getSyncHistory(limit));

  useEffect(() => {
    // Listen for new events and update history
    const listenerId = syncService.addListener('user_data_updated', () => {
      setHistory(syncService.getSyncHistory(limit));
    }, -1); // Low priority

    const fkeyListenerId = syncService.addListener('fkey_changed', () => {
      setHistory(syncService.getSyncHistory(limit));
    }, -1);

    const syncListenerId = syncService.addListener('backend_sync', () => {
      setHistory(syncService.getSyncHistory(limit));
    }, -1);

    return () => {
      syncService.removeListener(listenerId);
      syncService.removeListener(fkeyListenerId);
      syncService.removeListener(syncListenerId);
    };
  }, [syncService, limit]);

  return history;
} 