/**
 * Centralized localStorage management service
 * Prevents conflicts and provides consistent key management
 */

export interface StorageOptions {
  encrypt?: boolean;
  expiry?: number; // milliseconds
  compress?: boolean;
  version?: string;
}

export interface StorageEntry<T = any> {
  value: T;
  timestamp: number;
  expiry?: number;
  version?: string;
  encrypted?: boolean;
}

export class LocalStorageManager {
  private static instance: LocalStorageManager;
  private keyPrefix = 'xmtp_dstealth_';
  private encryptionKey: string | null = null;
  
  // Centralized key definitions
  public readonly KEYS = {
    // User Authentication
    WALLET_ADDRESS: `${this.keyPrefix}wallet_address`,
    CONNECTION_TYPE: `${this.keyPrefix}connection_type`,
    LAST_CONNECTED: `${this.keyPrefix}last_connected`,
    
    // XMTP Configuration
    XMTP_ENCRYPTION_KEY: `${this.keyPrefix}xmtp_encryption_key`,
    XMTP_ENVIRONMENT: `${this.keyPrefix}xmtp_environment`,
    XMTP_INITIALIZING: `${this.keyPrefix}xmtp_initializing`,
    XMTP_INIT_TIMESTAMP: `${this.keyPrefix}xmtp_init_timestamp`,
    
    // User Data
    FKEY_PREFIX: `${this.keyPrefix}fkey_`,
    ENS_PREFIX: `${this.keyPrefix}ens_`,
    AVATAR_PREFIX: `${this.keyPrefix}avatar_`,
    BIO_PREFIX: `${this.keyPrefix}bio_`,
    STEALTH_ADDRESS_PREFIX: `${this.keyPrefix}stealth_`,
    
    // Settings & Preferences
    PROXY402_API_KEY: `${this.keyPrefix}proxy402_api_key`,
    NOTIFICATION_SETTINGS: `${this.keyPrefix}notification_settings`,
    UI_PREFERENCES: `${this.keyPrefix}ui_preferences`,
    THEME: `${this.keyPrefix}theme`,
    
    // Sync & Cache
    SYNC_STATUS: `${this.keyPrefix}sync_status`,
    LAST_SYNC: `${this.keyPrefix}last_sync`,
    CACHE_VERSION: `${this.keyPrefix}cache_version`,
    FKEY_CACHE: `${this.keyPrefix}fkey_cache`,
    USER_CACHE: `${this.keyPrefix}user_cache`,
    
    // Security
    SESSION_TOKEN: `${this.keyPrefix}session_token`,
    SECURITY_SETTINGS: `${this.keyPrefix}security_settings`,
  };

  private constructor() {
    this.initializeEncryption();
    this.performMaintenanceTasks();
  }

  public static getInstance(): LocalStorageManager {
    if (!LocalStorageManager.instance) {
      LocalStorageManager.instance = new LocalStorageManager();
    }
    return LocalStorageManager.instance;
  }

  /**
   * Initialize encryption for sensitive data
   */
  private initializeEncryption(): void {
    try {
      // Generate or retrieve encryption key for localStorage
      let storedKey = localStorage.getItem(`${this.keyPrefix}storage_key`);
      if (!storedKey) {
        storedKey = this.generateStorageKey();
        localStorage.setItem(`${this.keyPrefix}storage_key`, storedKey);
      }
      this.encryptionKey = storedKey;
    } catch (error) {
      console.warn('Failed to initialize localStorage encryption:', error);
    }
  }

