// Unified XMTP Agent - Enhanced with Multi-threading and Advanced Context Management
import {
  Client,
  Conversation,
  Group,
  type XmtpEnv,
} from "@xmtp/node-sdk";
import { createSigner, getEncryptionKeyFromHex } from "../helper.js";
import OpenAI from 'openai';
import axios, { type AxiosInstance } from 'axios';
import { agentDb, type UserStealthData } from '../lib/agent-database.js';
import { env } from '../config/env.js';
import { validateEnvironment } from "../helper.js";
import { Worker } from 'worker_threads';
import { Redis } from '@upstash/redis';
import { daimoPayClient, getDaimoChainId } from '../lib/daimo-pay.js';
import os from 'os';

interface AgentContactInfo {
  inboxId: string;
  address: string;
  status: 'active' | 'inactive';
}

interface ConversationContext {
  userId: string;
  conversationId: string;
  lastActivity: number;
  messageCount: number;
  setupStatus: 'new' | 'fkey_pending' | 'fkey_set' | 'miniapp_pending' | 'complete';
  preferences: Record<string, any>;
  conversationHistory: Array<{
    timestamp: number;
    type: 'user' | 'agent';
    content: string;
    trigger?: string;
  }>;
}

interface MessageJob {
  messageId: string;
  senderInboxId: string;
  conversationId: string;
  content: string;
  timestamp: number;
  priority: 'high' | 'normal' | 'low';
}

interface WorkerTask {
  id: string;
  type: 'ai_processing' | 'stealth_scan' | 'fkey_lookup' | 'content_generation';
  data: any;
  priority: number;
}

// Environment validation with proper typing
const envVars = validateEnvironment(["WALLET_KEY", "ENCRYPTION_KEY", "XMTP_ENV", "OPENAI_API_KEY"]);
const WALLET_KEY = envVars.WALLET_KEY!;
const ENCRYPTION_KEY = envVars.ENCRYPTION_KEY!;
const XMTP_ENV = envVars.XMTP_ENV!;
const OPENAI_API_KEY = envVars.OPENAI_API_KEY;

// Initialize OpenAI client
let openai: OpenAI | null = null;
if (OPENAI_API_KEY) {
  try {
    openai = new OpenAI({
      apiKey: OPENAI_API_KEY,
    });
    console.log("✅ OpenAI client initialized");
  } catch (error) {
    console.error("❌ Failed to initialize OpenAI:", error);
  }
} else {
  console.warn("⚠️ OpenAI API key not provided, AI features disabled");
}

// Enhanced API Client for all app integrations
class UnifiedApiClient {
  private client: AxiosInstance;

  constructor(frontendURL: string, jwtSecret?: string) {
    this.client = axios.create({
      baseURL: frontendURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Enhanced-Backend-Agent/2.0',
        ...(jwtSecret && { 'Authorization': `Bearer ${jwtSecret}` })
      }
    });
  }

  // X402 Content Management
  async createX402Content(params: any) {
    try {
      const response = await this.client.post('/api/x402/generate', params);
      return { success: true, ...response.data };
    } catch (error) {
      // Return success with mock data since this endpoint doesn't exist yet
      return { 
        success: true, 
        contentId: 'mock-' + Date.now(),
        message: 'Content creation simulated (endpoint not implemented)' 
      };
    }
  }

  // dStealth Operations
  async lookupFkey(fkeyId: string) {
    try {
      // Extract username from fkey.id (e.g., "tantodefi.fkey.id" -> "tantodefi")
      let username = fkeyId.replace('.fkey.id', '');
      
      // 🔧 FIX: Normalize username to lowercase for fkey.id lookup
      username = username.toLowerCase();
      
      const response = await this.client.get(`/api/fkey/lookup/${username}`);
      return { success: true, ...response.data };
    } catch (error) {
      console.error('Fkey lookup error:', error);
      return { success: false, error: 'Fkey lookup failed' };
    }
  }

  async scanStealthAddress(address: string) {
    try {
      const response = await this.client.get(`/api/stealth/scan/${address}`);
      return { success: true, ...response.data };
    } catch (error) {
      // For now, return mock data since this endpoint doesn't exist yet
      return { 
        success: true, 
        transactions: [], 
        balance: '0.00',
        privacyScore: 'Not analyzed'
      };
    }
  }

  async getProxy402Links(userAddress?: string) {
    try {
      const endpoint = userAddress ? `/api/proxy402/links?owner=${userAddress}` : '/api/proxy402/links';
      const response = await this.client.get(endpoint);
      return { success: true, ...response.data };
    } catch (error) {
      // Return empty list since this endpoint doesn't exist yet
      return { success: true, links: [] };
    }
  }

  async getBalance(address: string) {
    try {
      const response = await this.client.get(`/api/balance/${address}`);
      return response.data;
    } catch (error) {
      // Return mock balance data since this endpoint doesn't exist yet
      return { usdc: '0.00', eth: '0.00' };
    }
  }
}

// Enhanced Context Manager with conversation memory
class ConversationContextManager {
  private contexts: Map<string, ConversationContext> = new Map();
  private redis: Redis | null = null;
  private readonly CONTEXT_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours
  private readonly MAX_HISTORY_LENGTH = 50;

  constructor() {
    // Initialize Redis for context persistence if available
    if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
      this.redis = new Redis({
        url: env.UPSTASH_REDIS_REST_URL,
        token: env.UPSTASH_REDIS_REST_TOKEN,
      });
    }
  }

  async getContext(userId: string, conversationId: string): Promise<ConversationContext> {
    const contextKey = `${userId}-${conversationId}`;
    
    // Check in-memory cache first
    if (this.contexts.has(contextKey)) {
      const context = this.contexts.get(contextKey)!;
      context.lastActivity = Date.now();
      return context;
    }

    // Try to load from Redis
    if (this.redis) {
      try {
        const stored = await this.redis.get(`context:${contextKey}`);
        if (stored) {
          const context = typeof stored === 'string' ? JSON.parse(stored) : stored as ConversationContext;
          this.contexts.set(contextKey, context);
          context.lastActivity = Date.now();
          return context;
        }
      } catch (error) {
        console.warn('Failed to load context from Redis:', error);
      }
    }

    // Create new context
    const newContext: ConversationContext = {
      userId,
      conversationId,
      lastActivity: Date.now(),
      messageCount: 0,
      setupStatus: 'new',
      preferences: {},
      conversationHistory: []
    };

    this.contexts.set(contextKey, newContext);
    return newContext;
  }

  async updateContext(context: ConversationContext): Promise<void> {
    const contextKey = `${context.userId}-${context.conversationId}`;
    context.lastActivity = Date.now();
    
    // Trim history if too long
    if (context.conversationHistory.length > this.MAX_HISTORY_LENGTH) {
      context.conversationHistory = context.conversationHistory.slice(-this.MAX_HISTORY_LENGTH);
    }

    // Update in-memory cache
    this.contexts.set(contextKey, context);

    // Persist to Redis if available
    if (this.redis) {
      try {
        await this.redis.set(`context:${contextKey}`, JSON.stringify(context), { ex: 86400 });
      } catch (error) {
        console.warn('Failed to persist context to Redis:', error);
      }
    }
  }

  addToHistory(context: ConversationContext, type: 'user' | 'agent', content: string, trigger?: string | null): void {
    this.contexts.get(context.userId + '-' + context.conversationId)!.conversationHistory.push({
      timestamp: Date.now(),
      type,
      content: content.substring(0, 200), // Truncate long messages
      trigger: trigger || undefined
    });
    this.contexts.get(context.userId + '-' + context.conversationId)!.messageCount++;
  }

  // Clean up old contexts
  cleanupOldContexts(): void {
    const now = Date.now();
    for (const [key, context] of this.contexts.entries()) {
      if (now - context.lastActivity > this.CONTEXT_EXPIRY) {
        this.contexts.delete(key);
      }
    }
  }
}

// Worker Pool Manager for CPU-intensive tasks
class WorkerPoolManager {
  private workers: Worker[] = [];
  private taskQueue: WorkerTask[] = [];
  private busyWorkers: Set<number> = new Set();
  private readonly MAX_WORKERS = 4;

  constructor() {
    // Initialize worker pool on startup
    this.initializeWorkers();
  }

  private initializeWorkers(): void {
    // Temporarily disable worker threads to avoid complexity
    // The agent will use direct processing instead
    console.log(`🔧 Worker pool initialized (direct processing mode)`);
  }

  private createWorker(id: number): void {
    try {
      // Create a simple worker script inline for AI and scanning tasks
      const workerScript = `
        import { parentPort, workerData } from 'worker_threads';
        
        parentPort.on('message', async (task) => {
          try {
            let result;
            
            switch (task.type) {
              case 'ai_processing':
                // Simulated AI processing (replace with actual OpenAI calls)
                result = await processAITask(task.data);
                break;
              case 'stealth_scan':
                // Simulated stealth scanning (replace with actual scanning)
                result = await processStealthScan(task.data);
                break;
              case 'fkey_lookup':
                // Simulated fkey lookup (replace with actual API calls)
                result = await processFkeyLookup(task.data);
                break;
              default:
                result = { success: false, error: 'Unknown task type' };
            }
            
            parentPort.postMessage({ taskId: task.id, result, success: true });
          } catch (error) {
            parentPort.postMessage({ 
              taskId: task.id, 
              error: error.message, 
              success: false 
            });
          }
        });

        async function processAITask(data) {
          // Simulate AI processing time
          await new Promise(resolve => setTimeout(resolve, 1000));
          return { response: "AI processed: " + data.prompt };
        }

        async function processStealthScan(data) {
          // Simulate scanning time
          await new Promise(resolve => setTimeout(resolve, 2000));
          return { 
            address: data.address, 
            transactions: [], 
            privacyScore: Math.floor(Math.random() * 100) 
          };
        }

        async function processFkeyLookup(data) {
          // Simulate lookup time
          await new Promise(resolve => setTimeout(resolve, 500));
          return { 
            fkeyId: data.fkeyId, 
            address: "0x" + Math.random().toString(16).substring(2, 42),
            isRegistered: true 
          };
        }
      `;

      // For now, we'll skip actual worker creation to avoid complexity
      // This is a placeholder for the worker architecture
      console.log(`🔧 Worker ${id} initialized (simulated)`);
      
    } catch (error) {
      console.warn(`Failed to create worker ${id}:`, error);
    }
  }

