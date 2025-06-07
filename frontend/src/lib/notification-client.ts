import Redis from 'ioredis';

// Redis client setup
const redis = new Redis(process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL!);

export interface NotificationPreferences {
  userId: string;
  enableMilestones: boolean;
  enablePayments: boolean;
  enableSocial: boolean;
  enableFKSRewards: boolean;
  lastNotificationTime?: string;
}

export interface NotificationPayload {
  type: 'milestone' | 'payment' | 'social' | 'fks_reward';
  title: string;
  body: string;
  targetUrl?: string;
  userId: string;
  data?: Record<string, any>;
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
    await redis.setex(key, 86400 * 30, JSON.stringify(preferences)); // 30 days
  }

  // Get user notification preferences
  async getUserPreferences(userId: string): Promise<NotificationPreferences | null> {
    const key = `notifications:preferences:${userId}`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  // Add user to notification list
  async addUserToNotifications(userId: string, fcid?: string): Promise<void> {
    const userData = {
      userId,
      fcid,
      addedAt: new Date().toISOString(),
      lastActive: new Date().toISOString()
    };
    
    await redis.sadd('notifications:users', userId);
    await redis.setex(`notifications:user:${userId}`, 86400 * 30, JSON.stringify(userData));
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
      const recentCount = await redis.get(rateLimitKey);
      if (recentCount && parseInt(recentCount) > 5) { // Max 5 per hour
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

      await redis.lpush(`notifications:queue:${payload.userId}`, JSON.stringify(notification));
      await redis.ltrim(`notifications:queue:${payload.userId}`, 0, 99); // Keep last 100

      // Update rate limit
      await redis.incr(rateLimitKey);
      await redis.expire(rateLimitKey, 3600); // 1 hour

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
    const notifications = await redis.lrange(`notifications:queue:${userId}`, 0, limit - 1);
    return notifications.map(n => JSON.parse(n));
  }

  // Mark notification as read
  async markNotificationRead(userId: string, notificationId: string): Promise<void> {
    const notifications = await this.getUserNotifications(userId, 100);
    const updatedNotifications = notifications.map(n => 
      n.id === notificationId ? { ...n, read: true } : n
    );
    
    // Clear and rebuild list
    await redis.del(`notifications:queue:${userId}`);
    for (const notification of updatedNotifications.reverse()) {
      await redis.lpush(`notifications:queue:${userId}`, JSON.stringify(notification));
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
    await redis.setex(key, 3600, JSON.stringify(progress)); // 1 hour cache
  }

  async getCachedMilestoneProgress(userId: string): Promise<Record<string, number> | null> {
    const key = `milestones:progress:${userId}`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  // Store user activity stats for faster loading
  async cacheUserStats(userId: string, stats: any): Promise<void> {
    const key = `user:stats:${userId}`;
    await redis.setex(key, 1800, JSON.stringify(stats)); // 30 minutes cache
  }

  async getCachedUserStats(userId: string): Promise<any | null> {
    const key = `user:stats:${userId}`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  }
} 