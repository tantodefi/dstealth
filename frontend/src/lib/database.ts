interface UserData {
  address: string;
  ensName?: string;
  fkeyId?: string;
  bio?: string;
  avatar?: string;
  convosUsername?: string;
  jwtToken?: string;
  createdAt: string;
  updatedAt: string;
}

interface X402Link {
  id: string;
  userId: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  linkType: 'direct' | 'proxy';
  directUrl: string;
  proxyUrl: string;
  frameUrl?: string;
  ogImageUrl?: string;
  viewCount: number;
  purchaseCount: number;
  totalEarnings: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PaymentRecord {
  id: string;
  linkId: string;
  payerAddress: string;
  amount: number;
  currency: string;
  transactionHash: string;
  blockNumber?: number;
  createdAt: string;
}

interface PrivacyStats {
  userId: string;
  stealthAddressRegistrations: number;
  stealthPaymentsSent: number;
  stealthPaymentsReceived: number;
  umbraPayments: number;
  veilCashDeposits: number;
  privacyScore: number;
  updatedAt: string;
}

interface EarningsStats {
  userId: string;
  totalRevenue: number;
  proxy402Revenue: number;
  directPaymentRevenue: number;
  tipJarRevenue: number;
  totalLinks: number;
  totalViews: number;
  totalPurchases: number;
  updatedAt: string;
}

class DatabaseService {
  private storagePrefix = 'xmtp_app_';
  
  // Utility methods for localStorage operations
  private getKey(table: string, id?: string): string {
    return `${this.storagePrefix}${table}${id ? `_${id}` : ''}`;
  }
  
  private store(key: string, data: any): void {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to store data:', error);
    }
  }
  
