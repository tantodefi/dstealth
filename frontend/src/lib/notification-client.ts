import { Redis } from '@upstash/redis';

// Redis client setup with proper fallbacks
let redis: Redis | null = null;

try {
  // Use NEXT_PUBLIC_ prefixed variables for client-side access
  const redisUrl = process.env.NEXT_PUBLIC_UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.NEXT_PUBLIC_UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  
  if (redisUrl && redisToken) {
    redis = new Redis({
      url: redisUrl,
      token: redisToken,
    });
    console.log('✅ Redis client initialized successfully');
  } else {
    console.log('⚠️ Redis environment variables not set - running in fallback mode');
    console.log('Expected: NEXT_PUBLIC_UPSTASH_REDIS_REST_URL and NEXT_PUBLIC_UPSTASH_REDIS_REST_TOKEN');
  }
} catch (error) {
  console.error('❌ Failed to initialize Redis client:', error);
  redis = null;
}

export interface NotificationPreferences {
  userId: string;
  enableMilestones: boolean;
  enablePayments: boolean;
  enableSocial: boolean;
  enableFKSRewards: boolean;
  lastNotificationTime?: string;
  farcaster: boolean;
  achievements: boolean;
  fkey: boolean;
  payments: boolean;
  weekly: boolean;
  tokens: boolean;
  stealth: boolean;
}

export interface NotificationPayload {
  type: 'milestone' | 'payment' | 'social' | 'fks_reward' | 'stealth';
  title: string;
  body: string;
  targetUrl?: string;
  userId: string;
  data?: Record<string, any>;
}

export interface StealthNotificationData {
  stealthAddress?: string;
  ephemeralPublicKey?: string;
  scanKey?: string;
  spendKey?: string;
  announcementIndex?: number;
  registryAddress?: string;
  isStealthPayment?: boolean;
  scanTimestamp?: number;
  scanType?: string;
  announcementId?: string;
  stealthType?: 'stealth_payment_received' | 'stealth_payment_sent' | 'stealth_address_registered' | 'stealth_scan_complete';
}

export class NotificationClient {
  private static instance: NotificationClient;
  
  public static getInstance(): NotificationClient {
    if (!NotificationClient.instance) {
      NotificationClient.instance = new NotificationClient();
    }
    return NotificationClient.instance;
  }

  // Store user notification preferences
  async setUserPreferences(preferences: NotificationPreferences): Promise<void> {
    const key = `notifications:preferences:${preferences.userId}`;
    await redis?.set(key, JSON.stringify(preferences), { ex: 86400 * 30 }); // 30 days
  }

  // Get user notification preferences
  async getUserPreferences(userId: string): Promise<NotificationPreferences | null> {
    if (!redis) return null;
    try {
      const key = `notifications:preferences:${userId}`;
      const data = await redis.get(key);
      return data ? JSON.parse(data as string) : null;
    } catch (error) {
      console.error('Failed to get user preferences:', error);
      return null;
    }
  }

  // Add user to notification list
  async addUserToNotifications(userId: string, fcid?: string): Promise<void> {
    if (!redis) {
      console.log('⚠️ Redis not available - skipping user notification setup');
      return;
    }
    
    try {
      const userData = {
        userId,
        fcid,
        addedAt: new Date().toISOString(),
        lastActive: new Date().toISOString()
      };
      
      await redis.sadd('notifications:users', userId);
      await redis.set(`notifications:user:${userId}`, JSON.stringify(userData), { ex: 86400 * 30 });
    } catch (error) {
      console.error('Failed to add user to notifications:', error);
    }
  }

  // Send notification to user
  async sendNotification(payload: NotificationPayload): Promise<boolean> {
    try {
      // Check user preferences
      const preferences = await this.getUserPreferences(payload.userId);
      if (!this.shouldSendNotification(payload.type, preferences)) {
        return false;
      }

      // Rate limiting - prevent spam
      const rateLimitKey = `notifications:ratelimit:${payload.userId}:${payload.type}`;
      const recentCount = await redis?.get(rateLimitKey);
      if (recentCount && parseInt(String(recentCount)) > 5) { // Max 5 per hour
        return false;
      }

      // Store notification
      const notificationId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const notification = {
        id: notificationId,
        ...payload,
        sentAt: new Date().toISOString(),
        read: false
      };

      await redis?.lpush(`notifications:queue:${payload.userId}`, JSON.stringify(notification));
      await redis?.ltrim(`notifications:queue:${payload.userId}`, 0, 99); // Keep last 100

      // Update rate limit
      await redis?.incr(rateLimitKey);
      await redis?.expire(rateLimitKey, 3600); // 1 hour

      // Send to webhook if configured
      if (process.env.NOTIFICATION_WEBHOOK_URL) {
        await this.sendWebhook(notification);
      }

      return true;
    } catch (error) {
      console.error('Failed to send notification:', error);
      return false;
    }
  }

  // Send milestone achievement notification
  async sendMilestoneNotification(userId: string, milestone: any, tokensEarned: number): Promise<void> {
    await this.sendNotification({
      type: 'milestone',
      title: `🎉 ${milestone.name} Achieved!`,
      body: `You've earned ${tokensEarned.toLocaleString()} 🥷 tokens! ${milestone.description}`,
      targetUrl: `${process.env.NEXT_PUBLIC_URL}?tab=rewards`,
      userId,
      data: {
        milestoneId: milestone.id,
        tokensEarned,
        category: milestone.category
      }
    });
  }

