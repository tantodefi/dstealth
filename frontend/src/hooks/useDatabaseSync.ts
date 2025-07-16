import { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { storageManager } from '../lib/localStorage-manager';

interface FrontendUserData {
  address: string;
  fkeyId?: string;
  username?: string;
  ensName?: string;
  avatar?: string;
  bio?: string;
  lastUpdated: number;
}

interface DatabaseSyncStatus {
  isActive: boolean;
  lastSync: number;
  syncCount: number;
  errors: string[];
}

export function useDatabaseSync() {
  const { address, isConnected } = useAccount();
  const [syncStatus, setSyncStatus] = useState<DatabaseSyncStatus>({
    isActive: false,
    lastSync: 0,
    syncCount: 0,
    errors: []
  });
  const [isLoading, setIsLoading] = useState(false);

  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';

  /**
   * Sync frontend localStorage data with backend
   */
  const syncFrontendData = useCallback(async () => {
    if (!isConnected) return;

    setIsLoading(true);
    
         try {
       // Collect all user data from centralized localStorage manager
       const frontendUsers: FrontendUserData[] = [];
       
       // Get storage statistics to identify user data
       const storageStats = storageManager.getStorageStats();
       
       // If we have fkey data, extract all users
       if (storageStats.keysByCategory.fkeys > 0) {
         // Get all user addresses that have fkeys stored
         const fkeyAddresses = new Set<string>();
         
         // Scan through keys to find fkey entries
         for (let i = 0; i < localStorage.length; i++) {
           const key = localStorage.key(i);
           if (key && key.startsWith(storageManager.KEYS.FKEY_PREFIX)) {
             const address = key.replace(storageManager.KEYS.FKEY_PREFIX, '');
             fkeyAddresses.add(address);
           }
         }
         
         // Extract data for each address
         for (const addr of fkeyAddresses) {
           try {
             const allUserData = storageManager.getAllUserData(addr);
             
             if (allUserData.fkeyId) {
               const userData: FrontendUserData = {
                 address: addr,
                 fkeyId: allUserData.fkeyId,
                 username: allUserData.fkeyId,
                 ensName: allUserData.ensName || undefined,
                 avatar: allUserData.avatar || undefined,
                 bio: allUserData.bio || undefined,
                 lastUpdated: Date.now()
               };
               
               frontendUsers.push(userData);
             }
           } catch (error) {
             console.warn(`Error processing user data for address ${addr}:`, error);
           }
         }
       }

       // Also add current user if connected and not already included
       if (address) {
         const existingUser = frontendUsers.find(u => u.address.toLowerCase() === address.toLowerCase());
         if (!existingUser) {
           const currentUserData = storageManager.getAllUserData(address);
           if (currentUserData.fkeyId) {
             frontendUsers.push({
               address,
               fkeyId: currentUserData.fkeyId,
               username: currentUserData.fkeyId,
               ensName: currentUserData.ensName || undefined,
               avatar: currentUserData.avatar || undefined,
               bio: currentUserData.bio || undefined,
               lastUpdated: Date.now()
             });
           }
         }
       }

      if (frontendUsers.length === 0) {
        console.log('📭 No frontend user data to sync');
        setSyncStatus(prev => ({ ...prev, lastSync: Date.now() }));
        return;
      }

      // Send data to backend sync service
      const response = await fetch(`${BACKEND_URL}/api/user/search/sync-frontend-users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          users: frontendUsers
        })
      });

      if (!response.ok) {
        throw new Error(`Sync failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      
      if (result.success) {
        setSyncStatus(prev => ({
          ...prev,
          isActive: true,
          lastSync: Date.now(),
          syncCount: prev.syncCount + 1,
          errors: [] // Clear errors on successful sync
        }));
        
        console.log(`✅ Frontend data synced successfully: ${result.syncedUsers} users`);
      } else {
        throw new Error(result.error || 'Unknown sync error');
      }
      
    } catch (error) {
      console.error('❌ Error syncing frontend data:', error);
      setSyncStatus(prev => ({
        ...prev,
        errors: [...prev.errors, error instanceof Error ? error.message : String(error)]
      }));
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, address, BACKEND_URL]);

  /**
   * Sync a specific user's data
   */
  const syncUserData = useCallback(async (userAddress: string) => {
    try {
      setIsLoading(true);
      
      const response = await fetch(`${BACKEND_URL}/api/user/stealth-data/${userAddress}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

             if (response.ok) {
         const result = await response.json();
         if (result.success && result.stealthData) {
           // Update localStorage with synced data using storage manager
           const { fkeyId, stealthAddress } = result.stealthData;
           if (fkeyId) {
             storageManager.setAllUserData(userAddress, { 
               fkeyId,
               stealthAddress: stealthAddress || undefined
             });
           }
           
           console.log(`✅ User data synced for ${userAddress}`);
           return result.stealthData;
         }
       }
      
      return null;
    } catch (error) {
      console.error(`❌ Error syncing user data for ${userAddress}:`, error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [BACKEND_URL]);

  /**
   * Save user data with automatic sync
   */
  const saveUserData = useCallback(async (userAddress: string, fkeyId: string, metadata?: Partial<FrontendUserData>) => {
         try {
       setIsLoading(true);
       
       // Save to centralized localStorage manager first
       const userData: any = { fkeyId };
       if (metadata) {
         userData.ensName = metadata.ensName;
         userData.avatar = metadata.avatar;
         userData.bio = metadata.bio;
       }
       
       storageManager.setAllUserData(userAddress, userData);
      
      // Send to backend
      const response = await fetch(`${BACKEND_URL}/api/user/stealth-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userAddress,
          fkeyId,
          source: 'frontend-settings'
        })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          console.log(`✅ User data saved for ${userAddress}`);
          
          // Trigger a sync to update all data sources
          await syncFrontendData();
          
          return result.stealthData;
        }
      }
      
      throw new Error('Failed to save user data to backend');
    } catch (error) {
      console.error(`❌ Error saving user data for ${userAddress}:`, error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [BACKEND_URL, syncFrontendData]);

  /**
   * Get comprehensive user data from all sources
   */
  const getUserData = useCallback(async (userAddress: string) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/user/stealth-data/${userAddress}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          return result.stealthData;
        }
      }
      
             // Fallback to localStorage via storage manager
       const userData = storageManager.getAllUserData(userAddress);
       if (userData.fkeyId) {
         return {
           fkeyId: userData.fkeyId,
           userAddress,
           stealthAddress: userData.stealthAddress,
           source: 'localStorage'
         };
       }
      
      return null;
    } catch (error) {
      console.error(`❌ Error getting user data for ${userAddress}:`, error);
      return null;
    }
  }, [BACKEND_URL]);

  /**
   * Clear sync errors
   */
  const clearErrors = useCallback(() => {
    setSyncStatus(prev => ({
      ...prev,
      errors: []
    }));
  }, []);

  // Auto-sync on mount and when user connects
  useEffect(() => {
    if (isConnected) {
      // Initial sync after a short delay
      const timer = setTimeout(syncFrontendData, 1000);
      return () => clearTimeout(timer);
    }
  }, [isConnected, syncFrontendData]);

  // Periodic sync every 5 minutes
  useEffect(() => {
    if (isConnected) {
      const interval = setInterval(syncFrontendData, 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [isConnected, syncFrontendData]);

  return {
    syncStatus,
    isLoading,
    syncFrontendData,
    syncUserData,
    saveUserData,
    getUserData,
    clearErrors,
    
    // Computed properties
    hasErrors: syncStatus.errors.length > 0,
    isActive: syncStatus.isActive,
    lastSyncTime: syncStatus.lastSync
  };
} 