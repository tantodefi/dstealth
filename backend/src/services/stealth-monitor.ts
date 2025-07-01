import { createPublicClient, http, parseAbi, type Log } from 'viem';
import { mainnet, base, sepolia, baseSepolia } from 'viem/chains';
import { Redis } from '@upstash/redis';
import { AgentDatabase } from '../lib/agent-database';

// Stealth contract addresses and ABIs
const STEALTH_CONTRACTS = {
  ERC5564Announcer: '0x55649E01B5Df198D18D95b5cc5051630cfD45564' as `0x${string}`,
  ERC6538Registry: '0x6538E6bf4B0eBd30A8Ea093027Ac2422ce5d6538' as `0x${string}`
};

const ANNOUNCER_ABI = parseAbi([
  'event Announcement(uint256 indexed schemeId, address indexed stealthAddress, address indexed caller, bytes ephemeralPubKey, bytes metadata)'
]);

const REGISTRY_ABI = parseAbi([
  'event StealthMetaAddressSet(address indexed registrant, uint256 indexed schemeId, bytes stealthMetaAddress)'
]);

interface MonitoredUser {
  address: string;
  userId: string;
  enabledNotifications: {
    stealthPayments: boolean;
    stealthRegistrations: boolean;
    stealthAnnouncements: boolean;
  };
  lastNotified: number;
  scanKeys?: string[];
}

interface StealthEvent {
  type: 'announcement' | 'registration';
  txHash: string;
  blockNumber: number;
  timestamp: number;
  address: string;
  amount?: string;
  stealthAddress?: string;
  ephemeralPubKey?: string;
  metadata?: string;
  chainId: number;
}

interface ChainConfig {
  name: string;
  client: any;
  scanInterval: number;
  maxBlockRange: number;
  lastProcessed: number;
  failureCount: number;
  nextScanTime: number;
}

export class StealthMonitorService {
  private redis: Redis;
  private database: AgentDatabase;
  private chains: Map<string, ChainConfig> = new Map();
  private isRunning: boolean = false;
  private monitoredUsers: Map<string, MonitoredUser> = new Map();
  private processedEvents: Set<string> = new Set();
  private scanningPromises: Map<string, Promise<void>> = new Map();
  
  // Optimized settings for hourly scanning to reduce log spam
  private readonly MAX_NOTIFICATIONS_PER_HOUR = 10;
  private readonly MIN_NOTIFICATION_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private readonly BASE_SCAN_INTERVAL = 60 * 60 * 1000; // 1 HOUR base interval - reduced log spam
  private readonly MAX_SCAN_INTERVAL = 2 * 60 * 60 * 1000; // 2 hours max interval
  private readonly USER_REFRESH_INTERVAL = 2 * 60 * 60 * 1000; // 2 hours - reduced frequency
  private readonly MAX_BLOCK_RANGE = 50; // Larger range since we scan less frequently
  private readonly PROCESSED_EVENTS_LIMIT = 10000; // Prevent memory leaks
  private readonly MAX_FAILURE_COUNT = 5;

  constructor() {
    this.redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
    
    this.database = new AgentDatabase();
    
    // Initialize optimized chain configurations
    this.initializeChains();
    
    console.log('🥷 Enhanced Stealth Monitor Service initialized');
  }