  async executeTask(task: WorkerTask): Promise<any> {
    // For now, execute tasks directly without workers to maintain functionality
    // In production, this would delegate to worker threads
    
    try {
      switch (task.type) {
        case 'ai_processing':
          return await this.processAITaskDirect(task.data);
        case 'stealth_scan':
          return await this.processStealthScanDirect(task.data);
        case 'fkey_lookup':
          return await this.processFkeyLookupDirect(task.data);
        default:
          return { success: false, error: 'Unknown task type' };
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async processAITaskDirect(data: any): Promise<any> {
    // Direct AI processing (fallback)
    return { response: `AI processed: ${data.prompt}`, success: true };
  }

  private async processStealthScanDirect(data: any): Promise<any> {
    // Direct stealth scanning (fallback)
    return { 
      address: data.address, 
      transactions: [], 
      privacyScore: 'Analysis pending',
      success: true 
    };
  }

  private async processFkeyLookupDirect(data: any): Promise<any> {
    // Direct fkey lookup (fallback)
    return { 
      fkeyId: data.fkeyId, 
      address: data.address || "0x" + Math.random().toString(16).substring(2, 42),
      isRegistered: true,
      success: true 
    };
  }

  shutdown(): void {
    for (const worker of this.workers) {
      try {
        worker.terminate();
      } catch (error) {
        console.warn('Error terminating worker:', error);
      }
    }
    this.workers = [];
    console.log('🔧 Worker pool shut down');
  }
}

// Message Queue Manager for high-volume processing
class MessageQueueManager {
  private messageQueue: any = null;
  private processingQueue: any = null;

  constructor() {
    // Initialize queues if Redis is available
    this.initializeQueues();
  }

  private initializeQueues(): void {
    try {
      if (env.UPSTASH_REDIS_REST_URL) {
        // For now, we'll use simple in-memory queues to avoid Redis complexity
        // In production, these would be proper Redis-backed Bull queues
        console.log('📬 Message queues initialized (in-memory mode)');
      }
    } catch (error) {
      console.warn('Failed to initialize message queues:', error);
    }
  }

  async addMessage(job: MessageJob): Promise<void> {
    // For now, process messages directly to maintain existing functionality
    // In production, this would add to a Redis queue
    console.log(`📨 Processing message from ${job.senderInboxId}`);
  }

  async addProcessingJob(type: string, data: any, priority: number = 0): Promise<void> {
    // For now, process jobs directly
    // In production, this would add to a processing queue
    console.log(`⚙️ Processing job: ${type}`);
  }

  shutdown(): void {
    console.log('📬 Message queues shut down');
  }
}

export class DStealthAgent {
  private client: Client | null = null;
  private openai: OpenAI | null = null;
  private isRunning = false;
  private apiClient: UnifiedApiClient;
  private agentAddress: string | null = null;
  private contextManager: ConversationContextManager;
  private workerPool: WorkerPoolManager;
  private messageQueue: MessageQueueManager;
  private readonly adminAddress = '0x7c40611372d354799d138542e77243c284e460b2';
  private contacts: Map<string, AgentContactInfo> = new Map();
  private isShuttingDown = false;
  
  // 🔥 NEW: Message deduplication to prevent infinite loops
  private processedMessages: Set<string> = new Set();
  private readonly MAX_PROCESSED_MESSAGES = 1000; // Keep last 1000 message IDs
  
  // 🔧 NEW: Health monitoring
  private lastHealthCheck = Date.now();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private autoRestartEnabled = true;
  private restartAttempts = 0;
  private readonly maxRestartAttempts = 3;

  // Enhanced trigger patterns with better categorization
  private readonly triggerPatterns = {
    // Payment triggers - high priority
    payment: [
      /create.*payment.*link.*for.*\$(\d+(?:\.\d{2})?)/i,
      /\$(\d+(?:\.\d{2})?).*payment.*link/i,
      /generate.*link.*\$(\d+(?:\.\d{2})?)/i,
      /make.*payment.*\$(\d+(?:\.\d{2})?)/i
    ],
    
    // Setup and onboarding triggers
    setup: [
      /no fkey|don't have.*fkey|need.*fkey/i,
      /setup complete|finished.*setup|completed.*miniapp/i,
      /set.*fkey|update.*fkey/i
    ],
    
    // Command triggers
    commands: [
      /^\/\w+/,
      /help|commands|what.*can.*do/i,
      /balance|earnings|stats/i,
      /links|payments|history/i
    ],
    
    // Stealth and privacy triggers
    stealth: [
      /stealth.*address|privacy.*payment/i,
      /scan.*address|check.*privacy/i,
      /anonymous.*payment|private.*transaction/i
    ],
    
    // FluidKey specific triggers
    fluidkey: [
      /\.fkey\.id$/,
      /fluidkey|fluid.*key/i,
      /register.*fkey|create.*fkey/i
    ],
    
    // Conversation triggers
    greetings: [
      /^(hi|hello|hey|sup|yo)\b/i,
      /good\s+(morning|afternoon|evening)/i,
      /what.*up|how.*going/i
    ]
  };

  constructor() {
    this.contextManager = new ConversationContextManager();
    this.workerPool = new WorkerPoolManager();
    this.messageQueue = new MessageQueueManager();
    
    const frontendURL = env.FRONTEND_URL || process.env.NEXT_PUBLIC_URL || 'https://dstealth.xyz';
    this.apiClient = new UnifiedApiClient(frontendURL);
    
    console.log('🚀 dStealth Agent initialized');
  }

  async initialize(retryCount = 0, maxRetries = 5): Promise<void> {
    try {
      console.log(`🚀 Initializing dStealth Agent (attempt ${retryCount + 1}/${maxRetries + 1})...`);
      
      if (!env.WALLET_KEY || !env.ENCRYPTION_KEY) {
        throw new Error('Missing required environment variables: WALLET_KEY or ENCRYPTION_KEY');
      }
      
      console.log('📱 Creating XMTP client...');
      
      // 🔧 Enhanced: Database path with error recovery
      let dbPath;
      try {
        if (process.env.RENDER) {
          // 🔥 FORCE FRESH DATABASE: Add timestamp to avoid encryption key mismatches
          const dbTimestamp = Date.now();
          dbPath = `/data/xmtp/production-xmtp-${dbTimestamp}.db3`;
          console.log(`🔄 Using fresh production database: ${dbPath}`);
        } else if (process.env.VERCEL) {
          dbPath = `/tmp/xmtp-${env.XMTP_ENV}.db3`;
        } else {
          dbPath = `.data/xmtp/${env.XMTP_ENV}-xmtp.db3`;
        }
        
        console.log(`📁 Database path: ${dbPath}`);
        console.log(`🌍 Environment: ${env.XMTP_ENV}`);
      } catch (pathError) {
        console.warn('⚠️ Database path setup failed, using fallback:', pathError);
        dbPath = `.data/xmtp/fallback-xmtp.db3`;
      }

      const signer = createSigner(env.WALLET_KEY);
      const encryptionKey = getEncryptionKeyFromHex(env.ENCRYPTION_KEY);

      // 🔧 Enhanced: XMTP client creation with database recovery
      let clientCreated = false;
      let clientError: any = null;
      
      for (let dbAttempt = 0; dbAttempt < 3; dbAttempt++) {
        try {
          console.log(`🔄 Database initialization attempt ${dbAttempt + 1}/3...`);
          
          const currentDbPath = dbAttempt === 0 ? dbPath : `${dbPath}.recovery${dbAttempt}`;
          console.log(`📁 Attempting database path: ${currentDbPath}`);
          
      this.client = await Client.create(signer, {
        dbEncryptionKey: encryptionKey,
            env: env.XMTP_ENV as XmtpEnv,
            dbPath: currentDbPath,
          });
          
          console.log('✅ XMTP client created successfully');
          clientCreated = true;
          break;
          
        } catch (dbCreateError: any) {
          clientError = dbCreateError;
          console.error(`❌ Database attempt ${dbAttempt + 1} failed:`, dbCreateError.message);
          
          // 🔧 Enhanced: Handle specific database encryption errors
          if (dbCreateError.message?.includes('PRAGMA key') || 
              dbCreateError.message?.includes('sqlcipher') ||
              dbCreateError.message?.includes('encryption') ||
              dbCreateError.message?.includes('hmac check failed')) {
            
            console.log(`🔄 Database encryption failed, attempting recovery...`);
            
            if (dbAttempt === 0) {
              // First attempt failed - try to backup and create fresh database
              console.log('🔄 First attempt failed - backing up existing database...');
              try {
                const fs = await import('fs');
                const path = await import('path');
                
                if (fs.existsSync(dbPath)) {
                  const backupPath = `${dbPath}.backup.${Date.now()}`;
                  fs.copyFileSync(dbPath, backupPath);
                  console.log(`💾 Database backed up to: ${backupPath}`);
                  
                  // Remove original corrupted database
                  fs.unlinkSync(dbPath);
                  console.log('🗑️ Removed corrupted database');
                  
                  // Try to create the directory if it doesn't exist
                  const dbDir = path.dirname(dbPath);
                  if (!fs.existsSync(dbDir)) {
                    fs.mkdirSync(dbDir, { recursive: true });
                    console.log(`📁 Created database directory: ${dbDir}`);
                  }
                }
              } catch (backupError) {
                console.warn('⚠️ Could not backup/remove corrupted database:', backupError);
              }
            } else if (dbAttempt === 1) {
              // Second attempt - try with a completely different path
              console.log('🔄 Second attempt - trying with temporary database path...');
              try {
                const fs = await import('fs');
                const tempDbPath = `/tmp/xmtp-recovery-${Date.now()}.db3`;
                console.log(`📁 Using temporary database: ${tempDbPath}`);
                
                // Ensure temp directory exists
                const tempDir = '/tmp';
                if (!fs.existsSync(tempDir)) {
                  fs.mkdirSync(tempDir, { recursive: true });
                }
              } catch (tempError) {
                console.warn('⚠️ Could not set up temporary database:', tempError);
              }
            }
            
            // Add a small delay before retry
            await new Promise(resolve => setTimeout(resolve, 1000));
            
          } else {
            // For non-encryption errors, don't retry
            console.error('❌ Non-encryption database error, not retrying');
            break;
          }
        }
      }

      if (!clientCreated || !this.client) {
        // 🔧 Enhanced: Try one final attempt with in-memory database
        console.log('🔄 Final attempt with in-memory database...');
        try {
          this.client = await Client.create(signer, {
            dbEncryptionKey: encryptionKey,
            env: env.XMTP_ENV as XmtpEnv,
            // Don't specify dbPath - let it use default/in-memory
          });
          
          console.log('✅ XMTP client created with in-memory database');
          clientCreated = true;
          
        } catch (finalError: any) {
          console.error('❌ Final database attempt failed:', finalError.message);
          throw new Error(`Failed to create XMTP client after all attempts: ${clientError?.message || finalError?.message || 'Unknown error'}`);
        }
      }

      if (!clientCreated || !this.client) {
        throw new Error(`Failed to create XMTP client after all recovery attempts: ${clientError?.message || 'Unknown error'}`);
      }

      const identifier = signer.getIdentifier();
      this.agentAddress = typeof identifier === 'object' && 'identifier' in identifier 
        ? identifier.identifier 
        : (await identifier).identifier;
      console.log(`📧 Agent Address: ${this.agentAddress}`);
      console.log(`🆔 Agent Inbox ID: ${this.client.inboxId}`);
      console.log(`🌍 Environment: ${env.XMTP_ENV}`);

      // 🔧 Enhanced: Start listening with robust error handling
      try {
      await this.startListening();

        // 🔧 NEW: Start health monitoring
        this.startHealthMonitoring();
        
        this.isRunning = true;
        console.log('✅ dStealth Agent is now listening for messages');
        
      } catch (listeningError: any) {
        console.error('❌ Initialization failed (attempt ' + (retryCount + 1) + '):', listeningError);
        
        // 🔧 Enhanced: Specific error handling for different types of failures
        if (listeningError.message?.includes('group with welcome id') && retryCount < maxRetries) {
          const retryDelay = Math.min(2 ** retryCount * 2000, 120000); // Exponential backoff, max 2 minutes
          console.log(`⏳ Retrying in ${retryDelay / 1000}s...`);
          console.log(`⏳ Waiting ${retryDelay / 1000}s before retry to avoid rate limits...`);
          
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        return this.initialize(retryCount + 1, maxRetries);
        } else {
          throw listeningError;
        }
      }

    } catch (error: any) {
      console.error('❌ Agent initialization failed:', error);
      
      if (retryCount < maxRetries) {
        const retryDelay = Math.min(2 ** retryCount * 1000, 60000); // Exponential backoff, max 1 minute
        console.log(`⏳ Retrying initialization in ${retryDelay / 1000}s... (attempt ${retryCount + 2}/${maxRetries + 1})`);
        
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return this.initialize(retryCount + 1, maxRetries);
      } else {
        console.error(`❌ Failed to initialize dStealth Agent: ${error.message}`);
        // 🔧 Don't throw - let the server continue running
        this.isRunning = false;
      }
    }
    
    console.log('✅ dStealth Agent initialization completed');
  }

  // 🔧 NEW: Health monitoring system
  private startHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    console.log('🔧 Starting agent health monitoring...');
    
    this.healthCheckInterval = setInterval(async () => {
      try {
        const now = Date.now();
        const timeSinceLastHealth = now - this.lastHealthCheck;
        
        // Update health check timestamp
        this.lastHealthCheck = now;
        
        // Check if client is still connected
        if (!this.client || !this.isRunning) {
          console.log('⚠️ Agent health check: Client not connected or not running');
          
          if (this.autoRestartEnabled && this.restartAttempts < this.maxRestartAttempts) {
            console.log(`🔄 Attempting automatic restart (${this.restartAttempts + 1}/${this.maxRestartAttempts})...`);
            this.restartAttempts++;
            
            try {
              await this.restart();
              console.log('✅ Agent automatically restarted successfully');
              this.restartAttempts = 0; // Reset on successful restart
            } catch (restartError) {
              console.error('❌ Automatic restart failed:', restartError);
              
              if (this.restartAttempts >= this.maxRestartAttempts) {
                console.error('🚨 Maximum restart attempts reached - disabling auto-restart');
                this.autoRestartEnabled = false;
              }
            }
          }
          return;
        }
        
        // Try to ping the client
        try {
      await this.client.conversations.sync();
          console.log('💓 Agent health check: OK');
        } catch (syncError) {
          console.warn('⚠️ Agent health check: Sync failed', syncError);
        }
        
      } catch (healthError) {
        console.error('❌ Health check error:', healthError);
      }
    }, 5 * 60 * 1000); // Check every 5 minutes
  }

  // 🔧 NEW: Restart the agent
  private async restart(): Promise<void> {
    console.log('🔄 Restarting dStealth Agent...');
    
    try {
      // Stop current instance
      await this.stop();
      
      // Wait a bit before restarting
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Restart
      await this.initialize();
      
    } catch (error) {
      console.error('❌ Agent restart failed:', error);
      throw error;
    }
  }

  // 🔧 NEW: Stop the agent gracefully
  private async stop(): Promise<void> {
    console.log('🛑 Stopping dStealth Agent...');
    
    this.isShuttingDown = true;
    this.isRunning = false;
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    if (this.client) {
      try {
        // The client will be recreated on restart
        this.client = null;
              } catch (error) {
        console.warn('⚠️ Error during client cleanup:', error);
      }
    }
    
    console.log('✅ Agent stopped');
  }

  private async startListening(): Promise<void> {
    try {
      console.log('🎧 Starting XMTP message listener...');
      console.log(`🔍 Agent inbox ID: ${this.client?.inboxId}`);
      console.log(`🌍 XMTP Environment: ${env.XMTP_ENV}`);

    if (!this.client) {
        throw new Error('XMTP client not initialized');
      }

      // 🔄 Enhanced: Initial conversation sync with retry logic
      console.log('🔄 Initial conversation sync...');
      let conversationSyncAttempts = 0;
      const maxSyncAttempts = 3;
      
      while (conversationSyncAttempts < maxSyncAttempts) {
        try {
      await this.client.conversations.sync();
          break;
        } catch (syncError) {
          conversationSyncAttempts++;
          console.warn(`⚠️ Conversation sync attempt ${conversationSyncAttempts} failed:`, syncError);
          if (conversationSyncAttempts >= maxSyncAttempts) {
            console.error('❌ All conversation sync attempts failed, continuing with existing conversations');
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 2000 * conversationSyncAttempts));
        }
      }

      const conversations = await this.client.conversations.list();
      console.log(`📋 Agent has ${conversations.length} conversations`);
      
      // 🔄 Enhanced: Sync individual conversations with error handling
      const finalConversations = [];
      for (const conversation of conversations) {
        try {
          console.log(`🔄 Synced conversation: ${conversation.id}`);
          await conversation.sync();
          finalConversations.push(conversation);
        } catch (convError) {
          console.warn(`⚠️ Failed to sync conversation ${conversation.id}:`, convError);
          // 🔧 Continue with other conversations even if one fails
          finalConversations.push(conversation);
        }
      }

      // 🌊 Enhanced: Start message stream with comprehensive error handling
      console.log('🌊 Starting message stream...');
      let stream;
      try {
        stream = await this.client.conversations.streamAllMessages();
      console.log('✅ Message stream created, listening for messages...');
      } catch (streamError) {
        console.error('❌ Failed to create message stream:', streamError);
        throw streamError;
      }

      // 🔄 Enhanced: Final sync with error recovery
      console.log('🔄 Final sync before message processing...');
      try {
        await this.client.conversations.sync();
        const syncedConversations = await this.client.conversations.list();
        console.log(`📋 Final conversation count: ${syncedConversations.length}`);
      } catch (finalSyncError) {
        console.warn('⚠️ Final sync failed, using existing conversations:', finalSyncError);
      }

      // 🔥 CRITICAL FIX: Do NOT process existing messages during startup
      console.log('🔍 Processing existing messages from all conversations...');
      console.log('📋 Known conversation IDs:', finalConversations.map(c => c.id));
      
      // 🚨 REMOVED: Historical message processing
      // The agent should ONLY process NEW messages after startup
      // Processing existing messages causes responses to old messages
      console.log('⏭️ SKIPPING existing message processing to prevent duplicate responses');
      console.log('📝 Historical messages will be ignored - only NEW messages will be processed');
      
      // Instead, just mark existing messages as processed to prevent future processing
      for (const conversation of finalConversations) {
        try {
          const messages = await conversation.messages();
          console.log(`📬 Conversation ${conversation.id}: ${messages.length} messages (not processing historical)`);
          
          // 🔥 OPTIONAL: Mark all existing messages as processed to prevent future processing
          messages.forEach(message => {
            if (message.id && message.senderInboxId !== this.client?.inboxId) {
              this.processedMessages.add(message.id);
            }
          });
        } catch (messageError) {
          console.warn(`⚠️ Failed to get messages for conversation ${conversation.id}:`, messageError);
          // Continue with other conversations
        }
      }

      console.log(`✅ Synced ${finalConversations.length} conversations without processing historical messages`);

      // 🔍 Force re-sync to catch any missed conversations
      console.log('🔍 Force re-sync to catch any missed conversations...');
      try {
      await this.client.conversations.sync();
      const resynced = await this.client.conversations.list();
      
      if (resynced.length > finalConversations.length) {
        console.log(`🆕 Found ${resynced.length - finalConversations.length} additional conversations on re-sync!`);
        
          // Only sync new conversations without processing their existing messages
        for (let i = finalConversations.length; i < resynced.length; i++) {
          const newConversation = resynced[i];
          try {
            await newConversation.sync();
            const messages = await newConversation.messages();
              
              // Mark all existing messages as processed
              messages.forEach(message => {
                if (message.id && message.senderInboxId !== this.client?.inboxId) {
                  this.processedMessages.add(message.id);
                }
              });
            } catch (newConvError) {
              console.warn(`⚠️ Failed to sync new conversation ${newConversation.id}:`, newConvError);
            }
          }
        }
      } catch (resyncError) {
        console.warn('⚠️ Re-sync failed:', resyncError);
      }

      console.log(`✅ Final total: synced ${(await this.client.conversations.list()).length} conversations (${this.processedMessages.size} historical messages marked as processed)`);

      // 🎧 Enhanced: Start HYBRID message stream for NEW messages with robust error handling
      console.log('🎧 Starting HYBRID message stream for NEW messages...');
      
      // Set up periodic conversation sync to catch new conversations
      const syncInterval = setInterval(async () => {
        try {
          console.log('🔄 Periodic conversation sync...');
          await this.client?.conversations.sync();
          const currentConversations = await this.client?.conversations.list();
          console.log(`📋 Current conversation count: ${currentConversations?.length || 0}`);
          console.log(`🔍 Current conversation IDs (first 3): ${currentConversations?.slice(0, 3).map(c => c.id).join(', ') || 'none'}`);
        } catch (syncIntervalError) {
          console.warn('⚠️ Periodic sync failed:', syncIntervalError);
        }
      }, 30000); // Every 30 seconds

      // 🔧 Enhanced: Process messages with comprehensive error handling
      let messageCount = 0;
      let lastMessageTime = Date.now();
      
      // Track if we've received any new messages
      const startTime = Date.now();
      let hasReceivedNewMessages = false;
      
      // 🔧 Enhanced: Process message stream with improved error handling
      const processMessageStream = async () => {
        let consecutiveErrors = 0;
        const maxConsecutiveErrors = 5;
        let lastSuccessfulMessage = Date.now();
        const staleStreamTimeout = 10 * 60 * 1000; // 10 minutes
        
        // Set up stream health monitoring
        const streamHealthCheck = setInterval(async () => {
          const timeSinceLastMessage = Date.now() - lastSuccessfulMessage;
          
          if (timeSinceLastMessage > staleStreamTimeout && !this.isShuttingDown) {
            console.log('🚨 Stream appears completely stalled - forcing restart');
            clearInterval(streamHealthCheck);
            
            try {
              if (stream && typeof stream.return === 'function') {
                stream.return(undefined);
              }
            } catch (cleanupError) {
              console.warn('⚠️ Stream cleanup warning:', cleanupError);
            }
            
            // Restart the entire listening process
            setTimeout(() => {
              if (!this.isShuttingDown) {
                console.log('🔄 Restarting message stream due to staleness...');
                this.startListening().catch(restartError => {
                  console.error('❌ Failed to restart stalled stream:', restartError);
                });
              }
            }, 5000);
            return;
          }
        }, 60000); // Check every minute
        
        try {
          for await (const message of stream) {
            try {
              messageCount++;
              lastMessageTime = Date.now();
              lastSuccessfulMessage = Date.now(); // Update successful message time
              hasReceivedNewMessages = true;
              consecutiveErrors = 0; // Reset error counter on successful message
              
              console.log(`\n🔔 NEW MESSAGE STREAM EVENT #${messageCount}:`);
          console.log('📨 RAW STREAM MESSAGE:', {
            hasMessage: !!message,
            content: message?.content || 'no-content',
            senderInboxId: message?.senderInboxId || 'no-sender',
                agentInboxId: this.client?.inboxId || 'no-agent-id',
            contentType: message?.contentType?.typeId || 'no-type',
                conversationId: message?.conversationId || 'no-conversation-id',
                messageId: message?.id || 'no-message-id',
            sentAt: message?.sentAt || 'no-timestamp'
          });

              // Enhanced message validation
              if (!message || !message.content || !message.senderInboxId || !message.conversationId) {
                console.log('⚠️ Invalid message structure, skipping...');
            continue;
          }

              // Content type validation
              if (message.contentType?.typeId !== 'text') {
                console.log('⚠️ Non-text message type, skipping...');
                continue;
              }

          console.log('📧 VALID MESSAGE DETAILS:', {
                content: JSON.stringify(message.content),
                contentLength: (message.content as string).length,
            contentType: typeof message.content,
            senderInboxId: message.senderInboxId,
                agentInboxId: this.client?.inboxId || 'no-agent-id',
                isOwnMessage: message.senderInboxId.toLowerCase() === (this.client?.inboxId || '').toLowerCase(),
            messageContentType: message.contentType?.typeId,
            conversationId: message.conversationId
          });

              // Skip own messages
              if (message.senderInboxId.toLowerCase() === (this.client?.inboxId || '').toLowerCase()) {
            console.log('⏭️ Skipping own message');
            continue;
          }

              // 🔧 NEW: Skip if message already processed
              if (message.id && this.processedMessages.has(message.id)) {
                console.log('⏭️ Skipping already processed message');
            continue;
          }

          console.log(`🚀 PROCESSING NEW MESSAGE from ${message.senderInboxId}: "${message.content}"`);
          
              // Add to processed messages
              if (message.id) {
          this.processedMessages.add(message.id);
          
          // Keep processed messages list manageable
          if (this.processedMessages.size > this.MAX_PROCESSED_MESSAGES) {
            const firstItem = this.processedMessages.values().next().value;
                  if (firstItem) {
            this.processedMessages.delete(firstItem);
          }
                }
              }

              // Process the message
              await this.processIncomingMessage(message);
              
            } catch (messageProcessError: any) {
              consecutiveErrors++;
              console.error(`❌ Error processing individual message (${consecutiveErrors}/${maxConsecutiveErrors}):`, messageProcessError);
              
              // 🔧 Enhanced: Handle specific error types without crashing
              if (messageProcessError.message?.includes('group with welcome id')) {
                console.warn('⚠️ Group welcome message error - this is usually temporary and will resolve');
                // Don't count group welcome errors toward consecutive error limit
                consecutiveErrors--;
                continue;
              }
              
              if (messageProcessError.message?.includes('sqlcipher') || 
                  messageProcessError.message?.includes('encryption')) {
                console.warn('⚠️ Database encryption error during message processing - continuing with stream');
                continue;
              }
              
              // Check if we've hit too many consecutive errors
              if (consecutiveErrors >= maxConsecutiveErrors) {
                console.error(`🚨 Too many consecutive message processing errors (${consecutiveErrors}), restarting stream...`);
                throw new Error(`Consecutive message processing failures: ${messageProcessError.message}`);
              }
              
              // Continue processing other messages for other errors too
              continue;
            }
          }
        } catch (streamProcessError: any) {
          clearInterval(streamHealthCheck); // Clean up health check
          console.error('❌ Message stream processing error:', streamProcessError);
          
          // 🔧 Enhanced: Specific handling for different stream errors
          if (streamProcessError.message?.includes('group with welcome id')) {
            console.log('🔄 Group welcome message stream error detected - this is often temporary');
            console.log('🔄 Continuing with existing stream, error should resolve automatically');
            return; // Don't restart for group welcome errors
          }
          
          if (streamProcessError.message?.includes('sqlcipher') || 
              streamProcessError.message?.includes('encryption')) {
            console.log('🔄 Database encryption stream error - attempting to continue');
            return; // Don't restart for DB encryption errors during normal operation
          }
          
          // 🔧 Enhanced: Only restart stream for severe errors
          if (!this.isShuttingDown) {
            console.log('🔄 Attempting to recover message stream...');
            setTimeout(() => {
              if (!this.isShuttingDown) {
                this.startListening().catch(restartError => {
                  console.error('❌ Failed to restart message listener:', restartError);
                });
              }
            }, 5000);
          }
        }
      };

      // Start processing messages
      processMessageStream();
      
      // 🔧 Enhanced: Monitor for activity and provide feedback
      const activityMonitor = setInterval(() => {
        const timeSinceStart = Date.now() - startTime;
        const timeSinceLastMessage = Date.now() - lastMessageTime;
        
        if (!hasReceivedNewMessages && timeSinceStart > 60000) {
          console.log('⚠️ No NEW messages received in first 60 seconds - stream is working but no new messages sent');
          hasReceivedNewMessages = true; // Prevent spam
        }
        
        if (timeSinceLastMessage > 300000) { // 5 minutes
          console.log('⚠️ No messages received in 5 minutes - stream may be stalled');
        }
      }, 60000);

      // Cleanup on shutdown
      if (this.isShuttingDown) {
        clearInterval(syncInterval);
        clearInterval(activityMonitor);
      }

    } catch (error) {
      console.error('❌ Message listener error:', error);
      throw error;
    }
  }

  // 🔥 NEW: Enhanced message processing with group/DM awareness
  private async processIncomingMessage(message: any): Promise<void> {
    try {
      const messageContent = message.content;
      const senderInboxId = message.senderInboxId;
      
      if (typeof messageContent !== 'string') {
        console.warn('⚠️ Message content is not a string, skipping processing');
        return;
      }
      const conversationId = message.conversationId;

      // 🔥 NEW: Detect conversation type (Group vs DM)
      const conversation = await this.client!.conversations.getConversationById(conversationId);
      if (!conversation) {
        console.error(`❌ Could not find conversation: ${conversationId}`);
        return;
      }

      const isGroupChat = conversation instanceof Group;
      const isDirectMention = this.isDirectMention(messageContent);
      const isInvocationCommand = this.isInvocationCommand(messageContent);

      console.log(`🔄 Processing message: "${messageContent}" from ${senderInboxId}`);
      console.log(`📍 Context: ${isGroupChat ? 'GROUP' : 'DM'} chat`);

      // 🔥 GROUP CHAT LOGIC: Only respond to mentions or specific commands
      if (isGroupChat && !isDirectMention && !isInvocationCommand) {
        console.log('👥 Group message without mention/command - ignoring to prevent spam');
        return;
      }

      // Generate appropriate response based on context
      const response = await this.processMessage(messageContent, senderInboxId, isGroupChat);
      
      if (!response || !response.trim()) {
        console.warn('⚠️ No response generated for message');
        return;
      }

      console.log(`✅ Generated response (${response.length} chars): "${response.substring(0, 100)}..."`);

      // Send the response
      await conversation.send(response);
      console.log(`✅ Response sent successfully to ${senderInboxId}`);

    } catch (error) {
      console.error('❌ Error processing incoming message:', error);
      
      // Send error response as fallback
      try {
        const conversation = await this.client!.conversations.getConversationById(message.conversationId);
        if (conversation) {
          await conversation.send('🤖 Sorry, I encountered an error. Please try again or type "help" for assistance.');
          console.log('✅ Error response sent');
        }
      } catch (sendError) {
        console.error('❌ Failed to send error response:', sendError);
      }
    }
  }

  // 🔥 NEW: Check if message directly mentions the agent
  private isDirectMention(content: string): boolean {
    const mentionPatterns = [
      /@dstealth/i,
      /hey dstealth/i,
      /hi dstealth/i,
      /dstealth/i,
      /@agent/i,
      /hey agent/i,
      /hi agent/i
    ];
    
    return mentionPatterns.some(pattern => pattern.test(content));
  }

  // 🔥 NEW: Check if message is a specific invocation command
  private isInvocationCommand(content: string): boolean {
    const invocationPatterns = [
      /^\/pay/i,
      /^\/help/i,
      /^\/balance/i,
      /^\/links/i,
      /^\/create/i,
      /\$\d+/,  // Payment amount patterns
      /create.*payment.*link/i,
      /generate.*link/i
      // Note: /scan is NOT included here - it's DM-only for privacy
    ];
    
    return invocationPatterns.some(pattern => pattern.test(content.trim()));
  }

  private analyzeMessage(content: string, context: ConversationContext): {
    primaryTrigger: string | null;
    triggers: string[];
    requiresAI: boolean;
    isComplex: boolean;
    priority: number;
    intent: string;
  } {
    const triggers: string[] = [];
    let primaryTrigger: string | null = null;
    let requiresAI = false;
    let isComplex = false;
    let priority = 0;

    // Check each trigger category
    for (const [category, patterns] of Object.entries(this.triggerPatterns)) {
      for (const pattern of patterns) {
        if (pattern.test(content)) {
          triggers.push(category);
          if (!primaryTrigger) {
            primaryTrigger = category;
          }
        }
      }
    }

    // Determine if AI processing is needed
    if (content.length > 100 || 
        triggers.length === 0 || 
        context.conversationHistory.length > 10) {
      requiresAI = true;
    }

    // Determine complexity
    if (content.includes('$') || 
        triggers.includes('payment') || 
        triggers.includes('stealth')) {
      isComplex = true;
      priority = 1;
    }

    // Determine intent
    let intent = 'general';
    if (triggers.includes('payment')) intent = 'payment';
    else if (triggers.includes('setup')) intent = 'setup';
    else if (triggers.includes('stealth')) intent = 'stealth';
    else if (triggers.includes('commands')) intent = 'command';

    return {
      primaryTrigger,
      triggers,
      requiresAI,
      isComplex,
      priority,
      intent
    };
  }

  private async generateResponseFromTask(taskResult: any, context: ConversationContext, analysis: any): Promise<string> {
    if (!taskResult.success) {
      return 'I encountered an issue processing your request. Please try again.';
    }

    // For now, fall back to regular processing since we're not using actual AI workers yet
    return await this.processMessage(analysis.data?.message || '', context.userId, false);
  }

  // 🔥 ENHANCED: Message processing with group/DM context awareness
  private async processMessage(messageContent: string, senderInboxId: string, isGroupChat: boolean = false): Promise<string> {
    try {
      const trimmed = messageContent.trim();
      
      console.log(`🔍 Processing message: "${trimmed}" (${isGroupChat ? 'GROUP' : 'DM'})`);
      
      // Handle commands first (work the same in both contexts)
      if (trimmed.startsWith('/')) {
        console.log(`⚙️ Processing command: ${trimmed}`);
        const response = await this.processCommand(trimmed, senderInboxId, isGroupChat);
        if (response && response.trim()) {
          console.log(`✅ Command response generated`);
          return response;
        }
      }

      // 🔥 NEW: Check for payment requests - now allowed in groups for verified users
      const paymentMatch = this.extractPaymentAmount(trimmed);
      if (paymentMatch) {
        console.log(`💰 Payment request detected: $${paymentMatch.amount}`);
        
        if (isGroupChat) {
          // In group chat: Check if user has completed onboarding
          const userData = await agentDb.getStealthDataByUser(senderInboxId);
          if (!userData || !userData.fkeyId || !userData.stealthAddress) {
            return `🔒 **Payment Link Creation - Setup Required**

💬 **For privacy & security, please DM me first to set up your fkey.id**

**Steps:**
1. 💬 **Send me a DM** 
2. 🔑 **Tell me your fkey.id username** (e.g., "tantodefi")
3. ✅ **Complete setup** in the dStealth Mini App
4. 🎉 **Return here** - payment links will work in groups!

**Why DM first?** Your fkey.id setup involves sensitive stealth address info that should be shared privately.

**🔗 Get FluidKey**: https://app.fluidkey.com/?ref=62YNSG`;
          }
        }
        
        const response = await this.handlePaymentLinkRequest(paymentMatch.amount, senderInboxId);
        if (response && response.trim()) {
          return response;
        }
      }

      // 🔥 RESTRICTED: fkey.id submission only allowed in DMs (onboarding security)
      if (this.isFkeyIdPattern(trimmed)) {
        console.log(`🔑 fkey.id pattern detected`);
        
        if (isGroupChat) {
          return `🔒 **FluidKey Setup - DM Required for Privacy**

💬 **Please DM me directly to set up your fkey.id**

**Why?** Setting up your fkey.id involves:
- 🥷 **Stealth address generation** 
- 🔐 **Private key verification**
- 🧾 **ZK proof handling**

**These should be shared privately, not in a group!**

**Steps:**
1. 💬 **Send me a DM**
2. 🔑 **Tell me**: "${trimmed}"
3. ✅ **Complete setup**
4. 🎉 **Return here** for payment features!

**🔗 Get FluidKey**: https://app.fluidkey.com/?ref=62YNSG`;
        }
        
        const response = await this.handleFkeyIdSubmission(trimmed, senderInboxId);
        if (response && response.trim()) {
          return response;
        }
      }

      // Check for basic keywords
      const basicResponse = this.processBasicKeywords(trimmed, senderInboxId);
      if (basicResponse && basicResponse.trim()) {
        console.log(`📝 Basic keyword response generated`);
        return basicResponse;
      }

      // 🔥 GROUP vs DM BEHAVIOR SPLIT
      if (isGroupChat) {
        // In groups: Enhanced responses for verified users, invites for new users
        return this.handleGroupMessage(trimmed, senderInboxId);
      } else {
        // In DMs: Full onboarding experience
        return this.handleDMMessage(trimmed, senderInboxId);
      }
      
    } catch (error) {
      console.error(`❌ Error in processMessage for "${messageContent}":`, error);
      // Even if everything fails, provide a helpful response
      return this.getGuaranteedFallbackResponse();
    }
  }

  // 🔥 ENHANCED: Handle group chat messages with verified user features
  private async handleGroupMessage(content: string, senderInboxId: string): Promise<string> {
    console.log(`👥 Processing group message`);

    // Check if user has completed onboarding (has fkey.id)
    const userData = await agentDb.getStealthDataByUser(senderInboxId);
    const isVerifiedUser = userData && userData.fkeyId && userData.stealthAddress;

    // Try GPT for complex questions first (for verified users)
    const isComplexQuery = this.isComplexQuery(content);
    if (openai && isComplexQuery && isVerifiedUser) {
      console.log(`🤖 Using GPT for verified user group response`);
      const gptResponse = await this.processWithGPT(content, senderInboxId);
      if (gptResponse && gptResponse.trim()) {
        return gptResponse;
      }
    }

    // Enhanced response for verified users, basic invite for new users
    if (isVerifiedUser) {
      return this.getVerifiedUserGroupMessage(userData);
      } else {
      return this.getGroupInviteMessage();
    }
  }

  // 🔥 NEW: Handle DM messages (full onboarding experience)
  private async handleDMMessage(content: string, senderInboxId: string): Promise<string> {
    console.log(`💬 Processing DM message`);

    // Try GPT for complex queries or established users
    const isComplexQuery = this.isComplexQuery(content);
    const userHasSetup = await this.checkMiniAppRegistration(senderInboxId);
    
    if (openai && (isComplexQuery || userHasSetup)) {
      console.log(`🤖 Using GPT for DM response`);
      const gptResponse = await this.processWithGPT(content, senderInboxId);
      if (gptResponse && gptResponse.trim()) {
        return gptResponse;
      }
    }

    // Default DM response: Full onboarding experience
    const firstTimeResponse = await this.handleFirstTimeUser(senderInboxId);
    if (firstTimeResponse && firstTimeResponse.trim()) {
      return firstTimeResponse;
    }

    return this.getGuaranteedFallbackResponse();
  }

  // 🔥 NEW: Enhanced group message for verified users
  private getVerifiedUserGroupMessage(userData: UserStealthData): string {
    return `👋 **Hey ${userData.fkeyId}!** 🥷

✅ **You're verified** - full group features unlocked!

**💳 Quick Group Actions:**
• **"create payment link for $X"** - Generate stealth payment links
• **/fkey <username>** - Look up any fkey.id  
• **/help** - Full command list

**🏠 Your Stealth Address**: \`${userData.stealthAddress?.slice(0, 6)}...${userData.stealthAddress?.slice(-4)}\`

**🔒 Private Commands** (DM me for):
• **/balance** - Check balance privately
• **/scan <address>** - Privacy analysis  
• **/links** - Manage your links

**🎯 Ready to earn privacy rewards!**`;
  }

  // 🔥 NEW: Short invite message for group chats
  private getGroupInviteMessage(): string {
    return `👋 **Hi! I'm the dStealth Agent** 🥷

💰 **I help with privacy rewards & anonymous payments**

🚀 **Try dStealth**: https://dstealth.xyz
🔑 **Get FluidKey**: https://app.fluidkey.com/?ref=62YNSG

**Group Commands**: /help, /pay $amount
**Privacy Commands**: DM me for /scan, /balance, etc.
**Questions?** DM me for full setup assistance!`;
  }

  private async processCommand(command: string, senderInboxId: string, isGroupChat: boolean = false): Promise<string | null> {
    const cmd = command.trim().toLowerCase();

    if (cmd === '/help') {
      return this.getHelpMessage();
    }

    if (cmd === '/setup complete') {
      // Setup completion should be done in DMs for privacy
      if (isGroupChat) {
        return `🔒 **Setup completion should be done privately**

💬 **Please DM me** to complete your setup securely.

**Why?** Setup involves sensitive information that should be shared privately.`;
      }
      return await this.handleSetupComplete(senderInboxId);
    }

    if (cmd.startsWith('/fkey ')) {
      // fkey lookup is allowed in groups for verified users
      const fkeyId = cmd.slice(6).trim();
      if (fkeyId) {
        if (isGroupChat) {
          // In groups: Only allow if user is verified
      const userData = await agentDb.getStealthDataByUser(senderInboxId);
          if (!userData || !userData.fkeyId) {
            return `🔒 **fkey.id lookup requires setup**

💬 **Please DM me first** to set up your own fkey.id, then you can look up others in groups!

**🔗 Get FluidKey**: https://app.fluidkey.com/?ref=62YNSG`;
          }
        }
        return await this.handleFkeyLookup(fkeyId, senderInboxId);
      }
      return 'Please provide a fkey.id to lookup (e.g., `/fkey tantodefi.fkey.id`)';
    }

    if (cmd.startsWith('/scan ')) {
      // 🔒 PRIVACY: /scan is DM-only to protect sensitive information
      if (isGroupChat) {
        return `🔒 **Address scanning is DM-only for privacy**

💬 **Please DM me** to scan addresses privately.

**Why?** Address analysis reveals sensitive privacy information that shouldn't be shared in groups.`;
      }
      
      const address = cmd.slice(6).trim();
      if (address) {
        return await this.handleStealthScan(address, senderInboxId);
      }
      return 'Please provide an address to scan (e.g., `/scan 0x...`)';
    }

    if (cmd === '/links') {
      // Links management is DM-only for privacy
      if (isGroupChat) {
        return `🔒 **Link management is DM-only for privacy**

💬 **Please DM me** to view and manage your payment links privately.`;
      }
      return await this.handleProxy402Links(senderInboxId);
    }

    if (cmd === '/balance') {
      // Balance checking is DM-only for privacy
      if (isGroupChat) {
        return `🔒 **Balance checking is DM-only for privacy**

💬 **Please DM me** to check your balance privately.

**Why?** Financial information should never be shared in groups.`;
      }
      return await this.handleCheckBalance(senderInboxId);
    }

    if (cmd.startsWith('/create ')) {
      // Content creation is DM-only for now
      if (isGroupChat) {
        return `🔒 **Content creation is DM-only**

💬 **Please DM me** for content creation features.`;
      }
      return await this.handleCreateContent(cmd, senderInboxId);
    }

    return `❓ **Unknown command**: ${command}

Type **/help** to see available commands.`;
  }

  private async handleStealthScan(address: string, senderInboxId: string): Promise<string> {
    try {
      const scanResult = await this.apiClient.scanStealthAddress(address);
      
      if (!scanResult.success) {
        return `❌ **Scan Failed**\n${scanResult.error || 'Unable to scan address'}`;
      }

      return `🔍 **Address Scan Results**
📍 Address: ${address}
🏆 Privacy Score: ${scanResult.privacyScore || 'Unknown'}
📊 Activity: ${scanResult.activityLevel || 'Unknown'}`;

    } catch (error) {
      return `❌ **Error scanning address**\nPlease try again or type /help for assistance.`;
    }
  }

  private async handleProxy402Links(senderInboxId: string): Promise<string> {
    try {
      // Check if user has completed full setup
      const hasMiniAppSetup = await this.checkMiniAppRegistration(senderInboxId);
      
      if (!hasMiniAppSetup) {
        return this.requireMiniAppSetup("Links Management");
      }

      const userData = await agentDb.getStealthDataByUser(senderInboxId);
      if (!userData?.stealthAddress) {
        return `❌ **Address Required**\n\nPlease set your fkey.id first!`;
      }

      const linksResult = await this.apiClient.getProxy402Links(userData.stealthAddress);
      
      if (!linksResult.success || !linksResult.links || linksResult.links.length === 0) {
        return `📄 **No Links Found**\n\nYou haven't created any content links yet. Type "/create content" to get started!`;
      }

      const linkList = linksResult.links.map((link: any, index: number) => 
        `${index + 1}. ${link.title || 'Untitled'} - ${link.price || '0'} USDC`
      ).join('\n');

      return `📊 **Your Content Links**\n\n${linkList}\n\nType "/create content" to create new monetized content!`;

    } catch (error) {
      return `❌ **Error fetching links**\nPlease try again or type /help for assistance.`;
    }
  }

  private async handleCheckBalance(senderInboxId: string): Promise<string> {
    try {
      // Check if user has completed full setup
      const hasMiniAppSetup = await this.checkMiniAppRegistration(senderInboxId);
      
      if (!hasMiniAppSetup) {
        return this.requireMiniAppSetup("Balance Checking");
      }

      const userData = await agentDb.getStealthDataByUser(senderInboxId);
      if (!userData?.stealthAddress) {
        return `❌ **Address Required**\n\nPlease set your fkey.id first!`;
      }

      const balanceResult = await this.apiClient.getBalance(userData.stealthAddress);
      
      if (!balanceResult.success) {
        return `❌ **Balance Check Failed**\n${balanceResult.error || 'Unable to check balance'}`;
      }

      return `💰 **Account Balance**
🏠 Address: ${userData.stealthAddress}
💵 Balance: ${balanceResult.balance || '0'} USDC
🏆 Privacy Score: ${balanceResult.privacyScore || 'Unknown'}`;

    } catch (error) {
      return `❌ **Error checking balance**\nPlease try again or type /help for assistance.`;
    }
  }

  private async handleCreateContent(command: string, senderInboxId: string): Promise<string> {
    try {
      // Check if user has completed full setup
      const hasMiniAppSetup = await this.checkMiniAppRegistration(senderInboxId);
      
      if (!hasMiniAppSetup) {
        return this.requireMiniAppSetup("Content Creation");
      }

      const userData = await agentDb.getStealthDataByUser(senderInboxId);
      if (!userData?.stealthAddress) {
        return `❌ **Address Required**\n\nPlease set your fkey.id first!`;
      }

      return `🚧 **Content Creation Coming Soon**

Advanced content creation features are in development!

**Available now:**
- Payment links: "create payment link for $10"
- Address scanning: /scan <address>
- Balance checking: /balance

**Coming soon:**
- Monetized content creation
- Privacy-protected file sharing
- Anonymous content publishing

Stay tuned for updates!`;

    } catch (error) {
      return `❌ **Error creating content**\nPlease try again or type /help for assistance.`;
    }
  }

  private processBasicKeywords(content: string, senderInboxId: string): string | null {
    const lower = content.toLowerCase().trim();

    // Handle greetings
    if (lower === 'hi' || lower === 'hello' || lower === 'hey' || lower === 'sup' || lower === 'yo') {
      console.log('👋 Greeting detected');
      return null; // Let it fall through to first-time user flow
    }

    // Handle "no" responses
    if (lower === 'no' || lower === 'nope' || lower === 'none' || lower === 'i don\'t have one') {
      return this.handleNoFkeyId();
    }

    // Handle affirmative responses without username
    if (lower === 'yes' || lower === 'yeah' || lower === 'yep' || lower === 'i have one') {
      return `✅ **Great! You have a fkey.id**\n\nPlease tell me your username (e.g., "tantodefi" for tantodefi.fkey.id)`;
    }

    // Handle help requests
    if (lower.includes('help') || lower.includes('what can you do') || lower.includes('commands')) {
      return this.getHelpMessage();
    }

    return null;
  }

  private getHelpMessage(): string {
    return `🤖 **dStealth Agent - Complete Command List**

**🔧 Setup Commands:**
• Tell me your **fkey.id username** (e.g., "tantodefi")
• Say **"no"** if you don't have a fkey.id yet
• **/setup complete** - After finishing mini app setup

**🔍 Privacy Tools:**
• **/scan <address>** - Check address privacy score
• **/fkey <username>** - Look up any fkey.id

**💳 Payment Features:** (Requires setup)
• **"create payment link for $X"** - Generate anonymous payment links
• **/balance** - Check your stealth address balance
• **/links** - View your content links

**📡 Advanced Features:** (Requires setup)
• **/create content** - Monetized content creation (coming soon)
• **/rewards** - Check privacy earnings (coming soon)

**ℹ️ Info Commands:**
• **/help** - This help message

**🎯 Quick Start:**
1. Tell me your fkey.id username OR say "no" to create one
2. Complete setup in the dStealth Mini App
3. Return and type "/setup complete"
4. Start earning privacy rewards!

**💡 Pro Tip:** The more you use stealth addresses and privacy features, the higher your FluidKey Score and rewards!`;
  }

  // Helper method to get current status
  getStatus(): { isRunning: boolean; agentAddress: string | null } {
    return {
      isRunning: this.isRunning,
      agentAddress: this.agentAddress
    };
  }

  // Get contact information for API endpoints
  getContactInfo(): { inboxId: string; address: string } {
    return {
      inboxId: this.client?.inboxId || 'not-initialized',
      address: this.agentAddress || 'not-initialized'
    };
  }

  // Graceful shutdown
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    
    this.isShuttingDown = true;
    console.log('🔄 Shutting down dStealth Agent...');
    
    try {
      // Stop message processing
      this.isRunning = false;
      
      // Shutdown worker pools and queues
      this.workerPool.shutdown();
      this.messageQueue.shutdown();
      
      // Clear XMTP client reference
      if (this.client) {
        this.client = null;
      }
      
      console.log('✅ dStealth Agent shutdown complete');
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
    }
  }

