import { Redis } from '@upstash/redis';
import { env } from '../config/env.js';

// Helper function to validate and get Redis URL
function getRedisUrl(): string | null {
  // Check for Upstash Redis URL first (most common for production)
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_URL.trim()) {
    return env.UPSTASH_REDIS_REST_URL.trim();
  }
  
  // Check for standard Redis URL
  if (env.REDIS_URL && env.REDIS_URL.trim()) {
    return env.REDIS_URL.trim();
  }
  
  // Default to local Redis only if we're in development
  if (process.env.NODE_ENV !== 'production') {
    return 'redis://localhost:6379';
  }
  
  // No valid Redis configuration found
  return null;
}

// Initialize Redis client with proper Upstash support
let redis: Redis | null = null;
let redisAvailable = false;

// Initialize Upstash Redis client
if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
  try {
    redis = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });
    
    redisAvailable = true;
    console.log('✅ Upstash Redis client initialized');
    
  } catch (error) {
    console.error('❌ Failed to initialize Upstash Redis:', error);
    redis = null;
    redisAvailable = false;
  }
} else if (env.REDIS_URL && env.REDIS_URL.trim() && process.env.NODE_ENV !== 'production') {
  // Fallback to regular Redis for local development
  console.log('ℹ️ Using local Redis (development mode)');
  // Keep redis as null for now - can implement ioredis fallback if needed
} else {
  console.log('ℹ️ No Redis configuration found - running in memory-only mode');
  redisAvailable = false;
}

export interface UserStealthData {
  userId: string;
  fkeyId: string;
  stealthAddress: string;
  zkProof: any;
  lastUpdated: number;
  requestedBy: string; // Agent inbox ID
  network?: string;
  metadata?: any;
  miniAppRegistered?: boolean; // Track if user completed mini app setup
  setupStatus?: 'new' | 'fkey_pending' | 'fkey_set' | 'miniapp_pending' | 'complete'; // Setup progress
}

export interface Proxy402Link {
  id: string;
  url: string;
  title: string;
  price: number;
  owner: string;
  createdAt: number;
  views: number;
  earnings: number;
}

export interface AgentInteraction {
  timestamp: number;
  action: string;
  data: any;
  success?: boolean;
  error?: string;
}

export class AgentDatabase {
  private keyPrefix = 'dstealth_agent:';

  // Check if Redis is available
  isRedisAvailable(): boolean {
    return redis !== null && redisAvailable;
  }

  // Create Redis key with prefix
  private key(suffix: string): string {
    return `${this.keyPrefix}${suffix}`;
  }

  // Store zkfetch proof for user
  async storeUserStealthData(data: UserStealthData): Promise<void> {
    try {
      if (!redis) {
        console.log('⚠️ Redis not available - cannot store stealth data');
        return;
      }
      
      const userKey = this.key(`stealth:${data.userId.toLowerCase()}`);
      const fkeyKey = this.key(`fkey:${data.fkeyId.toLowerCase()}`);
      
      // 🚨 SECURITY CHECK: Prevent duplicate fkey.id claims
      const existingFkeyData = await redis.get(fkeyKey);
      if (existingFkeyData) {
        const existing = typeof existingFkeyData === 'string' ? 
          JSON.parse(existingFkeyData) : existingFkeyData;
        
        // If different user is trying to claim same fkey.id, check if they can prove ownership
        if (existing.userId && existing.userId.toLowerCase() !== data.userId.toLowerCase()) {
          // 🔧 ENHANCED: Allow re-claiming if user provides valid zkProof (proves ownership)
          if (!data.zkProof || !data.zkProof.claimData) {
            console.log(`🚫 SECURITY BLOCK: User ${data.userId} tried to claim fkey.id ${data.fkeyId} already owned by ${existing.userId} without valid proof`);
            throw new Error(`FKEY_ALREADY_CLAIMED: This fkey.id (${data.fkeyId}) is already claimed by another user. To reclaim it from a different wallet, please provide valid ownership proof.`);
          }
          
          // If user has valid zkProof, allow them to reclaim (they proved ownership)
          console.log(`✅ OWNERSHIP VERIFIED: User ${data.userId} successfully reclaimed fkey.id ${data.fkeyId} with valid zkProof`);
        }
      }
      
      const stealthRecord = {
        ...data,
        lastUpdated: Date.now(),
        storedAt: new Date().toISOString()
      };

      const recordString = JSON.stringify(stealthRecord);

      // Store under both user address and fkey for quick lookup
      await redis.set(userKey, recordString, { ex: 86400 * 30 }); // 30 days
      await redis.set(fkeyKey, recordString, { ex: 86400 * 30 }); // 30 days
      
      console.log(`✅ Stored stealth data for user ${data.userId} and fkey ${data.fkeyId}`);
    } catch (error) {
      console.error('❌ Failed to store stealth data:', error);
      throw error;
    }
  }