  private initializeChains(): void {
    const chainConfigs = [
      {
        name: 'mainnet',
        chain: mainnet,
        rpcUrls: [
          'https://ethereum-rpc.publicnode.com',
          'https://rpc.ankr.com/eth',
          'https://eth.drpc.org'
        ],
        scanInterval: this.BASE_SCAN_INTERVAL, // 1 hour
        maxBlockRange: this.MAX_BLOCK_RANGE // Larger range for hourly scans
      },
      {
        name: 'base',
        chain: base,
        rpcUrls: [
          'https://base-rpc.publicnode.com',
          'https://mainnet.base.org',
          'https://base.drpc.org'
        ],
        scanInterval: this.BASE_SCAN_INTERVAL, // 1 hour
        maxBlockRange: this.MAX_BLOCK_RANGE
      }
      // Disable testnets in production to reduce log spam
      // {
      //   name: 'sepolia',
      //   chain: sepolia,
      //   rpcUrls: [
      //     'https://ethereum-sepolia-rpc.publicnode.com',
      //     'https://rpc.sepolia.org',
      //     'https://sepolia.drpc.org'
      //   ],
      //   scanInterval: this.BASE_SCAN_INTERVAL * 2, // 2 hours for testnets
      //   maxBlockRange: 10
      // },
      // {
      //   name: 'baseSepolia',
      //   chain: baseSepolia,
      //   rpcUrls: [
      //     'https://sepolia.base.org',
      //     'https://base-sepolia-rpc.publicnode.com'
      //   ],
      //   scanInterval: this.BASE_SCAN_INTERVAL * 2, // 2 hours for testnets
      //   maxBlockRange: 10
      // }
    ];

    for (const config of chainConfigs) {
      // Create client with fallback transports
      const transports = config.rpcUrls.map(url => http(url));
      const client = createPublicClient({
        chain: config.chain,
        transport: transports[0], // Primary RPC
        batch: {
          multicall: true,
        }
      });

      this.chains.set(config.name, {
        name: config.name,
        client,
        scanInterval: config.scanInterval,
        maxBlockRange: config.maxBlockRange,
        lastProcessed: 0,
        failureCount: 0,
        nextScanTime: 0
      });
    }
  }

  /**
   * Start the optimized monitoring service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️ Stealth monitor already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 Starting enhanced stealth transaction monitoring...');

    try {
      // Load initial state
      await this.loadChainStates();
      await this.refreshMonitoredUsers();

      // Start optimized monitoring loops
      this.startParallelChainMonitoring();
      this.startUserRefresh();
      this.startEventCleanup();

      console.log('✅ Enhanced stealth monitor service started successfully');
    } catch (error) {
      console.error('❌ Failed to start stealth monitor:', error);
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Stop the monitoring service
   */
  async stop(): Promise<void> {
    console.log('🛑 Stopping enhanced stealth monitor service...');
    this.isRunning = false;
    
    // Wait for all scanning promises to complete
    await Promise.allSettled(this.scanningPromises.values());
    this.scanningPromises.clear();
  }

  /**
   * Start parallel chain monitoring with dynamic intervals
   */
  private startParallelChainMonitoring(): void {
    for (const [chainName, chainConfig] of this.chains) {
      this.startChainScanning(chainName);
    }
  }

  /**
   * Start scanning for a specific chain with exponential backoff
   */
  private async startChainScanning(chainName: string): Promise<void> {
    const scanChain = async () => {
      if (!this.isRunning) return;

      const chainConfig = this.chains.get(chainName);
      if (!chainConfig) return;

      // Check if it's time to scan this chain
      const now = Date.now();
      if (now < chainConfig.nextScanTime) {
        setTimeout(() => scanChain(), chainConfig.nextScanTime - now);
        return;
      }

      try {
        await this.scanChainForStealthEvents(chainName);
        
        // Reset failure count on success
        chainConfig.failureCount = 0;
        chainConfig.scanInterval = this.BASE_SCAN_INTERVAL;
        
      } catch (error) {
        console.error(`❌ Error scanning ${chainName}:`, error);
        
        // Exponential backoff on failures
        chainConfig.failureCount++;
        const backoffMultiplier = Math.min(Math.pow(2, chainConfig.failureCount), 8);
        chainConfig.scanInterval = Math.min(
          this.BASE_SCAN_INTERVAL * backoffMultiplier,
          this.MAX_SCAN_INTERVAL
        );
        
        console.log(`⏳ ${chainName} backoff: ${chainConfig.scanInterval}ms (failure #${chainConfig.failureCount})`);
      }

      // Schedule next scan
      chainConfig.nextScanTime = Date.now() + chainConfig.scanInterval;
      if (this.isRunning && chainConfig.failureCount < this.MAX_FAILURE_COUNT) {
        setTimeout(() => scanChain(), chainConfig.scanInterval);
      } else if (chainConfig.failureCount >= this.MAX_FAILURE_COUNT) {
        console.error(`💀 ${chainName} disabled after ${this.MAX_FAILURE_COUNT} consecutive failures`);
      }
    };

    // Store the scanning promise
    const scanPromise = scanChain();
    this.scanningPromises.set(chainName, scanPromise);
  }