  /**
   * Generate a simple storage key for basic obfuscation
   */
  private generateStorageKey(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 32; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Simple encryption/obfuscation for sensitive data
   */
  private encrypt(data: string): string {
    if (!this.encryptionKey) return data;
    
    try {
      // Simple XOR encryption for basic obfuscation
      let result = '';
      for (let i = 0; i < data.length; i++) {
        const charCode = data.charCodeAt(i) ^ this.encryptionKey.charCodeAt(i % this.encryptionKey.length);
        result += String.fromCharCode(charCode);
      }
      return btoa(result);
    } catch (error) {
      console.warn('Encryption failed, storing as plain text:', error);
      return data;
    }
  }

  /**
   * Simple decryption for sensitive data
   */
  private decrypt(encryptedData: string): string {
    if (!this.encryptionKey) return encryptedData;
    
    try {
      const decoded = atob(encryptedData);
      let result = '';
      for (let i = 0; i < decoded.length; i++) {
        const charCode = decoded.charCodeAt(i) ^ this.encryptionKey.charCodeAt(i % this.encryptionKey.length);
        result += String.fromCharCode(charCode);
      }
      return result;
    } catch (error) {
      console.warn('Decryption failed, returning as-is:', error);
      return encryptedData;
    }
  }

  /**
   * Set a value in localStorage with options
   */
  setItem<T>(key: string, value: T, options: StorageOptions = {}): boolean {
    try {
      const entry: StorageEntry<T> = {
        value,
        timestamp: Date.now(),
        version: options.version || '1.0.0',
        encrypted: options.encrypt || false
      };

      if (options.expiry) {
        entry.expiry = Date.now() + options.expiry;
      }

      let serializedValue = JSON.stringify(entry);
      
      if (options.encrypt && this.encryptionKey) {
        serializedValue = this.encrypt(serializedValue);
      }

      localStorage.setItem(key, serializedValue);
      return true;
    } catch (error) {
      console.error(`Failed to set localStorage item ${key}:`, error);
      return false;
    }
  }

  /**
   * Get a value from localStorage with type safety
   */
  getItem<T>(key: string, defaultValue?: T): T | null {
    try {
      const stored = localStorage.getItem(key);
      if (!stored) {
        return defaultValue || null;
      }

      // Try to parse as StorageEntry first
      let parsed: StorageEntry<T>;
      try {
        // First try to decrypt if it's encrypted
        const decrypted = this.isEncrypted(stored) ? this.decrypt(stored) : stored;
        parsed = JSON.parse(decrypted);
      } catch (parseError) {
        // If parsing fails, it might be legacy data
        console.warn(`Legacy data found for key ${key}, migrating...`);
        return this.migrateLegacyData<T>(key, stored, defaultValue);
      }

      // Check if entry has expired
      if (parsed.expiry && Date.now() > parsed.expiry) {
        console.log(`Expired data removed for key: ${key}`);
        localStorage.removeItem(key);
        return defaultValue || null;
      }

      return parsed.value;
    } catch (error) {
      console.error(`Failed to get localStorage item ${key}:`, error);
      return defaultValue || null;
    }
  }

  /**
   * Remove an item from localStorage
   */
  removeItem(key: string): boolean {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error(`Failed to remove localStorage item ${key}:`, error);
      return false;
    }
  }

  /**
   * Check if a value appears to be encrypted
   */
  private isEncrypted(value: string): boolean {
    // Simple heuristic: encrypted values should be base64
    try {
      return btoa(atob(value)) === value;
    } catch {
      return false;
    }
  }

  /**
   * Migrate legacy data to new format
   */
  private migrateLegacyData<T>(key: string, legacyValue: string, defaultValue?: T): T | null {
    try {
      // Try to parse as raw JSON
      const parsed = JSON.parse(legacyValue);
      
      // Migrate to new format
      this.setItem(key, parsed, { version: '1.0.0' });
      
      console.log(`Successfully migrated legacy data for key: ${key}`);
      return parsed;
    } catch (error) {
      console.warn(`Failed to migrate legacy data for key ${key}:`, error);
      
      // Store the raw string value
      this.setItem(key, legacyValue as unknown as T, { version: '1.0.0' });
      return legacyValue as unknown as T;
    }
  }

  /**
   * High-level methods for specific data types
   */

  // User fkey management
  setUserFkey(address: string, fkeyId: string): boolean {
    return this.setItem(
      `${this.KEYS.FKEY_PREFIX}${address.toLowerCase()}`, 
      fkeyId, 
      { encrypt: false, version: '1.0.0' }
    );
  }

  getUserFkey(address: string): string | null {
    return this.getItem<string>(`${this.KEYS.FKEY_PREFIX}${address.toLowerCase()}`);
  }

  removeUserFkey(address: string): boolean {
    return this.removeItem(`${this.KEYS.FKEY_PREFIX}${address.toLowerCase()}`);
  }

  // ENS management
  setUserEns(address: string, ensName: string): boolean {
    return this.setItem(
      `${this.KEYS.ENS_PREFIX}${address.toLowerCase()}`, 
      ensName, 
      { version: '1.0.0' }
    );
  }

  getUserEns(address: string): string | null {
    return this.getItem<string>(`${this.KEYS.ENS_PREFIX}${address.toLowerCase()}`);
  }

  // Avatar management
  setUserAvatar(address: string, avatarUrl: string): boolean {
    return this.setItem(
      `${this.KEYS.AVATAR_PREFIX}${address.toLowerCase()}`, 
      avatarUrl, 
      { version: '1.0.0' }
    );
  }

  getUserAvatar(address: string): string | null {
    return this.getItem<string>(`${this.KEYS.AVATAR_PREFIX}${address.toLowerCase()}`);
  }