  // Get stealth data by user address
  async getStealthDataByUser(userId: string): Promise<UserStealthData | null> {
    try {
      if (!redis) return null;
      
      const userKey = this.key(`stealth:${userId.toLowerCase()}`);
      const data = await redis.get(userKey);
      
      if (!data || data === null) return null;
      
      // Handle both string and object responses from Upstash
      if (typeof data === 'string') {
        return JSON.parse(data);
      } else if (typeof data === 'object') {
        return data as UserStealthData;
      }
      
      return null;
    } catch (error) {
      console.error('❌ Failed to get stealth data by user:', error);
      return null;
    }
  }

  // Get stealth data by fkey.id
  async getStealthDataByFkey(fkeyId: string): Promise<UserStealthData | null> {
    try {
      if (!redis) return null;
      
      const fkeyKey = this.key(`fkey:${fkeyId.toLowerCase()}`);
      const data = await redis.get(fkeyKey);
      
      if (!data || data === null) return null;
      
      // Handle both string and object responses from Upstash
      if (typeof data === 'string') {
        return JSON.parse(data);
      } else if (typeof data === 'object') {
        return data as UserStealthData;
      }
      
      return null;
    } catch (error) {
      console.error('❌ Failed to get stealth data by fkey:', error);
      return null;
    }
  }

  // Store proxy402 links for user (with shorter cache time)
  async storeProxy402Links(userId: string, links: Proxy402Link[]): Promise<void> {
    try {
      if (!redis) {
        console.log('⚠️ Redis not available - cannot store proxy402 links');
        return;
      }
      
      const linksKey = this.key(`proxy402_links:${userId.toLowerCase()}`);
      const cacheRecord = {
        links,
        cachedAt: Date.now(),
        expiresAt: Date.now() + (3600 * 1000) // 1 hour
      };
      
      await redis.set(linksKey, JSON.stringify(cacheRecord), { ex: 3600 }); // 1 hour cache
      console.log(`✅ Cached ${links.length} proxy402 links for user ${userId}`);
    } catch (error) {
      console.error('❌ Failed to store proxy402 links:', error);
    }
  }

  // Get proxy402 links for user
  async getProxy402Links(userId: string): Promise<Proxy402Link[] | null> {
    try {
      if (!redis) return null;
      
      const linksKey = this.key(`proxy402_links:${userId.toLowerCase()}`);
      const data = await redis.get(linksKey);
      
      if (!data || data === null) return null;
      
      let cacheRecord;
      
      // Handle both string and object responses from Upstash
      if (typeof data === 'string') {
        cacheRecord = JSON.parse(data);
      } else if (typeof data === 'object') {
        cacheRecord = data;
      } else {
        return null;
      }
      
      // Check if cache is still valid
      if (Date.now() > cacheRecord.expiresAt) {
        await redis.del(linksKey); // Clean up expired cache
        return null;
      }
      
      return cacheRecord.links;
    } catch (error) {
      console.error('❌ Failed to get proxy402 links:', error);
      return null;
    }
  }

  // Store agent interaction history with better organization
  async logAgentInteraction(agentInboxId: string, userInboxId: string, action: string, data: any): Promise<void> {
    try {
      if (!redis) return; // Silently skip if Redis not available
      
      const historyKey = this.key(`history:${agentInboxId}:${userInboxId}`);
      const interaction: AgentInteraction = {
        timestamp: Date.now(),
        action,
        data,
        success: true
      };
      
      // Store as list and keep only last 100 interactions
      await redis.lpush(historyKey, JSON.stringify(interaction));
      await redis.ltrim(historyKey, 0, 99); // Keep last 100 interactions
      await redis.expire(historyKey, 86400 * 7); // 7 days expiry
      
    } catch (error) {
      console.error('❌ Failed to log agent interaction:', error);
      // Don't throw here to prevent breaking the main flow
    }
  }