  /**
   * Optimized chain scanning with smaller block ranges
   */
  private async scanChainForStealthEvents(chainName: string): Promise<void> {
    const chainConfig = this.chains.get(chainName);
    if (!chainConfig) return;

    const client = chainConfig.client;
    
    // Get current block number
    const currentBlock = await client.getBlockNumber();
    const lastProcessed = BigInt(chainConfig.lastProcessed || Number(currentBlock - 5n)); // Start 5 blocks back
    
    // Only scan if there are new blocks
    if (currentBlock <= lastProcessed) {
      return;
    }

    // Process blocks in small batches to avoid RPC limits
    let fromBlock = lastProcessed + 1n;
    const maxRange = BigInt(chainConfig.maxBlockRange);
    let totalBlocks = 0;
    let totalEvents = 0;
    
    while (fromBlock <= currentBlock && this.isRunning) {
      const toBlock = fromBlock + maxRange - 1n > currentBlock ? currentBlock : fromBlock + maxRange - 1n;
      
      // Only log scanning if there are many blocks to catch up
      const blocksToScan = Number(currentBlock - lastProcessed);
      if (blocksToScan > 100) {
        console.log(`🔍 Scanning ${chainName} blocks ${fromBlock} to ${toBlock} (${blocksToScan} total blocks behind)`);
      }

      try {
        // Parallel event scanning for both contracts
        const [announcementLogs, registrationLogs] = await Promise.all([
          this.getLogs(client, STEALTH_CONTRACTS.ERC5564Announcer, ANNOUNCER_ABI[0], fromBlock, toBlock),
          this.getLogs(client, STEALTH_CONTRACTS.ERC6538Registry, REGISTRY_ABI[0], fromBlock, toBlock)
        ]);

        // Process events in parallel
        const eventPromises = [
          ...announcementLogs.map(log => this.processAnnouncementEvent(log, chainName)),
          ...registrationLogs.map(log => this.processRegistrationEvent(log, chainName))
        ];

        await Promise.allSettled(eventPromises);

        // Only log when events are found
        if (announcementLogs.length > 0 || registrationLogs.length > 0) {
          console.log(`📊 ${chainName}: ${announcementLogs.length} announcements, ${registrationLogs.length} registrations`);
          totalEvents += announcementLogs.length + registrationLogs.length;
        }

      } catch (error) {
        console.error(`❌ Failed to scan ${chainName} blocks ${fromBlock}-${toBlock}:`, error);
        throw error; // Re-throw to trigger backoff
      }

      fromBlock = toBlock + 1n;
      totalBlocks += Number(toBlock - fromBlock + 1n);
    }

    // Update last processed block
    chainConfig.lastProcessed = Number(currentBlock);
    await this.saveChainState(chainName, chainConfig.lastProcessed);
    
    // Log summary only if significant activity
    if (totalBlocks > 50 || totalEvents > 0) {
      console.log(`✅ ${chainName}: scanned ${totalBlocks} blocks, found ${totalEvents} stealth events`);
    }
  }