  // Send FKS bonus notification
  async sendFKSBonusNotification(userId: string, fksBalance: string): Promise<void> {
    await this.sendNotification({
      type: 'fks_reward',
      title: '🎯 FluidKey Score Elite Detected!',
      body: `Massive 42,000 🥷 bonus available! Your FKS balance: ${fksBalance}`,
      targetUrl: `${process.env.NEXT_PUBLIC_URL}?tab=rewards`,
      userId,
      data: {
        bonusAmount: 42000,
        fksBalance,
        isElite: true
      }
    });
  }

  // Send payment received notification
  async sendPaymentNotification(userId: string, amount: string, currency: string, linkTitle: string): Promise<void> {
    await this.sendNotification({
      type: 'payment',
      title: '💰 Payment Received!',
      body: `${amount} ${currency} for "${linkTitle}". Content monetization working!`,
      targetUrl: `${process.env.NEXT_PUBLIC_URL}?tab=earnings`,
      userId,
      data: {
        amount,
        currency,
        linkTitle,
        timestamp: Date.now()
      }
    });
  }

  // Get user notifications
  async getUserNotifications(userId: string, limit = 20): Promise<any[]> {
    const notifications = await redis?.lrange(`notifications:queue:${userId}`, 0, limit - 1);
    return notifications?.map(n => JSON.parse(String(n))) || [];
  }

  // Mark notification as read
  async markNotificationRead(userId: string, notificationId: string): Promise<void> {
    const notifications = await this.getUserNotifications(userId, 100);
    const updatedNotifications = notifications.map(n => 
      n.id === notificationId ? { ...n, read: true } : n
    );
    
    // Clear and rebuild list
    await redis?.del(`notifications:queue:${userId}`);
    for (const notification of updatedNotifications.reverse()) {
      await redis?.lpush(`notifications:queue:${userId}`, JSON.stringify(notification));
    }
  }

  // Private helper methods
  private shouldSendNotification(type: string, preferences: NotificationPreferences | null): boolean {
    if (!preferences) return true; // Default to sending if no preferences set
    
    switch (type) {
      case 'milestone':
        return preferences.enableMilestones;
      case 'payment':
        return preferences.enablePayments;
      case 'social':
        return preferences.enableSocial;
      case 'fks_reward':
        return preferences.enableFKSRewards;
      case 'stealth':
        return preferences.stealth;
      default:
        return true;
    }
  }

  private async sendWebhook(notification: any): Promise<void> {
    try {
      await fetch(process.env.NOTIFICATION_WEBHOOK_URL!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.WEBHOOK_SECRET || ''}`
        },
        body: JSON.stringify(notification)
      });
    } catch (error) {
      console.error('Webhook failed:', error);
    }
  }

  // Cache milestone progress to reduce computation
  async cacheMilestoneProgress(userId: string, progress: Record<string, number>): Promise<void> {
    const key = `milestones:progress:${userId}`;
    await redis?.setex(key, 3600, JSON.stringify(progress)); // 1 hour cache
  }

  async getCachedMilestoneProgress(userId: string): Promise<Record<string, number> | null> {
    const key = `milestones:progress:${userId}`;
    const data = await redis?.get(key);
    return data ? JSON.parse(String(data)) : null;
  }

  // Store user activity stats for faster loading
  async cacheUserStats(userId: string, stats: any): Promise<void> {
    const key = `user:stats:${userId}`;
    await redis?.setex(key, 1800, JSON.stringify(stats)); // 30 minutes cache
  }

  async getCachedUserStats(userId: string): Promise<any | null> {
    const key = `user:stats:${userId}`;
    const data = await redis?.get(key);
    return data ? JSON.parse(String(data)) : null;
  }

  // Send stealth payment received notification
  async sendStealthPaymentNotification(userId: string, amount: string, currency: string, stealthAddress: string): Promise<void> {
    await this.sendNotification({
      type: 'payment',
      title: '🥷💰 Stealth Payment Received!',
      body: `${amount} ${currency} received via stealth address. Privacy protected!`,
      targetUrl: `${process.env.NEXT_PUBLIC_URL}?tab=privacy`,
      userId,
      data: {
        amount,
        currency,
        stealthAddress,
        isStealthPayment: true,
        timestamp: Date.now()
      }
    });
  }

  // Send stealth scan complete notification
  async sendStealthScanNotification(userId: string, foundPayments: number, scannedBlocks: number): Promise<void> {
    await this.sendNotification({
      type: 'milestone',
      title: '🔍🥷 Stealth Scan Complete',
      body: `Scanned ${scannedBlocks} blocks, found ${foundPayments} stealth payments`,
      targetUrl: `${process.env.NEXT_PUBLIC_URL}?tab=privacy`,
      userId,
      data: {
        foundPayments,
        scannedBlocks,
        scanType: 'stealth_registry',
        timestamp: Date.now()
      }
    });
  }

  // Send stealth address registered notification  
  async sendStealthRegistrationNotification(userId: string, stealthMetaAddress: string): Promise<void> {
    await this.sendNotification({
      type: 'milestone',
      title: '🔐🥷 Stealth Address Registered',
      body: 'Your stealth meta-address has been registered onchain. Privacy enhanced!',
      targetUrl: `${process.env.NEXT_PUBLIC_URL}?tab=privacy`,
      userId,
      data: {
        stealthMetaAddress,
        registrationType: 'stealth_registry',
        timestamp: Date.now()
      }
    });
  }
} 