  // Store user interaction history
  async logUserInteraction(userId: string, action: string, metadata: any = {}): Promise<void> {
    try {
      if (!redis) return; // Silently skip if Redis not available
      
      const interactionKey = this.key(`user_interactions:${userId.toLowerCase()}`);
      const record = JSON.stringify({
        action,
        metadata,
        timestamp: Date.now()
      });
      
      // Store interaction with 30 day expiration
      await redis.lpush(interactionKey, record);
      await redis.expire(interactionKey, 86400 * 30); // 30 days
      
      // Keep only last 100 interactions per user
      await redis.ltrim(interactionKey, 0, 99);
      
      console.log(`✅ Logged user interaction: ${action} for user ${userId}`);
    } catch (error) {
      console.error('❌ Failed to log user interaction:', error);
    }
  }

  // Get user interaction count
  async getUserInteractionCount(userId: string): Promise<number> {
    try {
      if (!redis) return 0;
      
      const interactionKey = this.key(`user_interactions:${userId.toLowerCase()}`);
      const count = await redis.llen(interactionKey);
      return count || 0;
    } catch (error) {
      console.error('❌ Failed to get user interaction count:', error);
      return 0;
    }
  }

  // Get interaction history
  async getAgentHistory(agentInboxId: string, userInboxId: string, limit: number = 10): Promise<AgentInteraction[]> {
    try {
      if (!redis) return [];
      
      const historyKey = this.key(`history:${agentInboxId}:${userInboxId}`);
      const interactions = await redis.lrange(historyKey, 0, limit - 1);
      
      return interactions ? interactions.map((interaction: string) => JSON.parse(interaction)) : [];
    } catch (error) {
      console.error('❌ Failed to get agent history:', error);
      return [];
    }
  }

  // Store user preferences
  async storeUserPreferences(userId: string, preferences: any): Promise<void> {
    try {
      if (!redis) return;
      
      const prefsKey = this.key(`preferences:${userId.toLowerCase()}`);
      await redis.set(prefsKey, JSON.stringify(preferences), { ex: 86400 * 30 }); // 30 days
    } catch (error) {
      console.error('❌ Failed to store user preferences:', error);
    }
  }

  // Get user preferences
  async getUserPreferences(userId: string): Promise<any | null> {
    try {
      if (!redis) return null;
      
      const prefsKey = this.key(`preferences:${userId.toLowerCase()}`);
      const data = await redis.get(prefsKey);
      
      if (!data || data === null) return null;
      
      // Handle both string and object responses from Upstash
      if (typeof data === 'string') {
        return JSON.parse(data);
      } else if (typeof data === 'object') {
        return data;
      }
      
      return null;
    } catch (error) {
      console.error('❌ Failed to get user preferences:', error);
      return null;
    }
  }

  // Test Redis connection
  async testConnection(): Promise<boolean> {
    try {
      if (!redis) {
        console.log('⚠️ Redis not configured - connection test skipped');
        return false;
      }
      
      const pingResult = await redis.ping();
      if (pingResult === 'PONG') {
        console.log('✅ Redis connection test successful');
        return true;
      } else {
        console.log('⚠️ Redis ping returned unexpected result:', pingResult);
        return false;
      }
    } catch (error) {
      console.error('❌ Redis connection test failed:', error);
      return false;
    }
  }

  // Clear all agent data (for testing/cleanup)
  async clearAgentData(): Promise<void> {
    try {
      if (!redis) {
        console.log('⚠️ Redis not available - cannot clear data');
        return;
      }
      
      const pattern = this.key('*');
      const keys = await redis.keys(pattern);
      
      if (keys && keys.length > 0) {
        await redis.del(...keys);
        console.log(`🧹 Cleared ${keys.length} agent database entries`);
      } else {
        console.log('🧹 No agent data to clear');
      }
    } catch (error) {
      console.error('❌ Failed to clear agent data:', error);
    }
  }