  /**
   * Robust getLogs with retry logic
   */
  private async getLogs(client: any, address: string, event: any, fromBlock: bigint, toBlock: bigint): Promise<Log[]> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await client.getLogs({
          address,
          event,
          fromBlock,
          toBlock,
        });
      } catch (error) {
        lastError = error as Error;
        console.warn(`⚠️ getLogs attempt ${attempt}/${maxRetries} failed:`, error);
        
        if (attempt < maxRetries) {
          // Wait before retry with exponential backoff
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    throw lastError;
  }

  /**
   * Process stealth announcement events
   */
  private async processAnnouncementEvent(log: Log, chain: string): Promise<void> {
    try {
      const eventId = `${chain}-${log.transactionHash}-${log.logIndex}`;
      
      // Skip if already processed
      if (this.processedEvents.has(eventId)) {
        return;
      }
      this.processedEvents.add(eventId);

      const stealthEvent: StealthEvent = {
        type: 'announcement',
        txHash: log.transactionHash!,
        blockNumber: Number(log.blockNumber),
        timestamp: Math.floor(Date.now() / 1000),
        address: log.topics[2] as string, // caller address
        stealthAddress: log.topics[1] as string,
        ephemeralPubKey: '', // Would decode from log data
        metadata: '', // Would decode from log data
        chainId: this.getChainId(chain)
      };

      // Check if any monitored users should be notified
      await this.checkAndNotifyUsers(stealthEvent);

    } catch (error) {
      console.error('❌ Error processing announcement event:', error);
    }
  }

  /**
   * Process stealth registration events
   */
  private async processRegistrationEvent(log: Log, chain: string): Promise<void> {
    try {
      const eventId = `${chain}-${log.transactionHash}-${log.logIndex}`;
      
      // Skip if already processed
      if (this.processedEvents.has(eventId)) {
        return;
      }
      this.processedEvents.add(eventId);

      const stealthEvent: StealthEvent = {
        type: 'registration',
        txHash: log.transactionHash!,
        blockNumber: Number(log.blockNumber),
        timestamp: Math.floor(Date.now() / 1000),
        address: log.topics[1] as string, // registrant address
        chainId: this.getChainId(chain)
      };

      // Check if any monitored users should be notified
      await this.checkAndNotifyUsers(stealthEvent);

    } catch (error) {
      console.error('❌ Error processing registration event:', error);
    }
  }

  /**
   * Efficiently check and notify users with batch processing
   */
  private async checkAndNotifyUsers(event: StealthEvent): Promise<void> {
    const notificationPromises: Promise<void>[] = [];

    for (const [userId, user] of this.monitoredUsers) {
      try {
        // Check if user should be notified about this event
        if (await this.shouldNotifyUser(user, event)) {
          notificationPromises.push(
            this.sendStealthNotification(user, event).then(() => {
              // Update user's last notification time
              user.lastNotified = Date.now();
              return this.updateUserLastNotified(userId, user.lastNotified);
            })
          );
        }
      } catch (error) {
        console.error(`❌ Error checking notification for user ${userId}:`, error);
      }
    }

    // Send all notifications in parallel
    await Promise.allSettled(notificationPromises);
  }

  /**
   * Determine if a user should be notified about a stealth event
   */
  private async shouldNotifyUser(user: MonitoredUser, event: StealthEvent): Promise<boolean> {
    // Check notification preferences
    if (event.type === 'announcement' && !user.enabledNotifications.stealthAnnouncements) {
      return false;
    }
    if (event.type === 'registration' && !user.enabledNotifications.stealthRegistrations) {
      return false;
    }

    // Rate limiting - don't spam users
    const timeSinceLastNotification = Date.now() - user.lastNotified;
    if (timeSinceLastNotification < this.MIN_NOTIFICATION_INTERVAL) {
      return false;
    }

    // Check hourly notification limit
    const notificationCount = await this.getUserNotificationCount(user.userId);
    if (notificationCount >= this.MAX_NOTIFICATIONS_PER_HOUR) {
      return false;
    }

    // For announcements, check if user has relevant scan keys or if event involves their address
    if (event.type === 'announcement') {
      const isRelevant = 
        event.address.toLowerCase() === user.address.toLowerCase() || // User sent stealth payment
        (user.scanKeys && event.stealthAddress && await this.isStealthAddressForUser(event.stealthAddress, user.scanKeys)); // User received stealth payment
      
      return !!isRelevant;
    }

    // For registrations, check if it's the user's registration
    if (event.type === 'registration') {
      return event.address.toLowerCase() === user.address.toLowerCase();
    }

    return false;
  }

  /**
   * Send stealth notification to user
   */
  private async sendStealthNotification(user: MonitoredUser, event: StealthEvent): Promise<void> {
    try {
      let title: string;
      let body: string;
      let emoji: string;

      if (event.type === 'announcement') {
        if (event.address.toLowerCase() === user.address.toLowerCase()) {
          // User sent a stealth payment
          emoji = '📤🥷';
          title = 'Stealth Payment Sent';
          body = `Your stealth payment has been announced onchain`;
        } else {
          // User received a stealth payment
          emoji = '💰🥷';
          title = 'Stealth Payment Received';
          body = `You received a stealth payment. Check your stealth addresses.`;
        }
      } else {
        // Registration event
        emoji = '🔐🥷';
        title = 'Stealth Address Registered';
        body = `A stealth meta-address has been registered`;
      }

      // Send notification via backend notification endpoint
      await fetch(`${process.env.NEXT_PUBLIC_URL}/api/notify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.NOTIFICATION_SECRET}`
        },
        body: JSON.stringify({
          userId: user.userId,
          type: 'stealth',
          title: `${emoji} ${title}`,
          body,
          data: {
            eventType: event.type,
            txHash: event.txHash,
            blockNumber: event.blockNumber,
            chain: this.getChainName(event.chainId),
            stealthAddress: event.stealthAddress,
            timestamp: event.timestamp
          },
          targetUrl: `${process.env.NEXT_PUBLIC_URL}?tab=privacy`
        })
      });

      // Track notification
      await this.trackNotification(user.userId);
      
      console.log(`🔔 Sent stealth notification to ${user.userId}: ${title}`);

    } catch (error) {
      console.error(`❌ Failed to send notification to ${user.userId}:`, error);
    }
  }

  /**
   * Refresh the list of monitored users from database
   */
  private async refreshMonitoredUsers(): Promise<void> {
    try {
      console.log('🔄 Refreshing monitored users list...');
      
      // Get users with stealth notifications enabled from database
      const users = await this.database.getUsersWithStealthNotifications();
      
      this.monitoredUsers.clear();
      
      for (const user of users) {
        const monitoredUser: MonitoredUser = {
          address: user.address,
          userId: user.userId,
          enabledNotifications: {
            stealthPayments: !!(user.notificationPrefs?.stealthPayments ?? true),
            stealthRegistrations: !!(user.notificationPrefs?.stealthRegistrations ?? true),
            stealthAnnouncements: !!(user.notificationPrefs?.stealthAnnouncements ?? true),
          },
          lastNotified: user.lastStealthNotification || 0,
          scanKeys: user.stealthScanKeys || []
        };
        
        this.monitoredUsers.set(user.userId, monitoredUser);
      }
      
      console.log(`👥 Monitoring ${this.monitoredUsers.size} users for stealth transactions`);
      
    } catch (error) {
      console.error('❌ Error refreshing monitored users:', error);
    }
  }

  /**
   * Start user refresh loop
   */
  private startUserRefresh(): void {
    const refreshUsers = async () => {
      if (!this.isRunning) return;
      
      await this.refreshMonitoredUsers();
      
      if (this.isRunning) {
        setTimeout(refreshUsers, this.USER_REFRESH_INTERVAL);
      }
    };
    
    refreshUsers();
  }

  /**
   * Clean up processed events to prevent memory leaks
   */
  private startEventCleanup(): void {
    const cleanup = () => {
      if (!this.isRunning) return;

      if (this.processedEvents.size > this.PROCESSED_EVENTS_LIMIT) {
        console.log(`🧹 Cleaning up processed events (${this.processedEvents.size} -> ${this.PROCESSED_EVENTS_LIMIT / 2})`);
        
        // Keep only the most recent half
        const eventsArray = Array.from(this.processedEvents);
        this.processedEvents.clear();
        
        for (let i = Math.floor(eventsArray.length / 2); i < eventsArray.length; i++) {
          this.processedEvents.add(eventsArray[i]);
        }
      }

      if (this.isRunning) {
        setTimeout(cleanup, 10 * 60 * 1000); // Clean every 10 minutes
      }
    };

    cleanup();
  }

  // Utility methods

  private async loadChainStates(): Promise<void> {
    try {
      for (const [chainName, chainConfig] of this.chains) {
        const data = await this.redis.get(`stealth-monitor:${chainName}:last-block`);
        if (data) {
          chainConfig.lastProcessed = parseInt(data as string);
        }
      }
    } catch (error) {
      console.warn('Could not load chain states:', error);
    }
  }

  private async saveChainState(chain: string, blockNumber: number): Promise<void> {
    try {
      await this.redis.set(
        `stealth-monitor:${chain}:last-block`,
        blockNumber.toString(),
        { ex: 86400 } // 24 hours
      );
    } catch (error) {
      console.error(`Failed to save ${chain} state:`, error);
    }
  }

  private async getUserNotificationCount(userId: string): Promise<number> {
    try {
      const key = `stealth-notifications:${userId}:${Math.floor(Date.now() / 3600000)}`; // hourly bucket
      const count = await this.redis.get(key);
      return count ? parseInt(count as string) : 0;
    } catch (error) {
      return 0;
    }
  }

  private async trackNotification(userId: string): Promise<void> {
    try {
      const key = `stealth-notifications:${userId}:${Math.floor(Date.now() / 3600000)}`;
      await this.redis.incr(key);
      await this.redis.expire(key, 3600); // 1 hour
    } catch (error) {
      console.error('Failed to track notification:', error);
    }
  }

  private async updateUserLastNotified(userId: string, timestamp: number): Promise<void> {
    try {
      await this.database.updateUserLastStealthNotification(userId, timestamp);
    } catch (error) {
      console.error('Failed to update user last notified:', error);
    }
  }

  private async isStealthAddressForUser(stealthAddress: string, scanKeys: string[]): Promise<boolean> {
    // In production, this would use the stealth address SDK to check if the
    // stealth address can be derived from the user's scan keys
    // For now, we'll do a simple check
    return scanKeys.some(key => stealthAddress.includes(key.slice(0, 8)));
  }

  private getChainId(chain: string): number {
    const chainIds: Record<string, number> = {
      'mainnet': 1,
      'base': 8453,
      'sepolia': 11155111,
      'baseSepolia': 84532
    };
    return chainIds[chain] || 1;
  }

  private getChainName(chainId: number): string {
    const chainNames: Record<number, string> = {
      1: 'mainnet',
      8453: 'base',
      11155111: 'sepolia',
      84532: 'baseSepolia'
    };
    return chainNames[chainId] || 'unknown';
  }

  /**
   * Get service status for monitoring
   */
  getStatus() {
    const chainStatuses = Array.from(this.chains.entries()).map(([name, config]) => ({
      name,
      lastProcessed: config.lastProcessed,
      scanInterval: config.scanInterval,
      failureCount: config.failureCount,
      nextScan: config.nextScanTime
    }));

    return {
      isRunning: this.isRunning,
      monitoredUsers: this.monitoredUsers.size,
      processedEvents: this.processedEvents.size,
      chains: chainStatuses
    };
  }
}

// Export singleton instance
export const stealthMonitor = new StealthMonitorService(); 