  private retrieve<T>(key: string): T | null {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Failed to retrieve data:', error);
      return null;
    }
  }
  
  private remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error('Failed to remove data:', error);
    }
  }

  // User management
  async createOrUpdateUser(userData: Partial<UserData>): Promise<UserData> {
    if (!userData.address) {
      throw new Error('Address is required');
    }
    
    const now = new Date().toISOString();
    const existingUser = this.getUser(userData.address);
    
    const user: UserData = {
      address: userData.address,
      ensName: userData.ensName || existingUser?.ensName,
      fkeyId: userData.fkeyId || existingUser?.fkeyId,
      bio: userData.bio || existingUser?.bio,
      avatar: userData.avatar || existingUser?.avatar,
      convosUsername: userData.convosUsername || existingUser?.convosUsername,
      jwtToken: userData.jwtToken || existingUser?.jwtToken,
      createdAt: existingUser?.createdAt || now,
      updatedAt: now,
    };
    
    this.store(this.getKey('users', userData.address.toLowerCase()), user);
    return user;
  }
  
  getUser(address: string): UserData | null {
    return this.retrieve<UserData>(this.getKey('users', address.toLowerCase()));
  }
  
  // X402 Links management
  async createX402Link(linkData: Omit<X402Link, 'id' | 'viewCount' | 'purchaseCount' | 'totalEarnings' | 'createdAt' | 'updatedAt'>): Promise<X402Link> {
    const now = new Date().toISOString();
    const id = `link_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const link: X402Link = {
      id,
      ...linkData,
      viewCount: 0,
      purchaseCount: 0,
      totalEarnings: 0,
      createdAt: now,
      updatedAt: now,
    };
    
    // Store individual link
    this.store(this.getKey('x402_links', id), link);
    
    // Update user's link index
    const userLinksKey = this.getKey('user_links', linkData.userId.toLowerCase());
    const userLinks = this.retrieve<string[]>(userLinksKey) || [];
    userLinks.push(id);
    this.store(userLinksKey, userLinks);
    
    return link;
  }
  
  getUserX402Links(userId: string): X402Link[] {
    const userLinksKey = this.getKey('user_links', userId.toLowerCase());
    const linkIds = this.retrieve<string[]>(userLinksKey) || [];
    
    return linkIds
      .map(id => this.retrieve<X402Link>(this.getKey('x402_links', id)))
      .filter((link): link is X402Link => link !== null)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  
  updateX402Link(id: string, updates: Partial<X402Link>): X402Link | null {
    const link = this.retrieve<X402Link>(this.getKey('x402_links', id));
    if (!link) return null;
    
    const updatedLink = {
      ...link,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    
    this.store(this.getKey('x402_links', id), updatedLink);
    return updatedLink;
  }
  
  incrementLinkView(linkId: string): void {
    const link = this.retrieve<X402Link>(this.getKey('x402_links', linkId));
    if (link) {
      link.viewCount += 1;
      link.updatedAt = new Date().toISOString();
      this.store(this.getKey('x402_links', linkId), link);
    }
  }
  
  // Payment records
  async recordPayment(paymentData: Omit<PaymentRecord, 'id' | 'createdAt'>): Promise<PaymentRecord> {
    const now = new Date().toISOString();
    const id = `payment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const payment: PaymentRecord = {
      id,
      ...paymentData,
      createdAt: now,
    };
    
    // Store payment record
    this.store(this.getKey('payments', id), payment);
    
    // Update link earnings
    const link = this.retrieve<X402Link>(this.getKey('x402_links', paymentData.linkId));
    if (link) {
      link.purchaseCount += 1;
      link.totalEarnings += paymentData.amount;
      link.updatedAt = now;
      this.store(this.getKey('x402_links', paymentData.linkId), link);
    }
    
    return payment;
  }
  
  getLinkPayments(linkId: string): PaymentRecord[] {
    // In a real database, this would be a query. For localStorage, we need to scan
    const allKeys = Object.keys(localStorage).filter(key => 
      key.startsWith(this.getKey('payments')) && 
      localStorage.getItem(key)?.includes(`"linkId":"${linkId}"`)
    );
    
    return allKeys
      .map(key => this.retrieve<PaymentRecord>(key))
      .filter((payment): payment is PaymentRecord => payment !== null)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
  
  // Privacy stats
  updatePrivacyStats(userId: string, stats: Partial<Omit<PrivacyStats, 'userId' | 'updatedAt'>>): PrivacyStats {
    const existing = this.getPrivacyStats(userId);
    const now = new Date().toISOString();
    
    const updatedStats: PrivacyStats = {
      userId: userId.toLowerCase(),
      stealthAddressRegistrations: stats.stealthAddressRegistrations ?? existing?.stealthAddressRegistrations ?? 0,
      stealthPaymentsSent: stats.stealthPaymentsSent ?? existing?.stealthPaymentsSent ?? 0,
      stealthPaymentsReceived: stats.stealthPaymentsReceived ?? existing?.stealthPaymentsReceived ?? 0,
      umbraPayments: stats.umbraPayments ?? existing?.umbraPayments ?? 0,
      veilCashDeposits: stats.veilCashDeposits ?? existing?.veilCashDeposits ?? 0,
      privacyScore: stats.privacyScore ?? existing?.privacyScore ?? 0,
      updatedAt: now,
    };
    
    this.store(this.getKey('privacy_stats', userId.toLowerCase()), updatedStats);
    return updatedStats;
  }
  
  getPrivacyStats(userId: string): PrivacyStats | null {
    return this.retrieve<PrivacyStats>(this.getKey('privacy_stats', userId.toLowerCase()));
  }
  
  // Earnings stats
  updateEarningsStats(userId: string, stats: Partial<Omit<EarningsStats, 'userId' | 'updatedAt'>>): EarningsStats {
    const existing = this.getEarningsStats(userId);
    const now = new Date().toISOString();
    
    const updatedStats: EarningsStats = {
      userId: userId.toLowerCase(),
      totalRevenue: stats.totalRevenue ?? existing?.totalRevenue ?? 0,
      proxy402Revenue: stats.proxy402Revenue ?? existing?.proxy402Revenue ?? 0,
      directPaymentRevenue: stats.directPaymentRevenue ?? existing?.directPaymentRevenue ?? 0,
      tipJarRevenue: stats.tipJarRevenue ?? existing?.tipJarRevenue ?? 0,
      totalLinks: stats.totalLinks ?? existing?.totalLinks ?? 0,
      totalViews: stats.totalViews ?? existing?.totalViews ?? 0,
      totalPurchases: stats.totalPurchases ?? existing?.totalPurchases ?? 0,
      updatedAt: now,
    };
    
    this.store(this.getKey('earnings_stats', userId.toLowerCase()), updatedStats);
    return updatedStats;
  }
  
  getEarningsStats(userId: string): EarningsStats | null {
    return this.retrieve<EarningsStats>(this.getKey('earnings_stats', userId.toLowerCase()));
  }
  
  // Calculate aggregated stats from stored data
  calculateUserStats(userId: string): {
    totalEarnings: number;
    totalLinks: number;
    totalViews: number;
    totalPurchases: number;
    privacyScore: number;
    stealthActions: number;
    proxy402Revenue: number;
    directPaymentRevenue: number;
    x402Revenue: number;
    tipJarRevenue: number;
  } {
    const links = this.getUserX402Links(userId);
    const privacyStats = this.getPrivacyStats(userId);
    const earningsStats = this.getEarningsStats(userId);
    
    // Calculate earnings from X402 links directly
    const x402Revenue = links.reduce((sum, link) => sum + link.totalEarnings, 0);
    const totalViews = links.reduce((sum, link) => sum + link.viewCount, 0);
    const totalPurchases = links.reduce((sum, link) => sum + link.purchaseCount, 0);
    
    // Get stored earnings from database
    const proxy402Revenue = earningsStats?.proxy402Revenue ?? 0;
    const directPaymentRevenue = earningsStats?.directPaymentRevenue ?? 0;
    const tipJarRevenue = earningsStats?.tipJarRevenue ?? 0;
    
    // Calculate total earnings from all sources
    const totalEarnings = x402Revenue + proxy402Revenue + directPaymentRevenue + tipJarRevenue;
    
    const stealthActions = (privacyStats?.stealthPaymentsSent ?? 0) + 
                          (privacyStats?.stealthAddressRegistrations ?? 0) + 
                          (privacyStats?.umbraPayments ?? 0) + 
                          (privacyStats?.veilCashDeposits ?? 0);
    
    return {
      totalEarnings,
      totalLinks: links.length,
      totalViews,
      totalPurchases,
      privacyScore: privacyStats?.privacyScore ?? 0,
      stealthActions,
      proxy402Revenue,
      directPaymentRevenue,
      x402Revenue,
      tipJarRevenue,
    };
  }
  
  // Import legacy data from localStorage
  async importLegacyData(userId: string): Promise<void> {
    const keys = {
      proxy402Stats: `proxy402_activity_stats_${userId.toLowerCase()}`,
      proxy402Endpoints: `proxy402_endpoints_${userId.toLowerCase()}`,
      privacyStats: `privacy_stats_${userId.toLowerCase()}`,
      paymentUrlStats: `payment_url_stats_${userId.toLowerCase()}`,
      userDetails: `user_details_${userId.toLowerCase()}`,
    };
    
    // Import user details
    const userDetailsData = localStorage.getItem(keys.userDetails);
    if (userDetailsData) {
      try {
        const userDetails = JSON.parse(userDetailsData);
        await this.createOrUpdateUser({
          address: userId,
          fkeyId: userDetails.fkeyId,
          bio: userDetails.bio,
          avatar: userDetails.avatar,
        });
      } catch (error) {
        console.error('Failed to import user details:', error);
      }
    }
    
    // Import privacy stats
    const privacyStatsData = localStorage.getItem(keys.privacyStats);
    if (privacyStatsData) {
      try {
        const privacyStats = JSON.parse(privacyStatsData);
        this.updatePrivacyStats(userId, privacyStats);
      } catch (error) {
        console.error('Failed to import privacy stats:', error);
      }
    }
    
    // Import earnings data
    const proxy402StatsData = localStorage.getItem(keys.proxy402Stats);
    const paymentUrlStatsData = localStorage.getItem(keys.paymentUrlStats);
    
    if (proxy402StatsData || paymentUrlStatsData) {
      try {
        const proxy402Stats = proxy402StatsData ? JSON.parse(proxy402StatsData) : {};
        const paymentUrlStats = paymentUrlStatsData ? JSON.parse(paymentUrlStatsData) : {};
        
        this.updateEarningsStats(userId, {
          proxy402Revenue: (proxy402Stats.totalRevenue || 0) / 100,
          directPaymentRevenue: paymentUrlStats.directRevenue || 0,
          tipJarRevenue: paymentUrlStats.tipJarRevenue || 0,
          totalRevenue: ((proxy402Stats.totalRevenue || 0) / 100) + 
                       (paymentUrlStats.directRevenue || 0) + 
                       (paymentUrlStats.tipJarRevenue || 0),
          totalPurchases: proxy402Stats.totalPurchases || 0,
        });
      } catch (error) {
        console.error('Failed to import earnings data:', error);
      }
    }
  }
  
  // Export all user data
  exportUserData(userId: string): any {
    const user = this.getUser(userId);
    const links = this.getUserX402Links(userId);
    const privacyStats = this.getPrivacyStats(userId);
    const earningsStats = this.getEarningsStats(userId);
    const calculatedStats = this.calculateUserStats(userId);
    
    return {
      user,
      links,
      privacyStats,
      earningsStats,
      calculatedStats,
      exportedAt: new Date().toISOString(),
    };
  }
  
  // Clear all user data
  clearUserData(userId: string): void {
    const userLinksKey = this.getKey('user_links', userId.toLowerCase());
    const linkIds = this.retrieve<string[]>(userLinksKey) || [];
    
    // Remove all links
    linkIds.forEach(id => {
      this.remove(this.getKey('x402_links', id));
    });
    
    // Remove user data
    this.remove(this.getKey('users', userId.toLowerCase()));
    this.remove(userLinksKey);
    this.remove(this.getKey('privacy_stats', userId.toLowerCase()));
    this.remove(this.getKey('earnings_stats', userId.toLowerCase()));
  }
}

// Export singleton instance
export const database = new DatabaseService();

// Export types for external use
export type {
  UserData,
  X402Link,
  PaymentRecord,
  PrivacyStats,
  EarningsStats,
}; 