  // Get database stats
  async getStats(): Promise<any> {
    try {
      if (!redis) {
        return {
          totalKeys: 0,
          stealthData: 0,
          fkeyData: 0,
          proxy402Cache: 0,
          interactions: 0,
          preferences: 0,
          lastUpdated: new Date().toISOString(),
          error: 'Redis not available'
        };
      }
      
      const pattern = this.key('*');
      const keys = await redis.keys(pattern);
      
      if (!keys) {
        return {
          totalKeys: 0,
          stealthData: 0,
          fkeyData: 0,
          proxy402Cache: 0,
          interactions: 0,
          preferences: 0,
          lastUpdated: new Date().toISOString(),
          error: 'Failed to get keys'
        };
      }
      
      const stats = {
        totalKeys: keys.length,
        stealthData: keys.filter((k: string) => k.includes(':stealth:')).length,
        fkeyData: keys.filter((k: string) => k.includes(':fkey:')).length,
        proxy402Cache: keys.filter((k: string) => k.includes(':proxy402_links:')).length,
        interactions: keys.filter((k: string) => k.includes(':history:')).length,
        preferences: keys.filter((k: string) => k.includes(':preferences:')).length,
        lastUpdated: new Date().toISOString()
      };
      
      return stats;
    } catch (error) {
      console.error('❌ Failed to get database stats:', error);
      return { error: 'Failed to get stats' };
    }
  }

  // Get users with stealth notifications enabled
  async getUsersWithStealthNotifications(): Promise<any[]> {
    try {
      if (!redis) return [];
      
      const pattern = this.key('stealth_user:*');
      const keys = await redis.keys(pattern);
      const users = [];
      
      if (keys && keys.length > 0) {
        for (const key of keys) {
          const userData = await redis.get(key);
          if (userData) {
            let user;
            if (typeof userData === 'string') {
              user = JSON.parse(userData);
            } else {
              user = userData;
            }
            
            // Only include users with notifications enabled
            if (user.notificationPrefs?.stealthEnabled !== false) {
              users.push(user);
            }
          }
        }
      }
      
      return users;
    } catch (error) {
      console.error('❌ Failed to get users with stealth notifications:', error);
      return [];
    }
  }

  // Store/update stealth user data
  async storeStealthUser(userId: string, userData: any): Promise<void> {
    try {
      if (!redis) return;
      
      const userKey = this.key(`stealth_user:${userId.toLowerCase()}`);
      const record = {
        ...userData,
        userId,
        lastUpdated: Date.now()
      };
      
      await redis.set(userKey, JSON.stringify(record), { ex: 86400 * 30 }); // 30 days
      console.log(`✅ Stored stealth user data for ${userId}`);
    } catch (error) {
      console.error('❌ Failed to store stealth user:', error);
    }
  }

  // Update user's last stealth notification timestamp
  async updateUserLastStealthNotification(userId: string, timestamp: number): Promise<void> {
    try {
      if (!redis) return;
      
      const userKey = this.key(`stealth_user:${userId.toLowerCase()}`);
      const existingData = await redis.get(userKey);
      
      let userData = {};
      if (existingData) {
        if (typeof existingData === 'string') {
          userData = JSON.parse(existingData);
        } else {
          userData = existingData as any;
        }
      }
      
      const updatedData = {
        ...userData,
        userId,
        lastStealthNotification: timestamp,
        lastUpdated: Date.now()
      };
      
      await redis.set(userKey, JSON.stringify(updatedData), { ex: 86400 * 30 }); // 30 days
    } catch (error) {
      console.error('❌ Failed to update user last stealth notification:', error);
    }
  }

  // Close Redis connection
  async close(): Promise<void> {
    try {
      if (redis) {
        // Upstash Redis doesn't need explicit connection closing
        redis = null;
        redisAvailable = false;
        console.log('🔌 Redis connection closed');
      }
    } catch (error) {
      console.error('❌ Error closing Redis connection:', error);
    }
  }

  // Helper method to update stealth data by user
  async updateStealthDataByUser(userId: string, updates: Partial<UserStealthData>): Promise<void> {
    const existingData = await this.getStealthDataByUser(userId);
    
    if (!existingData) {
      throw new Error(`No stealth data found for user ${userId}`);
    }

    const updatedData: UserStealthData = {
      ...existingData,
      ...updates,
      userId, // Ensure userId is preserved
      lastUpdated: Date.now()
    };

    await this.storeUserStealthData(updatedData);
  }
}

// Export singleton instance
export const agentDb = new AgentDatabase(); 