/**
 * Secure Storage Utility
 * Encrypts sensitive data before storing in localStorage
 */

interface SecureItem {
  encrypted: string;
  timestamp: number;
  expires?: number;
}

class SecureStorage {
  private readonly prefix = 'xmtp_secure_';
  private encryptionKey?: CryptoKey;

  private async getEncryptionKey(): Promise<CryptoKey> {
    if (this.encryptionKey) return this.encryptionKey;

    // Try to get existing key from storage
    const keyData = localStorage.getItem(`${this.prefix}encryption_key`);
    
    if (keyData) {
      try {
        const keyBuffer = new Uint8Array(JSON.parse(keyData));
        this.encryptionKey = await crypto.subtle.importKey(
          'raw',
          keyBuffer,
          { name: 'AES-GCM' },
          false,
          ['encrypt', 'decrypt']
        );
        return this.encryptionKey;
      } catch (error) {
        console.warn('Failed to import existing key, generating new one:', error);
      }
    }

    // Generate new key
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );

    // Export and store the key
    const keyBuffer = await crypto.subtle.exportKey('raw', key);
    localStorage.setItem(`${this.prefix}encryption_key`, JSON.stringify(Array.from(new Uint8Array(keyBuffer))));
    
    this.encryptionKey = key;
    return key;
  }

  private async encrypt(data: string): Promise<string> {
    const key = await this.getEncryptionKey();
    const iv = crypto.getRandomValues(new Uint8Array(12)); // 12 bytes for AES-GCM
    const encoder = new TextEncoder();
    const encodedData = encoder.encode(data);

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encodedData
    );

    // Combine IV and encrypted data
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    return btoa(String.fromCharCode(...combined));
  }

  private async decrypt(encryptedData: string): Promise<string> {
    const key = await this.getEncryptionKey();
    const combined = new Uint8Array(atob(encryptedData).split('').map(char => char.charCodeAt(0)));
    
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encrypted
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  }

  async setSecureItem(key: string, value: string, expiresInMs?: number): Promise<void> {
    try {
      const encrypted = await this.encrypt(value);
      const item: SecureItem = {
        encrypted,
        timestamp: Date.now(),
        expires: expiresInMs ? Date.now() + expiresInMs : undefined
      };
      
      localStorage.setItem(`${this.prefix}${key}`, JSON.stringify(item));
    } catch (error) {
      console.error('Failed to store secure item:', error);
      throw new Error('Failed to encrypt and store data');
    }
  }

  async getSecureItem(key: string): Promise<string | null> {
    try {
      const itemJson = localStorage.getItem(`${this.prefix}${key}`);
      if (!itemJson) return null;

      const item: SecureItem = JSON.parse(itemJson);
      
      // Check expiration
      if (item.expires && Date.now() > item.expires) {
        this.removeSecureItem(key);
        return null;
      }

      return await this.decrypt(item.encrypted);
    } catch (error) {
      console.error('Failed to retrieve secure item:', error);
      // Remove corrupted item
      this.removeSecureItem(key);
      return null;
    }
  }

  removeSecureItem(key: string): void {
    localStorage.removeItem(`${this.prefix}${key}`);
  }

  clearAllSecureItems(): void {
    const keys = Object.keys(localStorage).filter(key => key.startsWith(this.prefix));
    keys.forEach(key => localStorage.removeItem(key));
  }

  // Convenience methods for common secure storage needs
  async setJWT(userId: string, jwt: string, expiresInMs: number = 24 * 60 * 60 * 1000): Promise<void> {
    await this.setSecureItem(`jwt_${userId.toLowerCase()}`, jwt, expiresInMs);
  }

  async getJWT(userId: string): Promise<string | null> {
    return await this.getSecureItem(`jwt_${userId.toLowerCase()}`);
  }

  async setPrivateKey(key: string, privateKey: string): Promise<void> {
    await this.setSecureItem(`private_key_${key}`, privateKey, 7 * 24 * 60 * 60 * 1000); // 7 days
  }

  async getPrivateKey(key: string): Promise<string | null> {
    return await this.getSecureItem(`private_key_${key}`);
  }

  async setAPIKey(service: string, apiKey: string): Promise<void> {
    await this.setSecureItem(`api_key_${service}`, apiKey);
  }

  async getAPIKey(service: string): Promise<string | null> {
    return await this.getSecureItem(`api_key_${service}`);
  }
}

// Export singleton instance
export const secureStorage = new SecureStorage();

// Utility functions for migrating existing data
export async function migrateToSecureStorage(userId: string): Promise<void> {
  try {
    // Migrate JWT tokens
    const legacyJWT = localStorage.getItem('fkey:jwt') || 
                     localStorage.getItem(`proxy402_jwt_${userId.toLowerCase()}`);
    if (legacyJWT) {
      await secureStorage.setJWT(userId, legacyJWT);
      localStorage.removeItem('fkey:jwt');
      localStorage.removeItem(`proxy402_jwt_${userId.toLowerCase()}`);
      console.log('✅ Migrated JWT to secure storage');
    }

    // Migrate ephemeral private key
    const ephemeralKey = localStorage.getItem('xmtp:ephemeralKey');
    if (ephemeralKey) {
      await secureStorage.setPrivateKey('ephemeral', ephemeralKey);
      localStorage.removeItem('xmtp:ephemeralKey');
      console.log('✅ Migrated ephemeral key to secure storage');
    }

    // Migrate API keys
    const proxy402Key = localStorage.getItem('proxy402_api_key');
    if (proxy402Key) {
      await secureStorage.setAPIKey('proxy402', proxy402Key);
      localStorage.removeItem('proxy402_api_key');
      console.log('✅ Migrated API key to secure storage');
    }

  } catch (error) {
    console.error('❌ Failed to migrate to secure storage:', error);
  }
} 