  // 🔥 NEW: GPT-powered message processing
  private async processWithGPT(content: string, senderInboxId: string): Promise<string> {
    try {
      if (!openai) {
        console.log('⚠️ OpenAI not available, falling back to default response');
        return '';
      }

      // Get user context
      const userData = await agentDb.getStealthDataByUser(senderInboxId);
      const userContext = userData ? `User has fkey.id: ${userData.fkeyId}` : 'New user';

      const systemPrompt = `You are the dStealth Agent, a privacy-focused Web3 assistant that helps users with:

🥷 **Core Functions:**
- Stealth addresses and privacy tools
- FluidKey/fkey.id setup and management  
- Anonymous payment links and rewards
- Privacy score tracking and challenges
- Web3 anonymity best practices

🔑 **Key Information:**
- FluidKey referral code: 62YNSG
- dStealth Mini App: https://dstealth.xyz
- Users need fkey.id for full features
- Focus on privacy, rewards, and Web3 anonymity

**User Context:** ${userContext}

**Guidelines:**
- Be helpful, enthusiastic about privacy
- Use emojis appropriately 
- Keep responses concise but informative
- Always mention relevant privacy/reward benefits
- Encourage fkey.id setup if user doesn't have one
- Maintain the dStealth brand voice

Respond to the user's message in a helpful way while staying focused on privacy tools and rewards.`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content }
        ],
        max_tokens: 500,
        temperature: 0.7
      });

      const gptResponse = completion.choices[0]?.message?.content;
      
      if (gptResponse) {
        console.log(`✅ GPT generated response (${gptResponse.length} chars)`);
        return gptResponse.trim();
      }

      return '';
      
    } catch (error) {
      console.error('❌ GPT processing error:', error);
      return '';
    }
  }

  // 🔥 SECURED: Handle payment link requests with FRESH stealth addresses and ZK receipts
  private async handlePaymentLinkRequest(amount: string, senderInboxId: string): Promise<string> {
    try {
      console.log(`💰 Processing payment link request for $${amount} from ${senderInboxId}`);

      // 🚨 SECURITY: Get user data for initial validation
      const userData = await agentDb.getStealthDataByUser(senderInboxId);
      
      // 🚨 SECURITY: Must have fkey.id in database to proceed
      if (!userData || !userData.fkeyId || userData.fkeyId.trim() === '') {
        console.log(`❌ Payment link creation BLOCKED - no fkey.id found for user: ${senderInboxId}`);
        
        return `🚫 **Payment Link Creation Failed**\n\n` +
               `❌ **Reason**: No verified FluidKey ID found for your account\n\n` +
               `🔑 **Required Setup** (DM me privately):\n` +
               `1. Get FluidKey: https://app.fluidkey.com/?ref=62YNSG\n` +
               `2. Tell me your username (e.g., "tantodefi")\n` +
               `3. Complete setup: ${this.getDStealthMiniAppLink()}\n\n` +
               `⚡ **Only users with verified fkey.id can create stealth payment links**\n\n` +
               `💡 **Why?** This ensures all payments go to YOUR verified stealth address for maximum privacy!\n\n` +
               `🔒 **Security**: No payment links without verified identity - no exceptions!`;
      }

      // 🔥 CRITICAL SECURITY FIX: Always fetch FRESH fkey.id data for payment links
      console.log(`🔄 Fetching FRESH fkey.id data for: ${userData.fkeyId}`);
      const freshLookupResult = await this.apiClient.lookupFkey(userData.fkeyId);
      
      if (!freshLookupResult.success || !freshLookupResult.address) {
        console.log(`❌ Fresh fkey.id lookup failed for: ${userData.fkeyId}`);
        return `❌ **Fresh Verification Failed**\n\n` +
               `🔄 **Could not verify current fkey.id data**: ${userData.fkeyId}\n\n` +
               `⚠️ **Possible causes:**\n` +
               `• fkey.id temporarily unavailable\n` +
               `• Network connectivity issues\n` +
               `• FluidKey service maintenance\n\n` +
               `🔑 **Please try again in a few moments**\n\n` +
               `💡 **Security**: We always fetch fresh data for payment links to ensure accuracy!`;
      }

      // 🚨 SECURITY: Ensure fresh zkProof exists (proves current authenticity)
      if (!freshLookupResult.proof) {
        console.log(`❌ Fresh fkey.id missing zk proof for: ${userData.fkeyId}`);
        return `❌ **Fresh Verification Failed**\n\n` +
               `🔄 **Current fkey.id lacks ZK proof**: ${userData.fkeyId}\n\n` +
               `🔑 **Please re-setup your fkey.id**:\n` +
               `1. Visit: https://app.fluidkey.com/?ref=62YNSG\n` +
               `2. Re-verify your account\n` +
               `3. Tell me your fkey.id username again\n\n` +
               `🔒 **Security**: Fresh ZK proof required for payment link authenticity!`;
      }

      // 🔥 ENHANCED: Use FRESH data, update database with latest info
      const freshStealthAddress = freshLookupResult.address;
      const freshZkProof = freshLookupResult.proof;
      
      console.log(`✅ Payment link authorized with FRESH data: ${userData.fkeyId} -> ${freshStealthAddress}`);
      
      // 🔄 Update database with fresh data for future reference
      try {
        await agentDb.updateStealthDataByUser(senderInboxId, {
          stealthAddress: freshStealthAddress,
          zkProof: freshZkProof,
          lastUpdated: Date.now()
        });
        console.log(`📊 Database updated with fresh fkey.id data for: ${userData.fkeyId}`);
      } catch (updateError) {
        console.warn('⚠️ Failed to update database with fresh data:', updateError);
        // Continue with payment link creation even if database update fails
      }

      // 🔥 Generate stealth payment link with FRESH verified data - NO STALE DATA
      const stealthPaymentLink = await this.generateDaimoPaymentLink(
        amount, 
        freshStealthAddress, // Using FRESH address, never cached
        {
          contentId: `xmtp_payment_${Date.now()}`,
          userStealthAddress: freshStealthAddress, // Fresh address
          fkeyId: userData.fkeyId, // Required for verification
          zkProof: freshZkProof, // Fresh proof
          senderInboxId: senderInboxId,
          paymentIntent: `XMTP Payment $${amount}`,
          privacyLevel: 'stealth',
          dataFreshness: 'live' // Indicate this is fresh data
        }
      );
      
      // Store ZK receipt for the payment with fresh data
      try {
        const zkReceiptId = `zk_xmtp_${senderInboxId}_${Date.now()}`;
        console.log(`🧾 ZK receipt prepared with fresh data: ${zkReceiptId}`);
        
        await agentDb.logAgentInteraction(
          this.client?.inboxId || 'unknown',
          senderInboxId,
          'payment_link_created_stealth_fresh',
          {
            amount,
            stealthAddress: freshStealthAddress, // Fresh address
            fkeyId: userData.fkeyId,
            zkReceiptId,
            dataFreshness: 'live',
            timestamp: Date.now()
          }
        );
      } catch (receiptError) {
        console.warn('⚠️ Failed to create ZK receipt:', receiptError);
      }
      
      // 🔥 ENHANCED: Include fresh data verification in response
      return `💰 **Your Stealth Payment Link** (Fresh Data ✅):\n${stealthPaymentLink}\n\n` +
             `🔐 **Verified Identity**: ${userData.fkeyId}\n` +
             `🥷 **Live Stealth Address**: \`${freshStealthAddress?.slice(0, 6)}...${freshStealthAddress?.slice(-4)}\`\n` +
             `🔄 **Data Freshness**: Live (just fetched)\n` +
             `🧾 **Privacy**: ZK receipt will be generated upon payment\n` +
             `⚡ **Trust**: This link uses your CURRENT verified stealth address\n\n` +
             `✅ Recipients will send payments privately to your latest stealth address!\n` +
             `📱 **Manage**: ${this.getDStealthMiniAppLink()}`;

    } catch (error) {
      console.error('❌ Error handling payment link request:', error);
      
      // 🔥 ENHANCED: Even error responses require fresh verification
      return `❌ **Payment Link Creation Failed**\n\n` +
             `🔧 **Technical Error**: ${error instanceof Error ? error.message : 'Unknown error'}\n\n` +
             `🔑 **Ensure Fresh Setup**:\n` +
             `1. FluidKey: https://app.fluidkey.com/?ref=62YNSG\n` +
             `2. Tell me your fkey.id username (DM me privately)\n` +
             `3. Complete: ${this.getDStealthMiniAppLink()}\n\n` +
             `💡 **Security**: We always verify fresh data for payment links\n\n` +
             `🔒 **No stale data**: Payment links use live verification only!`;
    }
  }

  // 🔥 SECURED: Generate Daimo payment links ONLY with verified user data - NO FALLBACKS
  private async generateDaimoPaymentLink(amount: string, stealthAddress: string, zkReceiptData: any): Promise<string> {
    // 🚨 SECURITY: NO fallback addresses - must have verified stealth address
    if (!stealthAddress || stealthAddress.trim() === '') {
      throw new Error('Payment link creation requires verified stealth address from fkey.id - no fallbacks allowed');
    }

    // 🚨 SECURITY: Must have valid zkReceiptData with fkey.id
    if (!zkReceiptData || !zkReceiptData.fkeyId) {
      throw new Error('Payment link creation requires verified fkey.id data - no anonymous links allowed');
    }

    const recipient = stealthAddress; // NO FALLBACK - use verified address only
    
    // 🔥 FIXED: Daimo expects dollar amounts, not smallest units
    const amountInDollars = parseFloat(amount).toFixed(2);
    
    console.log('💰 Agent amount conversion details:', {
      originalAmount: amount,
      finalAmountInDollars: amountInDollars,
      daimoLimit: 4000,
      withinLimit: parseFloat(amountInDollars) <= 4000,
      recipient,
      verifiedStealthAddress: true,
      fkeyId: zkReceiptData.fkeyId
    });
    
    // 🔥 SYNC WITH FRONTEND: Build metadata to match working frontend pattern
    const metadata: Record<string, any> = {
      type: 'x402-content',                    // ✅ Match frontend type  
      service: 'dstealth-xmtp',
      recipientType: 'stealth',                // ✅ Always stealth since we require fkey.id
    };
    
    // 🔥 ENHANCED: Add trust verification fields (required for security)
    metadata.verifiedFkeyId = zkReceiptData.fkeyId;
    metadata.trustedIdentity = 'true';
    
    // Add receipt ID and content ID
    metadata.zkReceiptId = `zk_${zkReceiptData.contentId || 'xmtp'}_${Date.now()}`;
    metadata.contentId = zkReceiptData.contentId || `xmtp_payment_${Date.now()}`;
    
    // 🔥 CRITICAL: Add zkReceiptData fields but EXCLUDE zkProof (frontend approach)
    Object.entries(zkReceiptData).forEach(([key, value]) => {
      if (key !== 'zkProof' && value !== null && value !== undefined) {
        // Only add safe, small fields
        if (typeof value !== 'object' && String(value).length < 100) {
          metadata[key] = value;
        }
      }
    });
    
    // Instead of full zkProof, just indicate we have it
    if (zkReceiptData.zkProof) {
      metadata.hasZkProof = 'true';
      metadata.zkProofTimestamp = Date.now();
    }
    
    // 🔥 SYNC WITH FRONTEND: Enhanced intent with verified user fkey.id  
    const userFkeyId = zkReceiptData.fkeyId; // Required, no fallback
    const intent = `ZK receipt for stealth payment to ${userFkeyId} at dstealth.xyz`;
    
    // Use the new Daimo Pay API
    const paymentLink = await daimoPayClient.createPaymentLink({
      destinationAddress: recipient,
      amountUnits: amountInDollars,
      displayAmount: amountInDollars, // Send the same amount for display
      tokenSymbol: 'USDC',
      chainId: getDaimoChainId('base'),
      externalId: zkReceiptData.contentId || `agent_payment_${Date.now()}`,
      intent,
      metadata
    });
    
    console.log(`✅ Agent created Daimo payment link via API: ${paymentLink.url}`);
    console.log(`🎯 Payment recipient: ${recipient} (verified-stealth-${userFkeyId})`);
    
    return paymentLink.url;
  }

  // Extract payment amount from message content
  private extractPaymentAmount(content: string): { amount: string } | null {
    const paymentPatterns = [
      /create.*payment.*link.*for.*\$(\d+(?:\.\d{2})?)/i,
      /\$(\d+(?:\.\d{2})?).*payment.*link/i,
      /generate.*link.*\$(\d+(?:\.\d{2})?)/i,
      /make.*payment.*\$(\d+(?:\.\d{2})?)/i,
      /payment.*\$(\d+(?:\.\d{2})?)/i,
      /\$(\d+(?:\.\d{2})?)/
    ];

    for (const pattern of paymentPatterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        return { amount: match[1] };
      }
    }
    return null;
  }

  // Check if content looks like a fkey.id pattern
  private isFkeyIdPattern(content: string): boolean {
    // Check for fkey.id patterns like "tantodefi.fkey.id" or just "tantodefi"
    return /^[a-z0-9._-]+\.fkey\.id$/i.test(content) || 
           /^[a-z0-9._-]+$/i.test(content.trim()) && 
           content.length > 2 && content.length < 50 && 
           !content.includes(' ');
  }

  // 🔥 SECURED: Handle fkey.id submission - ONLY with explicit user consent
  private async handleFkeyIdSubmission(fkeyInput: string, senderInboxId: string): Promise<string> {
    try {
      // 🚨 SECURITY: Only process fkey.id if explicitly provided by user
      if (!fkeyInput || fkeyInput.trim() === '') {
        throw new Error('fkey.id submission requires explicit user input - no automatic lookups');
      }

      // Normalize the fkey.id input
      let fkeyId = fkeyInput.trim();
      if (!fkeyId.endsWith('.fkey.id')) {
        fkeyId = `${fkeyId}.fkey.id`;
      }

      console.log(`🔑 Processing fkey.id: ${fkeyId} (user-initiated: ${senderInboxId})`);
      
      // 🚨 SECURITY: Only perform zkfetch with explicit user-provided fkey.id
      // This ensures we never automatically fetch address/proof data without consent
      const lookupResult = await this.apiClient.lookupFkey(fkeyId);
      
      // 🔧 SECURITY: Strict validation - must have both address and proof
      if (!lookupResult.success || !lookupResult.address) {
        console.log(`❌ fkey.id lookup failed for: ${fkeyId} - no valid address found`);
        return `❌ **FluidKey ID not found**: ${fkeyId}

Please check the spelling or create one at:
🔗 **FluidKey**: https://app.fluidkey.com/?ref=62YNSG

Once you have a fkey.id, tell me your username and I'll help you set up stealth payments!`;
      }

      // 🚨 SECURITY: Only store data if we have verified proof from zkfetch
      if (!lookupResult.proof) {
        console.log(`❌ fkey.id missing zk proof for: ${fkeyId} - cannot verify authenticity`);
        return `❌ **FluidKey ID verification failed**: ${fkeyId}

The fkey.id exists but couldn't be verified with a ZK proof. Please try again or contact support if this persists.

🔗 **FluidKey**: https://app.fluidkey.com/?ref=62YNSG`;
      }

      console.log(`✅ fkey.id verified with proof: ${fkeyId} -> ${lookupResult.address}`);

      // Store user data (map 'address' to 'stealthAddress') - ONLY after full verification
      await agentDb.storeUserStealthData({
        userId: senderInboxId,
        fkeyId,
        stealthAddress: lookupResult.address, // Use 'address' from backend
        zkProof: lookupResult.proof, // Use 'proof' from backend  
        requestedBy: senderInboxId,
        setupStatus: 'fkey_set',
        lastUpdated: Date.now()
      });

      return `✅ **FluidKey ID verified**: ${fkeyId}
🏠 **Stealth Address**: ${lookupResult.address}

🎯 **Next Step**: Complete setup in the dStealth Mini App
📱 **Link**: ${this.getDStealthMiniAppLink()}

After setup, return here and type "/setup complete" to unlock all features!`;

    } catch (error) {
      console.error('Error handling fkey.id submission:', error);
      return `❌ **Error processing fkey.id**

Please try again or create a new one at:
🔗 **FluidKey**: https://app.fluidkey.com/?ref=62YNSG`;
    }
  }

  // Check if query is complex (needs GPT)
  private isComplexQuery(content: string): boolean {
    const complexPatterns = [
      /how.*(work|do|setup)/i,
      /what.*(is|are|does)/i,
      /why.*(should|would|do)/i,
      /explain/i,
      /difference/i,
      /compare/i,
      /help.*with/i,
      /problem|issue|error/i,
      /\?/,  // Contains question mark
    ];

    return complexPatterns.some(pattern => pattern.test(content)) || 
           content.length > 50 ||
           content.split(' ').length > 10;
  }

  // Guaranteed fallback response
  private getGuaranteedFallbackResponse(): string {
    return `👋 **Hi! I'm the dStealth Agent** 🥷

💰 **I help with privacy & anonymous payments**

**🚀 Get Started:**
1. Tell me your **fkey.id username** (e.g., "tantodefi")
2. Or say **"no"** if you don't have one yet

**💳 Quick Actions:**
• **"create payment link for $X"** - Generate payment links
• **/help** - Full command list
• **/scan <address>** - Check privacy score

**🔗 Links:**
• **dStealth Mini App**: ${this.getDStealthMiniAppLink()}
• **Get FluidKey**: https://app.fluidkey.com/?ref=62YNSG

Type **"help"** for complete instructions!`;
  }

  // Handle first time users
  private async handleFirstTimeUser(senderInboxId: string): Promise<string> {
    // Check if user already has data
    const userData = await agentDb.getStealthDataByUser(senderInboxId);
    
    if (userData && userData.fkeyId) {
      // User has fkey but maybe not complete setup
      if (userData.setupStatus === 'complete') {
        return this.getExistingUserWelcome(userData);
      } else {
        return this.requireMiniAppSetup("Full Features");
      }
    }

    // New user - start onboarding
    return `👋 **Welcome to dStealth!** 🥷

I'm your **privacy & anonymous payment assistant**.

**🔑 Do you have a FluidKey ID (fkey.id)?**

**If YES**: Tell me your username (e.g., "tantodefi")
**If NO**: Say "no" and I'll help you create one

**💡 With FluidKey you get:**
- Anonymous stealth addresses
- Private payment links
- Privacy rewards & challenges
- Enhanced Web3 anonymity

**Ready?** Tell me your fkey.id username or say "no" to get started!`;
  }

  // Handle "no" response (no fkey.id)
  private handleNoFkeyId(): string {
    return `🆕 **No problem! Let's get you set up** 

**Step 1**: Create your FluidKey ID
🔗 **Visit**: https://app.fluidkey.com/?ref=62YNSG
🎯 **Referral Code**: 62YNSG (for bonus rewards!)

**Step 2**: Choose your username  
Example: "tantodefi" becomes "tantodefi.fkey.id"

**Step 3**: Complete setup
📱 **dStealth Mini App**: ${this.getDStealthMiniAppLink()}

**Step 4**: Return here
Tell me your new fkey.id username!

**💡 Pro Tip**: FluidKey gives you stealth addresses for anonymous payments and privacy rewards!`;
  }

  // Check mini app registration
  private async checkMiniAppRegistration(senderInboxId: string): Promise<boolean> {
    try {
      const userData = await agentDb.getStealthDataByUser(senderInboxId);
      return Boolean(userData && userData.setupStatus === 'complete');
    } catch (error) {
      return false;
    }
  }

  // Require mini app setup
  private requireMiniAppSetup(feature: string): string {
    return `🔒 **${feature} requires complete setup**

**📱 Complete setup in the dStealth Mini App:**
${this.getDStealthMiniAppLink()}

**After setup, return here and type:**
\`/setup complete\`

**🎯 This unlocks:**
- Anonymous payment links
- Privacy rewards tracking  
- Advanced stealth features
- Balance & transaction history

**Questions?** Type /help for assistance!`;
  }

  // Handle setup complete
  private async handleSetupComplete(senderInboxId: string): Promise<string> {
    try {
      const userData = await agentDb.getStealthDataByUser(senderInboxId);
      
      if (!userData || !userData.fkeyId) {
        return `❌ **Setup not found**

Please tell me your fkey.id username first, then complete the mini app setup.

Need help? Type "help" for instructions.`;
      }

      // Update setup status
      await agentDb.updateStealthDataByUser(senderInboxId, {
        setupStatus: 'complete',
        lastUpdated: Date.now()
      });

      return this.getSetupCompleteMessage(userData);
      
    } catch (error) {
      console.error('Error handling setup complete:', error);
      return `❌ **Error updating setup status**

Please try again or type /help for assistance.`;
    }
  }

  // Handle fkey lookup command
  private async handleFkeyLookup(fkeyId: string, senderInboxId: string): Promise<string> {
    try {
      const lookupResult = await this.apiClient.lookupFkey(fkeyId);
      
      if (!lookupResult.success) {
        return `❌ **FluidKey ID not found**: ${fkeyId}

Please check the spelling or try a different username.`;
      }

      return `🔍 **FluidKey Lookup Results**

**🔑 fkey.id**: ${fkeyId}
**🏠 Stealth Address**: ${lookupResult.stealthAddress || 'Not available'}
**✅ Status**: Registered
**🏆 Privacy Score**: ${lookupResult.privacyScore || 'Not analyzed'}

Type "/scan ${lookupResult.stealthAddress}" to analyze this address!`;

    } catch (error) {
      return `❌ **Lookup failed**\nPlease try again or type /help for assistance.`;
    }
  }

  // Get existing user welcome
  private getExistingUserWelcome(userData: UserStealthData): string {
    return `🎉 **Welcome back, ${userData.fkeyId}!** 

**🏠 Your Stealth Address**: ${userData.stealthAddress}
**✅ Setup Status**: Complete

**💳 Quick Actions:**
• **"create payment link for $X"** - Generate anonymous payment links
• **/balance** - Check your stealth address balance
• **/links** - View your payment links
• **/scan <address>** - Analyze any address

**🎯 Ready to earn privacy rewards?**
Try: "create payment link for $10"

Type **/help** for all commands!`;
  }

  // Get setup complete message
  private getSetupCompleteMessage(userData: UserStealthData): string {
    return `🎉 **Welcome to the full dStealth experience!**

✅ **Setup Complete**: ${userData.fkeyId}
🏠 **Stealth Address**: ${userData.stealthAddress}

**🔓 All Features Unlocked:**
💳 **Payment Links**: "create payment link for $5"
🔍 **Advanced Scanning**: /scan <address>  
📊 **Your Links**: /links
💰 **Balance Tracking**: /balance
🏆 **Privacy Rewards**: /rewards
📡 **Proxy402 Content**: /create content

**🎯 Start Earning Privacy Rewards:**
- Generate anonymous payment links
- Use stealth addresses for transactions
- Complete privacy challenges
- Build your FluidKey Score

**Try this**: "create a payment link for $10" to get started!

**Need help?** Type /help for full command list.`;
  }

  // 🔥 FIXED: Get dStealth mini app link with proper production URL
  private getDStealthMiniAppLink(): string {
    // 🌍 Production environment detection
    const isProduction = process.env.NODE_ENV === 'production' || 
                        process.env.RENDER || 
                        process.env.VERCEL;
    
    // 🔧 Environment-specific URL selection
    if (isProduction) {
      // ✅ Production: Always use dstealth.xyz
      return 'https://dstealth.xyz';
    } else {
      // 🔧 Development: Use localhost
      return env.FRONTEND_URL || process.env.NEXT_PUBLIC_URL || 'http://localhost:3000';
    }
  }
}

// Export the agent instance
export const dStealthAgent = new DStealthAgent();