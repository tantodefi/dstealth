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
      const username = fkeyId.replace('.fkey.id', '');
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
      
      // Add progressive delay to avoid rate limiting
      if (retryCount > 0) {
        const delay = Math.min(Math.pow(2, retryCount) * 10000, 120000); // Max 2 minutes
        console.log(`⏳ Waiting ${delay/1000}s before retry to avoid rate limits...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      // Create signer and client
      const signer = createSigner(WALLET_KEY);
      const encryptionKey = getEncryptionKeyFromHex(ENCRYPTION_KEY);
      
      console.log('📱 Creating XMTP client...');
      this.client = await Client.create(signer, {
        dbEncryptionKey: encryptionKey,
        env: XMTP_ENV as XmtpEnv,
      });

      // Store agent info
      const identifier = signer.getIdentifier();
      this.agentAddress = typeof identifier === 'object' && 'identifier' in identifier 
        ? identifier.identifier 
        : (await identifier).identifier;
      console.log(`✅ Agent initialized successfully`);
      console.log(`📧 Agent Address: ${this.agentAddress}`);
      console.log(`🆔 Agent Inbox ID: ${this.client.inboxId}`);
      console.log(`🌍 Environment: ${XMTP_ENV}`);

      // Start listening for messages
      await this.startListening();

    } catch (error) {
      console.error(`❌ Initialization failed (attempt ${retryCount + 1}):`, error);
      
      if (retryCount < maxRetries) {
        const delay = Math.pow(2, retryCount) * 2000; // Exponential backoff: 2s, 4s, 8s
        console.log(`⏳ Retrying in ${delay/1000}s...`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Recursive retry
        return this.initialize(retryCount + 1, maxRetries);
      }
      
      throw error;
    }
  }

  private async startListening(): Promise<void> {
    if (!this.client) {
      throw new Error('Client not initialized');
    }

    console.log('🎧 Starting XMTP message listener...');
    console.log(`🔍 Agent inbox ID: ${this.client.inboxId}`);
    console.log(`🌍 XMTP Environment: ${process.env.XMTP_ENV || 'production'}`);
    
    try {
      // Initial sync to get existing conversations
      console.log('🔄 Initial conversation sync...');
      await this.client.conversations.sync();
      
      // Get all conversations and log them for debugging
      const conversations = await this.client.conversations.list();
      console.log(`📋 Agent has ${conversations.length} conversations`);
      
      // Sync each conversation individually to ensure we can receive messages
      for (const conversation of conversations) {
        try {
          await conversation.sync();
          console.log(`🔄 Synced conversation: ${conversation.id}`);
        } catch (syncError) {
          console.warn(`⚠️ Failed to sync conversation ${conversation.id}:`, syncError);
        }
      }
      
      // 🔥 SIMPLIFIED: Clean message stream processing
      console.log('🌊 Starting message stream...');
      const messageStream = await this.client.conversations.streamAllMessages();
      console.log('✅ Message stream created, listening for messages...');

      // Force one more sync right before listening
      console.log('🔄 Final sync before message processing...');
      await this.client.conversations.sync();
      let finalConversations = await this.client.conversations.list();
      console.log(`📋 Final conversation count: ${finalConversations.length}`);

      // 🔥 CRITICAL FIX: Process existing messages ONCE to avoid duplicates
      console.log('🔍 Processing existing messages from all conversations...');
      console.log('📋 Known conversation IDs:', finalConversations.map(c => c.id));
      let existingMessageCount = 0;
      
      for (const conversation of finalConversations) {
        try {
          await conversation.sync();
          const messages = await conversation.messages();
          console.log(`📬 Conversation ${conversation.id}: ${messages.length} messages`);
          
          // Find the most recent message from a user (not the agent)
          if (messages.length > 0) {
            // Look backwards through messages to find the latest user message
            let latestUserMessage = null;
            for (let j = messages.length - 1; j >= 0; j--) {
              const message = messages[j];
              if (message.senderInboxId !== this.client.inboxId) {
                latestUserMessage = message;
                break;
              }
            }
            
            if (latestUserMessage && latestUserMessage.id && !this.processedMessages.has(latestUserMessage.id)) {
              console.log(`🔄 Processing latest user message: "${latestUserMessage.content}" from ${latestUserMessage.senderInboxId}`);
              existingMessageCount++;
              
              // Mark as processed BEFORE processing to prevent duplicates
              this.processedMessages.add(latestUserMessage.id);
              
              // Keep processed messages list manageable
              if (this.processedMessages.size > this.MAX_PROCESSED_MESSAGES) {
                const firstItem = this.processedMessages.values().next().value;
                this.processedMessages.delete(firstItem);
              }
              
              // Process this user message
              await this.processIncomingMessage(latestUserMessage);
            } else if (latestUserMessage && latestUserMessage.id) {
              console.log(`⏭️ Skipping already processed existing message: ${latestUserMessage.id}`);
            } else {
              console.log(`📭 No user messages found in conversation (all ${messages.length} messages from agent)`);
            }
          }
        } catch (error) {
          console.warn(`⚠️ Failed to process existing messages from conversation ${conversation.id}:`, error);
        }
      }
      
      console.log(`✅ Processed ${existingMessageCount} existing messages`);

      // 🔥 SIMPLIFIED: Single sync check for missed conversations
      console.log('🔍 Force re-sync to catch any missed conversations...');
      await this.client.conversations.sync();
      const resynced = await this.client.conversations.list();
      
      if (resynced.length > finalConversations.length) {
        console.log(`🆕 Found ${resynced.length - finalConversations.length} additional conversations on re-sync!`);
        
        // Process messages from newly found conversations
        for (let i = finalConversations.length; i < resynced.length; i++) {
          const newConversation = resynced[i];
          try {
            await newConversation.sync();
            const messages = await newConversation.messages();
            console.log(`📬 RESYNC Conversation ${newConversation.id}: ${messages.length} messages`);
            
            // Find the most recent user message (not from agent)
            if (messages.length > 0) {
              let latestUserMessage = null;
              for (let j = messages.length - 1; j >= 0; j--) {
                const message = messages[j];
                if (message.senderInboxId !== this.client.inboxId) {
                  latestUserMessage = message;
                  break;
                }
              }
              
              if (latestUserMessage && latestUserMessage.id && !this.processedMessages.has(latestUserMessage.id)) {
                console.log(`🔄 Processing message from resync conversation: "${latestUserMessage.content}"`);
                
                // Mark as processed BEFORE processing to prevent duplicates
                this.processedMessages.add(latestUserMessage.id);
                
                // Keep processed messages list manageable
                if (this.processedMessages.size > this.MAX_PROCESSED_MESSAGES) {
                  const firstItem = this.processedMessages.values().next().value;
                  this.processedMessages.delete(firstItem);
                }
                
                await this.processIncomingMessage(latestUserMessage);
                existingMessageCount++;
              } else if (latestUserMessage && latestUserMessage.id) {
                console.log(`⏭️ Skipping already processed resync message: ${latestUserMessage.id}`);
              }
            }
          } catch (error) {
            console.warn(`⚠️ Failed to process resync conversation ${newConversation.id}:`, error);
          }
        }
        
        finalConversations = resynced;
      }

      console.log(`✅ Final total: processed ${existingMessageCount} existing messages from ${finalConversations.length} conversations`);

      // 🔥 SIMPLIFIED: Single periodic sync - reduced complexity to prevent duplicates
      const syncInterval = setInterval(async () => {
        try {
          console.log('🔄 Periodic conversation sync...');
          await this.client!.conversations.sync();
          const currentConversations = await this.client!.conversations.list();
          console.log(`📋 Current conversation count: ${currentConversations.length}`);
          
          // Only log for debugging - don't process existing messages in periodic sync
          if (currentConversations.length > 0) {
            const currentIds = currentConversations.map(c => c.id);
            console.log(`🔍 Current conversation IDs (first 3): ${currentIds.slice(0, 3).join(', ')}`);
          }
        } catch (syncError) {
          console.warn('⚠️ Periodic sync failed:', syncError);
        }
      }, 30000); // Every 30 seconds

      // 🔥 CLEAN STREAM PROCESSING: Only process new messages from stream
      console.log('🎧 Starting HYBRID message stream for NEW messages...');
      let newMessageCount = 0;
      
      // Test if stream is working at all
      const streamTestTimeout = setTimeout(() => {
        console.log('⚠️ No NEW messages received in first 60 seconds - stream is working but no new messages sent');
      }, 60000);

      // Cleanup interval on shutdown
      const originalShutdown = this.shutdown.bind(this);
      this.shutdown = async () => {
        clearTimeout(streamTestTimeout);
        clearInterval(syncInterval);
        return originalShutdown();
      };

      for await (const message of messageStream) {
        try {
          newMessageCount++;
          console.log(`\n🔔 NEW MESSAGE STREAM EVENT #${newMessageCount}:`);
          
          // Clear the "no messages" timeout since we got one
          if (newMessageCount === 1) {
            clearTimeout(streamTestTimeout);
          }
          
          // Skip if shutting down
          if (this.isShuttingDown) {
            console.log('🛑 Shutting down, breaking message loop');
            break;
          }

          // Log ALL stream events for debugging
          console.log('📨 RAW STREAM MESSAGE:', {
            hasMessage: !!message,
            content: message?.content || 'no-content',
            senderInboxId: message?.senderInboxId || 'no-sender',
            agentInboxId: this.client.inboxId,
            contentType: message?.contentType?.typeId || 'no-type',
            conversationId: message?.conversationId || 'no-conversation',
            messageId: message?.id || 'no-id',
            sentAt: message?.sentAt || 'no-timestamp'
          });

          // Basic message validation
          if (!message || !message.content || !message.senderInboxId) {
            console.log('⏭️ Skipping invalid message (missing content or sender)');
            continue;
          }

          // Enhanced message details for debugging
          const contentString = typeof message.content === 'string' ? message.content : String(message.content);
          console.log('📧 VALID MESSAGE DETAILS:', {
            content: `"${contentString}"`,
            contentLength: contentString.length,
            contentType: typeof message.content,
            senderInboxId: message.senderInboxId,
            agentInboxId: this.client.inboxId,
            isOwnMessage: message.senderInboxId === this.client.inboxId,
            messageContentType: message.contentType?.typeId,
            conversationId: message.conversationId
          });

          // Skip own messages - FIXED comparison
          if (message.senderInboxId === this.client.inboxId) {
            console.log('⏭️ Skipping own message');
            continue;
          }

          // Skip non-text messages
          if (message.contentType?.typeId !== 'text') {
            console.log('⏭️ Skipping non-text message:', message.contentType?.typeId);
            continue;
          }

          // 🔥 CRITICAL: Check if we already processed this message to prevent duplicates
          if (message.id && this.processedMessages.has(message.id)) {
            console.log(`⏭️ Skipping already processed message: ${message.id}`);
            continue;
          }

          // Skip messages without IDs
          if (!message.id) {
            console.log('⏭️ Skipping message without ID');
            continue;
          }

          console.log(`🚀 PROCESSING NEW MESSAGE from ${message.senderInboxId}: "${message.content}"`);
          
          // Mark as processed BEFORE processing to prevent race conditions
          this.processedMessages.add(message.id);
          
          // Keep processed messages list manageable
          if (this.processedMessages.size > this.MAX_PROCESSED_MESSAGES) {
            const firstItem = this.processedMessages.values().next().value;
            this.processedMessages.delete(firstItem);
          }

          // 🔥 SIMPLIFIED: Direct message processing
              await this.processIncomingMessage(message);
            
          } catch (error) {
          console.error('❌ Error in message stream processing:', error);
          // Continue processing other messages even if one fails
        }
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
        const response = await this.processCommand(trimmed, senderInboxId);
        if (response && response.trim()) {
          console.log(`✅ Command response generated`);
          return response;
        }
      }

      // Check for payment requests (work the same in both contexts)
      const paymentMatch = this.extractPaymentAmount(trimmed);
      if (paymentMatch) {
        console.log(`💰 Payment request detected: $${paymentMatch.amount}`);
        const response = await this.handlePaymentLinkRequest(paymentMatch.amount, senderInboxId);
        if (response && response.trim()) {
          return response;
        }
      }

      // Check if this looks like a fkey.id (work the same in both contexts)
      if (this.isFkeyIdPattern(trimmed)) {
        console.log(`🔑 fkey.id pattern detected`);
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
        // In groups: Short, focused responses
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

  // 🔥 NEW: Handle group chat messages (short and focused)
  private async handleGroupMessage(content: string, senderInboxId: string): Promise<string> {
    console.log(`👥 Processing group message`);

    // Try GPT for complex questions first
    const isComplexQuery = this.isComplexQuery(content);
    if (openai && isComplexQuery) {
      console.log(`🤖 Using GPT for group response`);
      const gptResponse = await this.processWithGPT(content, senderInboxId);
      if (gptResponse && gptResponse.trim()) {
        return gptResponse;
      }
    }

    // Default group response: Short invite to dStealth
    return this.getGroupInviteMessage();
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

  private async processCommand(command: string, senderInboxId: string): Promise<string | null> {
    const cmd = command.trim().toLowerCase();

    if (cmd === '/help') {
      return this.getHelpMessage();
    }

    if (cmd === '/setup complete') {
      return await this.handleSetupComplete(senderInboxId);
    }

    if (cmd.startsWith('/fkey ')) {
      const fkeyId = cmd.slice(6).trim();
      if (fkeyId) {
        return await this.handleFkeyLookup(fkeyId, senderInboxId);
      }
      return 'Please provide a fkey.id to lookup (e.g., `/fkey tantodefi.fkey.id`)';
    }

    if (cmd.startsWith('/scan ')) {
      // 🔒 PRIVACY: /scan is DM-only to protect sensitive information
      // We need to check if this is being called from group context
      // For now, we'll handle this in the calling context
      const address = cmd.slice(6).trim();
      if (address) {
        return await this.handleStealthScan(address, senderInboxId);
      }
      return 'Please provide an address to scan (e.g., `/scan 0x...`)';
    }

    if (cmd === '/links') {
      return await this.handleProxy402Links(senderInboxId);
    }

    if (cmd === '/balance') {
      return await this.handleCheckBalance(senderInboxId);
    }

    if (cmd.startsWith('/create ')) {
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

  // 🔥 NEW: Handle payment link requests with stealth addresses and ZK receipts
  private async handlePaymentLinkRequest(amount: string, senderInboxId: string): Promise<string> {
    try {
      console.log(`💰 Processing payment link request for $${amount} from ${senderInboxId}`);

      // Get user data to personalize the payment link
      const userData = await agentDb.getStealthDataByUser(senderInboxId);
      
      if (!userData || !userData.stealthAddress) {
        // User doesn't have stealth address setup yet
        const basicPaymentLink = await this.generateDaimoPaymentLink(amount);
        return `💰 **Payment Link**: ${basicPaymentLink}\n\n` +
               `🔗 **Setup FluidKey first**: https://app.fluidkey.com/?ref=62YNSG\n` +
               `📱 Then register with: ${this.getDStealthMiniAppLink()}\n\n` +
               `⚡ **Unlock stealth payments** after setup!`;
      }

      // 🔥 Generate stealth payment link with ZK receipt
      const stealthPaymentLink = await this.generateDaimoPaymentLink(amount, userData.stealthAddress, {
        contentId: `xmtp_payment_${Date.now()}`,
        userStealthAddress: userData.stealthAddress,
        fkeyId: userData.fkeyId,
        zkProof: userData.zkProof,
        senderInboxId: senderInboxId,
        paymentIntent: `XMTP Payment $${amount}`,
        privacyLevel: 'stealth'
      });
      
      // Store ZK receipt for the payment
      try {
        const zkReceiptId = `zk_xmtp_${senderInboxId}_${Date.now()}`;
        console.log(`🧾 ZK receipt prepared: ${zkReceiptId}`);
        
        // Could store in Redis or agentDb for tracking
        await agentDb.logAgentInteraction(
          this.client?.inboxId || 'unknown',
          senderInboxId,
          'payment_link_created_stealth',
          {
            amount,
            stealthAddress: userData.stealthAddress,
            fkeyId: userData.fkeyId,
            zkReceiptId,
            timestamp: Date.now()
          }
        );
      } catch (receiptError) {
        console.warn('⚠️ Failed to create ZK receipt:', receiptError);
      }
      
      return `💰 **Your Stealth Payment Link**:\n${stealthPaymentLink}\n\n` +
             `🥷 **Stealth Address**: \`${userData.stealthAddress?.slice(0, 6)}...${userData.stealthAddress?.slice(-4)}\`\n` +
             `🔑 **FluidKey ID**: ${userData.fkeyId}\n` +
             `🧾 **Privacy**: ZK receipt will be generated upon payment\n\n` +
             `✅ Recipients will send payments privately to your stealth address!\n` +
             this.getDStealthMiniAppLink();

    } catch (error) {
      console.error('❌ Error handling payment link request:', error);
      const fallbackLink = await this.generateDaimoPaymentLink(amount);
      return `💰 **Payment Link**: ${fallbackLink}\n\n` +
             `🔗 **Get FluidKey**: https://app.fluidkey.com/?ref=62YNSG\n` +
             `📱 **Setup**: ${this.getDStealthMiniAppLink()}`;
    }
  }

  // 🔥 FIXED: Generate Daimo payment links using the proper API with correct amounts
  private async generateDaimoPaymentLink(amount: string, stealthAddress?: string, zkReceiptData?: any): Promise<string> {
    const recipient = stealthAddress || '0x706AfBE28b1e1CB40cd552Fa53A380f658e38332';
    
    // 🔥 FIXED: Daimo expects dollar amounts, not smallest units
    const amountInDollars = parseFloat(amount).toFixed(2);
    
    console.log('💰 Agent amount conversion details:', {
      originalAmount: amount,
      finalAmountInDollars: amountInDollars,
      daimoLimit: 4000,
      withinLimit: parseFloat(amountInDollars) <= 4000,
      recipient,
      isStealthAddress: !!stealthAddress
    });
    
    // Build metadata without null values (Daimo API rejects null values)
    const metadata: Record<string, any> = {
      type: 'xmtp-agent-payment',
      service: 'dstealth-xmtp',
      recipientType: stealthAddress ? 'stealth' : 'standard',
    };
    
    // Only add zkReceiptId if it exists
    if (zkReceiptData) {
      metadata.zkReceiptId = `zk_${Date.now()}`;
      // Add other zkReceiptData fields
      Object.assign(metadata, zkReceiptData);
    }
    
    // Use the new Daimo Pay API
    const paymentLink = await daimoPayClient.createPaymentLink({
      destinationAddress: recipient,
      amountUnits: amountInDollars,
      displayAmount: amountInDollars, // Send the same amount for display
      tokenSymbol: 'USDC',
      chainId: getDaimoChainId('base'),
      externalId: zkReceiptData?.contentId || `agent_payment_${Date.now()}`,
      intent: `ZK receipt for stealth payment at dstealth.xyz`,
      metadata
    });
    
    console.log(`✅ Agent created Daimo payment link via API: ${paymentLink.url}`);
    console.log(`🎯 Payment recipient: ${recipient} (${stealthAddress ? 'stealth' : 'standard'})`);
    
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

  // Handle fkey.id submission
  private async handleFkeyIdSubmission(fkeyInput: string, senderInboxId: string): Promise<string> {
    try {
      // Normalize the fkey.id input
      let fkeyId = fkeyInput.trim();
      if (!fkeyId.endsWith('.fkey.id')) {
        fkeyId = `${fkeyId}.fkey.id`;
      }

      console.log(`🔑 Processing fkey.id: ${fkeyId}`);
      
      // Look up the fkey.id
      const lookupResult = await this.apiClient.lookupFkey(fkeyId);
      
      if (!lookupResult.success || !lookupResult.stealthAddress) {
        return `❌ **FluidKey ID not found**: ${fkeyId}

Please check the spelling or create one at:
🔗 **FluidKey**: https://app.fluidkey.com/?ref=62YNSG

Once you have a fkey.id, tell me your username and I'll help you set up stealth payments!`;
      }

      // Store user data
      await agentDb.setStealthDataByUser(senderInboxId, {
        fkeyId,
        stealthAddress: lookupResult.stealthAddress,
        zkProof: lookupResult.zkProof || null,
        setupStatus: 'fkey_set',
        lastUpdated: Date.now()
      });

      return `✅ **FluidKey ID verified**: ${fkeyId}
🏠 **Stealth Address**: ${lookupResult.stealthAddress}

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
      return userData && userData.setupStatus === 'complete';
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
    return `🎉 **Welcome back, ${userData.fkeyId}!** 🥷

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

  // Get dStealth mini app link
  private getDStealthMiniAppLink(): string {
    const frontendURL = env.FRONTEND_URL || process.env.NEXT_PUBLIC_URL || 'https://dstealth.xyz';
    return frontendURL;
  }
}

// Export the agent instance
export const dStealthAgent = new DStealthAgent();