  // User bio management
  setUserBio(address: string, bio: string): boolean {
    return this.setItem(
      `${this.KEYS.BIO_PREFIX}${address.toLowerCase()}`, 
      bio, 
      { version: '1.0.0' }
    );
  }

  getUserBio(address: string): string | null {
    return this.getItem<string>(`${this.KEYS.BIO_PREFIX}${address.toLowerCase()}`);
  }

  // Connection state management
  setConnectionState(address: string, connectionType: string): boolean {
    const success1 = this.setItem(this.KEYS.WALLET_ADDRESS, address, { encrypt: true });
    const success2 = this.setItem(this.KEYS.CONNECTION_TYPE, connectionType);
    const success3 = this.setItem(this.KEYS.LAST_CONNECTED, Date.now());
    return success1 && success2 && success3;
  }

  getConnectionState(): { address: string | null; connectionType: string | null; lastConnected: number | null } {
    return {
      address: this.getItem<string>(this.KEYS.WALLET_ADDRESS),
      connectionType: this.getItem<string>(this.KEYS.CONNECTION_TYPE),
      lastConnected: this.getItem<number>(this.KEYS.LAST_CONNECTED)
    };
  }

  // XMTP configuration
  setXmtpConfig(config: { encryptionKey?: string; environment?: string }): boolean {
    let success = true;
    
    if (config.encryptionKey) {
      success = success && this.setItem(this.KEYS.XMTP_ENCRYPTION_KEY, config.encryptionKey, { encrypt: true });
    }
    
    if (config.environment) {
      success = success && this.setItem(this.KEYS.XMTP_ENVIRONMENT, config.environment);
    }
    
    return success;
  }

  getXmtpConfig(): { encryptionKey: string | null; environment: string | null } {
    return {
      encryptionKey: this.getItem<string>(this.KEYS.XMTP_ENCRYPTION_KEY),
      environment: this.getItem<string>(this.KEYS.XMTP_ENVIRONMENT)
    };
  }

  // Sync status management
  setSyncStatus(status: { lastSync: number; isActive: boolean; syncCount: number }): boolean {
    return this.setItem(this.KEYS.SYNC_STATUS, status, { version: '1.0.0' });
  }

  getSyncStatus(): { lastSync: number; isActive: boolean; syncCount: number } | null {
    return this.getItem(this.KEYS.SYNC_STATUS, { lastSync: 0, isActive: false, syncCount: 0 });
  }

  // User cache management
  setUserCache(users: any[]): boolean {
    return this.setItem(this.KEYS.USER_CACHE, users, { 
      expiry: 10 * 60 * 1000, // 10 minutes
      version: '1.0.0' 
    });
  }

  getUserCache(): any[] | null {
    return this.getItem<any[]>(this.KEYS.USER_CACHE, []);
  }

  /**
   * Cleanup and maintenance operations
   */
  performMaintenanceTasks(): void {
    this.cleanupExpiredEntries();
    this.migrateOldKeys();
    this.validateDataIntegrity();
  }

