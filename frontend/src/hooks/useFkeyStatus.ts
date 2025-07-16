import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useDatabaseSync } from './useDatabaseSync';
import { useEventSync } from '../services/event-sync-service';

export interface FkeyStatusData {
  fkeyId: string | null;
  status: 'not_set' | 'verified' | 'loading' | 'error';
  stealthAddress: string | null;
  lastUpdated: number | null;
}

export function useFkeyStatus() {
  const { address, isConnected } = useAccount();
  const { getUserData, saveUserData, syncUserData, isLoading: isSyncLoading } = useDatabaseSync();
  const { addListener, removeListener, notifyFkeyChanged } = useEventSync();
  const [fkeyStatus, setFkeyStatus] = useState<FkeyStatusData>({
    fkeyId: null,
    status: 'not_set',
    stealthAddress: null,
    lastUpdated: null
  });

  const loadFkeyStatus = async () => {
    if (!address || !isConnected) {
      setFkeyStatus({
        fkeyId: null,
        status: 'not_set',
        stealthAddress: null,
        lastUpdated: null
      });
      return;
    }

    setFkeyStatus(prev => ({ ...prev, status: 'loading' }));

    try {
      // Use database sync service to get comprehensive data
      const userData = await getUserData(address);
      
      if (userData && userData.fkeyId) {
        setFkeyStatus({
          fkeyId: userData.fkeyId,
          status: 'verified',
          stealthAddress: userData.stealthAddress || null,
          lastUpdated: userData.lastUpdated || Date.now()
        });
      } else {
        // Double-check by syncing user data from all sources
        const syncedData = await syncUserData(address);
        
        if (syncedData && syncedData.fkeyId) {
          setFkeyStatus({
            fkeyId: syncedData.fkeyId,
            status: 'verified',
            stealthAddress: syncedData.stealthAddress || null,
            lastUpdated: syncedData.lastUpdated || Date.now()
          });
        } else {
          setFkeyStatus({
            fkeyId: null,
            status: 'not_set',
            stealthAddress: null,
            lastUpdated: null
          });
        }
      }
    } catch (error) {
      console.error('Error loading fkey status:', error);
      setFkeyStatus(prev => ({ ...prev, status: 'error' }));
    }
  };

  const updateFkeyStatus = async (newFkeyId: string): Promise<boolean> => {
    if (!address || !isConnected) return false;

    const oldFkeyId = fkeyStatus.fkeyId;
    setFkeyStatus(prev => ({ ...prev, status: 'loading' }));

    try {
      // Use database sync service to save data across all sources
      const savedData = await saveUserData(address, newFkeyId);
      
      if (savedData) {
        setFkeyStatus({
          fkeyId: newFkeyId,
          status: 'verified',
          stealthAddress: savedData.stealthAddress || null,
          lastUpdated: Date.now()
        });

        // Notify event sync service about the fkey change
        notifyFkeyChanged(address.toLowerCase(), oldFkeyId, newFkeyId);
        
        return true;
      }
      
      setFkeyStatus(prev => ({ ...prev, status: 'error' }));
      return false;
    } catch (error) {
      console.error('Error updating fkey status:', error);
      setFkeyStatus(prev => ({ ...prev, status: 'error' }));
      return false;
    }
  };

  // Load status when component mounts or address changes
  useEffect(() => {
    loadFkeyStatus();
  }, [address, isConnected]);

  // Setup event listeners for real-time updates
  useEffect(() => {
    if (!address) return;

    // Listen for fkey changes for this user
    const fkeyChangeListener = addListener('fkey_changed', (event) => {
      if (event.userId === address.toLowerCase()) {
        setFkeyStatus(prev => ({
          ...prev,
          fkeyId: event.payload.newFkey,
          status: 'verified',
          lastUpdated: event.timestamp
        }));
      }
    });

    // Listen for user data updates
    const userDataListener = addListener('user_data_updated', (event) => {
      if (event.userId === address.toLowerCase() && event.payload.changes?.fkeyId) {
        setFkeyStatus(prev => ({
          ...prev,
          fkeyId: event.payload.changes.fkeyId,
          status: 'verified',
          lastUpdated: event.timestamp
        }));
      }
    });

    // Listen for backend sync completions
    const backendSyncListener = addListener('backend_sync', (event) => {
      if (event.payload.status === 'completed' && 
          event.payload.details?.userId === address.toLowerCase() &&
          event.payload.details?.result?.stealthData) {
        const { fkeyId, stealthAddress } = event.payload.details.result.stealthData;
        setFkeyStatus(prev => ({
          ...prev,
          fkeyId,
          stealthAddress,
          status: 'verified',
          lastUpdated: event.timestamp
        }));
      }
    });

    // Cleanup listeners on unmount
    return () => {
      removeListener(fkeyChangeListener);
      removeListener(userDataListener);
      removeListener(backendSyncListener);
    };
  }, [address, addListener, removeListener]);

  return {
    fkeyStatus,
    loadFkeyStatus,
    updateFkeyStatus,
    isLoading: fkeyStatus.status === 'loading' || isSyncLoading,
    hasError: fkeyStatus.status === 'error',
    isVerified: fkeyStatus.status === 'verified' && !!fkeyStatus.fkeyId,
    fkeyId: fkeyStatus.fkeyId
  };
} 