  /**
   * Clean up expired entries
   */
  private cleanupExpiredEntries(): void {
    try {
      const keysToRemove: string[] = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(this.keyPrefix)) continue;
        
        try {
          const stored = localStorage.getItem(key);
          if (!stored) continue;
          
          const decrypted = this.isEncrypted(stored) ? this.decrypt(stored) : stored;
          const parsed = JSON.parse(decrypted);
          
          if (parsed.expiry && Date.now() > parsed.expiry) {
            keysToRemove.push(key);
          }
        } catch (error) {
          // Skip malformed entries
          continue;
        }
      }
      
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      if (keysToRemove.length > 0) {
        console.log(`🧹 Cleaned up ${keysToRemove.length} expired localStorage entries`);
      }
    } catch (error) {
      console.warn('Failed to cleanup expired entries:', error);
    }
  }

  /**
   * Migrate old key formats
   */
  private migrateOldKeys(): void {
    const oldToNewMappings = [
      { old: 'fkey_', new: this.KEYS.FKEY_PREFIX },
      { old: 'ens_', new: this.KEYS.ENS_PREFIX },
      { old: 'avatar_', new: this.KEYS.AVATAR_PREFIX },
      { old: 'bio_', new: this.KEYS.BIO_PREFIX },
    ];

    oldToNewMappings.forEach(({ old, new: newPrefix }) => {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(old) || key.startsWith(this.keyPrefix)) continue;
        
        try {
          const value = localStorage.getItem(key);
          if (value) {
            const newKey = key.replace(old, newPrefix);
            this.setItem(newKey, value, { version: '1.0.0' });
            localStorage.removeItem(key);
            console.log(`🔄 Migrated key: ${key} → ${newKey}`);
          }
        } catch (error) {
          console.warn(`Failed to migrate key ${key}:`, error);
        }
      }
    });
  }

  /**
   * Validate data integrity
   */
  private validateDataIntegrity(): void {
    try {
      const corruptedKeys: string[] = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(this.keyPrefix)) continue;
        
        try {
          const stored = localStorage.getItem(key);
          if (!stored) continue;
          
          // Try to parse the entry
          const decrypted = this.isEncrypted(stored) ? this.decrypt(stored) : stored;
          JSON.parse(decrypted);
        } catch (error) {
          corruptedKeys.push(key);
        }
      }
      
      if (corruptedKeys.length > 0) {
        console.warn(`⚠️ Found ${corruptedKeys.length} corrupted localStorage entries:`, corruptedKeys);
        // Optionally remove corrupted entries
        // corruptedKeys.forEach(key => localStorage.removeItem(key));
      }
    } catch (error) {
      console.warn('Failed to validate data integrity:', error);
    }
  }

  /**
   * Get all user data for a specific address
   */
  getAllUserData(address: string): {
    fkeyId: string | null;
    ensName: string | null;
    avatar: string | null;
    bio: string | null;
    stealthAddress: string | null;
  } {
    const lowerAddress = address.toLowerCase();
    
    return {
      fkeyId: this.getUserFkey(lowerAddress),
      ensName: this.getUserEns(lowerAddress),
      avatar: this.getUserAvatar(lowerAddress),
      bio: this.getUserBio(lowerAddress),
      stealthAddress: this.getItem<string>(`${this.KEYS.STEALTH_ADDRESS_PREFIX}${lowerAddress}`)
    };
  }

  /**
   * Set all user data for a specific address
   */
  setAllUserData(address: string, userData: {
    fkeyId?: string;
    ensName?: string;
    avatar?: string;
    bio?: string;
    stealthAddress?: string;
  }): boolean {
    const lowerAddress = address.toLowerCase();
    let success = true;
    
    if (userData.fkeyId !== undefined) {
      success = success && this.setUserFkey(lowerAddress, userData.fkeyId);
    }
    
    if (userData.ensName !== undefined) {
      success = success && this.setUserEns(lowerAddress, userData.ensName);
    }
    
    if (userData.avatar !== undefined) {
      success = success && this.setUserAvatar(lowerAddress, userData.avatar);
    }
    
    if (userData.bio !== undefined) {
      success = success && this.setUserBio(lowerAddress, userData.bio);
    }
    
    if (userData.stealthAddress !== undefined) {
      success = success && this.setItem(`${this.KEYS.STEALTH_ADDRESS_PREFIX}${lowerAddress}`, userData.stealthAddress);
    }
    
    return success;
  }

  /**
   * Clear all data (logout)
   */
  clearAll(): boolean {
    try {
      const keysToRemove: string[] = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.keyPrefix)) {
          keysToRemove.push(key);
        }
      }
      
      keysToRemove.forEach(key => localStorage.removeItem(key));
      
      console.log(`🧹 Cleared ${keysToRemove.length} localStorage entries`);
      return true;
    } catch (error) {
      console.error('Failed to clear localStorage:', error);
      return false;
    }
  }

  /**
   * Get storage statistics
   */
  getStorageStats(): {
    totalKeys: number;
    totalSize: number;
    keysByCategory: Record<string, number>;
  } {
    const stats = {
      totalKeys: 0,
      totalSize: 0,
      keysByCategory: {} as Record<string, number>
    };

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(this.keyPrefix)) continue;
        
        const value = localStorage.getItem(key);
        if (!value) continue;
        
        stats.totalKeys++;
        stats.totalSize += key.length + value.length;
        
        // Categorize keys
        if (key.includes('fkey_')) {
          stats.keysByCategory.fkeys = (stats.keysByCategory.fkeys || 0) + 1;
        } else if (key.includes('ens_')) {
          stats.keysByCategory.ens = (stats.keysByCategory.ens || 0) + 1;
        } else if (key.includes('avatar_')) {
          stats.keysByCategory.avatars = (stats.keysByCategory.avatars || 0) + 1;
        } else if (key.includes('xmtp_')) {
          stats.keysByCategory.xmtp = (stats.keysByCategory.xmtp || 0) + 1;
        } else {
          stats.keysByCategory.other = (stats.keysByCategory.other || 0) + 1;
        }
      }
    } catch (error) {
      console.warn('Failed to calculate storage stats:', error);
    }

    return stats;
  }
}

// Global instance
export const storageManager = LocalStorageManager.getInstance(); 