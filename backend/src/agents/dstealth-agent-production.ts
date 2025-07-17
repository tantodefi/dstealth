/**
 * Production dStealth Agent with Action Button Support
 * 
 * Core Features:
 * 1. FluidKey signup with referral code  
 * 2. fkey.id setting and management
 * 3. Payment link generation + ZK receipts
 * 4. Coinbase Wallet action buttons (Actions/Intent support)
 * 5. Smart group chat behavior with @mentions
 */

import { agentDb, UserStealthData } from '../lib/agent-database.js';
import { daimoPayClient } from '../lib/daimo-pay.js';
import { createSigner, getEncryptionKeyFromHex } from '../helper.js';
import { resolvePrimaryFromXMTP, createStealthDataWithPrimaryAddress } from '../lib/primary-address-resolver.js';
import { Group, Client, type XmtpEnv } from '@xmtp/node-sdk';
import { 
  ReactionCodec, 
  type Reaction,
  ContentTypeReaction
} from '@xmtp/content-type-reaction';
import {
  WalletSendCallsCodec,
  ContentTypeWalletSendCalls,
  type WalletSendCallsParams,
} from "@xmtp/content-type-wallet-send-calls";
import {
  TransactionReferenceCodec,
  ContentTypeTransactionReference,
  type TransactionReference
} from "@xmtp/content-type-transaction-reference";
import {
  type ContentCodec,
  ContentTypeId,
  type EncodedContent,
} from "@xmtp/content-type-primitives";

// Import Redis for ZK receipt storage
import { Redis } from "@upstash/redis";
import { env } from '../config/env.js';

// Get Redis instance for ZK receipt storage
let redis: Redis | null = null;
try {
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
} catch (error) {
  console.warn('⚠️ Failed to initialize Redis for ZK receipts:', error);
}

// Farcaster integration imports
import { ethers } from 'ethers';

// Farcaster API configuration
const COINBASE_API_ENDPOINT = 'https://api.wallet.coinbase.com/rpc/v2/giftlink/fetchIdentityFromAddress';
const NEYNAR_API_BASE = 'https://api.neynar.com/v2';

// Farcaster integration types
interface FarcasterUser {
  fid: number;
  username: string;
  displayName: string;
  avatarUrl: string;
  verified: boolean;
  custodyAddress: string;
  verifiedAddresses: string[];
  bio?: string;
  followerCount?: number;
  followingCount?: number;
}

interface CoinbaseIdentityResponse {
  fid: number;
  username: string;
  displayName: string;
  avatarUrl: string;
}

interface NeynarUserResponse {
  users: {
    fid: number;
    username: string;
    display_name: string;
    pfp_url: string;
    verified: boolean;
    custody_address: string;
    verified_addresses: {
      eth_addresses: string[];
    };
    profile: {
      bio: {
        text: string;
      };
    };
    follower_count: number;
    following_count: number;
  }[];

}

interface NeynarFollowersResponse {
  users: {
    fid: number;
    username: string;
    display_name: string;
    pfp_url: string;
    verified: boolean;
    custody_address: string;
    verified_addresses: {
      eth_addresses: string[];
    };
    profile: {
      bio: {
        text: string;
      };
    };
    follower_count: number;
    following_count: number;
  }[];
  next: {
    cursor: string;
} | null;
}

interface UserSearchResult {
  fid: number;
  username: string;
  displayName: string;
  avatarUrl: string;
  verified: boolean;
  walletAddress: string;
  fkeyId?: string;
  hasFkey: boolean;

}// Action button content types (from working example)
export const ContentTypeActions = new ContentTypeId({
  authorityId: 'coinbase.com',
  typeId: 'actions',
  versionMajor: 1,
  versionMinor: 0,
});

export const ContentTypeIntent = new ContentTypeId({
  authorityId: 'coinbase.com',
  typeId: 'intent',
  versionMajor: 1,
  versionMinor: 0,
});

// Action button types (from working example)
interface Action {
  id: string;
  label: string;
  imageUrl?: string;
  style?: 'primary' | 'secondary' | 'danger';
  expiresAt?: string;
}
interface ActionsContent {
  id: string;
  description: string;
  actions: Action[];
  expiresAt?: string;

}interface IntentContent {
  id: string;
  actionId: string;
  metadata?: Record<string, string | number | boolean | null>;

}// Action button codecs (from working example)
export class ActionsCodec implements ContentCodec<ActionsContent> {
  get contentType(): ContentTypeId {
    return ContentTypeActions;
  }

  encode(content: ActionsContent): EncodedContent {
    return {
      type: ContentTypeActions,
      parameters: { encoding: 'UTF-8' },
      content: new TextEncoder().encode(JSON.stringify(content)),
    };
  }

  decode(content: EncodedContent): ActionsContent {
    const encoding = content.parameters.encoding;
    if (encoding && encoding !== 'UTF-8') {
      throw new Error(`Unsupported encoding: ${encoding}`);
    }
    return JSON.parse(new TextDecoder().decode(content.content));
  }

  fallback(content: ActionsContent): string {
    const actionList = content.actions
      .map((action, index) => `[${index + 1}] ${action.label}`)
      .join('\n');
    return `${content.description}\n\n${actionList}\n\nReply with the number to select`;
  }

  shouldPush(): boolean {
    return true;
}  }

export class IntentCodec implements ContentCodec<IntentContent> {
  get contentType(): ContentTypeId {
    return ContentTypeIntent;
  }

  encode(content: IntentContent): EncodedContent {
    return {
      type: ContentTypeIntent,
      parameters: { encoding: 'UTF-8' },
      content: new TextEncoder().encode(JSON.stringify(content)),
    };
  }

  decode(content: EncodedContent): IntentContent {
    const encoding = content.parameters.encoding;
    if (encoding && encoding !== 'UTF-8') {
      throw new Error(`Unsupported encoding: ${encoding}`);
    }
    return JSON.parse(new TextDecoder().decode(content.content));
  }

  fallback(content: IntentContent): string {
    return `Intent: ${content.actionId}`;
  }

  shouldPush(): boolean {
    return true;
  }
}
/**
 * Production dStealth Agent with action button support
 */
export class DStealthAgentProduction {
  private client: Client<any> | null = null;
  private agentAddress: string | null = null;
  private processedMessageCount = 0;
  private groupIntroductions: Set<string> = new Set();
  private streamRestartCount = 0;
  private installationCount = 0;

  // Track recent action set IDs for each user (allow last 3 sets to be valid)
  private userRecentActionSets: Map<string, string[]> = new Map();
  private readonly MAX_VALID_ACTION_SETS = 3;

  // Track processed intent messages to prevent duplicates
  private processedIntentIds: Set<string> = new Set();

  // Track users who have seen the welcome message to prevent spam
  private userWelcomesSent: Set<string> = new Set();

  // Track users in fkey.id confirmation flow
  private userConfirmationPending: Map<string, {fkeyId: string, timestamp: number}> = new Map();

  // Farcaster context cache
  private farcasterUserCache: Map<string, FarcasterUser> = new Map();

  // Configuration
  private readonly FLUIDKEY_REFERRAL_URL = "https://app.fluidkey.com/?ref=62YNSG";
  private readonly DSTEALTH_APP_URL = "https://dstealth.xyz";
  private readonly OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  private readonly COINBASE_API_PRIVATE_KEY = process.env.COINBASE_API_PRIVATE_KEY;
  private readonly NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;
  private readonly NEYNAR_SPONSOR_WALLET_ID = process.env.NEYNAR_SPONSOR_WALLET_ID;
  private readonly NEYNAR_SPONSOR_ADDRESS = process.env.NEYNAR_SPONSOR_ADDRESS;

  /**
   * Create and start the dStealth Agent
   */
  static async createAndStart(
    config: any,
    streamFailureCallback?: any,
  ): Promise<DStealthAgentProduction> {
    console.log("🚀 Starting dStealth Agent with action button support");
    const agent = new DStealthAgentProduction();
    await agent.initialize(config, streamFailureCallback);
    return agent;
  }

  /**
   * Initialize agent with action button support
   */
  private async initialize(config: any, streamFailureCallback?: any): Promise<void> {
    try {
      console.log("🤖 Initializing dStealth Agent with action button support...");

      // Create XMTP client with action button codecs (from working example)
      const signer = createSigner(config.walletKey);
      const dbEncryptionKey = getEncryptionKeyFromHex(config.encryptionKey);
      
      console.log("🔧 Registering action button codecs:");
      console.log("   - coinbase.com/actions:1.0");
      console.log("   - coinbase.com/intent:1.0");
      console.log("   - xmtp.org/reaction:1.0");
      
      // Create client with codecs for action buttons
      this.client = await Client.create(signer, {
        dbEncryptionKey,
        env: config.env as XmtpEnv,
        dbPath: config.dbPath,
        codecs: [new ActionsCodec(), new IntentCodec(), new ReactionCodec(), new WalletSendCallsCodec(), new TransactionReferenceCodec()],
      });

      const identifier = await signer.getIdentifier();
      this.agentAddress = identifier.identifier;

      console.log(`📧 Agent Address: ${this.agentAddress}`);
      console.log(`🆔 Agent Inbox ID: ${this.client!.inboxId}`);

      // Sync conversations
      console.log("🔄 Syncing conversations...");
      await this.client!.conversations.sync();

      // Start message streaming
      this.startMessageStream(streamFailureCallback);

      console.log("✅ dStealth Agent initialized with action button support");
    } catch (error) {
      console.error("❌ Failed to initialize dStealth Agent:", error);
      throw error;
    }
  }

  /**
   * Start message streaming (from working example pattern)
   */
  private async startMessageStream(streamFailureCallback?: any): Promise<void> {
    if (!this.client) return;

    console.log("👂 Listening for messages...");
    
    // Keep the agent running with proper error handling (from working example)
    while (true) {
      try {
        const stream = await this.client.conversations.streamAllMessages();

        for await (const message of stream) {
          try {
            // Skip messages from the agent itself
            if (!message || message.senderInboxId.toLowerCase() === this.client.inboxId.toLowerCase()) {
              continue;
            }

            console.log(`📨 Received: ${message.contentType?.typeId} from ${message.senderInboxId}`);

            const conversation = await this.client.conversations.getConversationById(
              message.conversationId
            );

            if (!conversation) {
              console.log("❌ Unable to find conversation, skipping");
              continue;
            }

            // Process message with contentType detection (key for action buttons)
            await this.processMessage(message, conversation);

          } catch (messageError: unknown) {
            const errorMessage = messageError instanceof Error ? messageError.message : String(messageError);
            console.error("❌ Error processing individual message:", errorMessage);
          }
        }
      } catch (streamError: unknown) {
        const errorMessage = streamError instanceof Error ? streamError.message : String(streamError);
        console.error("❌ Stream error:", errorMessage);
        
        // Auto-restart
        console.log("🔄 Reconnecting in 5 seconds...");
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        try {
          await this.client.conversations.sync();
        } catch (syncError) {
          console.error("❌ Failed to sync conversations:", syncError);
        }
      }
    }
  }

  /**
   * Process messages with action button support (key method from working example)
   */
  private async processMessage(message: any, conversation: any): Promise<void> {
    try {
      if (!this.client) return;

              this.processedMessageCount++;

      // Get sender info
      const inboxState = await this.client.preferences.inboxStateFromInboxIds([
        message.senderInboxId,
      ]);
      const senderAddress = inboxState[0]?.identifiers[0]?.identifier;
      const senderInboxId = message.senderInboxId;

      // 🔧 NEW: Get Farcaster context for sender (async, non-blocking)
      let farcasterContext: FarcasterUser | null = null;
      if (senderAddress) {
        try {
          farcasterContext = await this.getFarcasterContext(senderAddress);
          if (farcasterContext) {
            console.log(`🎭 Farcaster context: @${farcasterContext.username} (${farcasterContext.displayName})`);
          }
        } catch (error) {
          console.warn('⚠️ Failed to get Farcaster context:', error);
        }
      }

      // CRITICAL: Handle Intent messages from action buttons (from working example)
      if (message.contentType?.typeId === "intent") {
        console.log("🎯 Intent message detected - action button was clicked!");
        console.log("📋 Intent content:", JSON.stringify(message.content, null, 2));
        
        const intent = message.content as IntentContent;
        const response = await this.handleIntentMessage(intent, senderInboxId);
        if (response) {
          await conversation.send(response);
          console.log("✅ Intent response sent");
        }
        return;
      }

      // Handle transaction reference messages (from tba-chat-example-bot pattern)
      if (message.contentType?.typeId === "transactionReference") {
        console.log("🧾 Transaction reference message detected - processing ZK receipt!");
        console.log("📋 Transaction reference content:", JSON.stringify(message.content, null, 2));
        
        const transactionRef = message.content as TransactionReference;
        const response = await this.handleTransactionReference(transactionRef, senderInboxId, senderAddress);
        if (response) {
          await conversation.send(response);
          console.log("✅ Transaction reference response sent");
        }
        return;
      }

      // Handle text messages  
      if (message.contentType?.typeId === "text") {
        // Send ninja reaction
        try {
          const reaction: Reaction = {
            reference: message.id,
            action: "added",
            content: "🥷",
            schema: "unicode"
          };
          await conversation.send(reaction, ContentTypeReaction);
        } catch (reactionError) {
          console.error("⚠️ Failed to send ninja reaction:", reactionError);
        }

        // Check if message should be processed
        const isGroup = conversation instanceof Group;
        const shouldProcess = await this.shouldProcessMessage(
          message.content,
          senderInboxId,
          isGroup,
          conversation.id,
          message
        );

        if (!shouldProcess) {
          return;
        }

        // Process the message with our dStealth logic
        const response = await this.processTextMessage(message.content, senderInboxId, isGroup, conversation, farcasterContext);
        if (response) {
          await conversation.send(response);
        }
        return;
      }

    } catch (error) {
      console.error("❌ Error processing message:", error);
    }
  }

  /**
   * Process text messages with dStealth agent logic
   */
  private async processTextMessage(messageContent: string, senderInboxId: string, isGroup: boolean, conversation?: any, farcasterContext?: FarcasterUser | null): Promise<string | undefined> {
    try {
      console.log(`📝 Processing text message: "${messageContent}" from ${senderInboxId}`);
      
      // Handle ping command first (works for all users in DMs)
      if (messageContent.trim().toLowerCase() === "ping" && !isGroup) {
        return "ok";
      }
      
      // Handle fkey.id setting commands
      if (this.isFkeySetCommand(messageContent)) {
        return await this.handleFkeySetCommand(messageContent, senderInboxId, isGroup);
      }

      // Handle fkey status queries
      if (this.isFkeyStatusQuery(messageContent)) {
        return await this.handleFkeyStatusQuery(senderInboxId, isGroup);
      }

      // Handle commands (starts with /)
      if (messageContent.startsWith('/')) {
        return await this.handleCommand(messageContent, senderInboxId, isGroup, conversation);
      }

      // Handle payment amount requests
      const paymentAmount = this.extractPaymentAmount(messageContent);
      if (paymentAmount) {
        return await this.handlePaymentRequest(paymentAmount, senderInboxId, conversation?.id, isGroup, conversation);
      }

      // Handle fkey.id pattern (e.g., "tantodefi.fkey.id")
      if (this.isFkeyIdPattern(messageContent)) {
        return await this.handleFkeyIdSubmission(messageContent, senderInboxId, conversation);
      }

      // Handle general messages with OpenAI or basic responses
      return await this.processGeneralMessage(messageContent, senderInboxId, isGroup, conversation, farcasterContext);

    } catch (error) {
      console.error("❌ Error processing text message:", error);
      return "❌ Error processing your message. Please try again.";
    }
  }

  /**
   * Get client for action button methods
   */
  getClient(): Client<any> | null {
    return this.client;
  }

  /**
   * Get the agent's wallet address
   */
  getAgentAddress(): string | null {
    return this.agentAddress;
  }

  /**
   * Get agent contact information
   */
  getContactInfo(): { address: string | null; inboxId: string | null } {
    return {
      address: this.agentAddress,
      inboxId: this.client?.inboxId || null
    };
  }

  /**
   * Check if the agent is connected
   */
  isConnected(): boolean {
    return this.client !== null;
  }

  getStatus() {
    return {
      isRunning: this.client !== null,
      processedMessages: this.processedMessageCount,
      streamRestartCount: this.streamRestartCount,
      installationCount: this.installationCount,
      groupIntroductions: this.groupIntroductions.size,
      userWelcomesSent: this.userWelcomesSent.size,
      processedIntents: this.processedIntentIds.size,
      farcasterCacheSize: this.farcasterUserCache.size
    };
  }

  /**
   * 🔧 NEW: Coinbase API - Generate auth signature for API request
   */
  private async generateCoinbaseAuthSignature(
    walletAddress: string,
    timestamp: number,
    privateKey: string
  ): Promise<string> {
    try {
      const wallet = new ethers.Wallet(privateKey);
      const message = `${walletAddress}${timestamp}`;
      return await wallet.signMessage(message);
    } catch (error) {
      console.error('Error generating Coinbase auth signature:', error);
      throw error;
    }
  }

  /**
   * 🔧 NEW: Coinbase API - Fetch FID from wallet address
   */
  private async fetchFIDFromWalletAddress(walletAddress: string): Promise<CoinbaseIdentityResponse | null> {
    try {
      if (!this.COINBASE_API_PRIVATE_KEY) {
        console.warn('⚠️ COINBASE_API_PRIVATE_KEY not configured');
        return null;
      }

      console.log(`🔍 Fetching FID for wallet: ${walletAddress}`);

      const timestamp = Math.floor(Date.now() / 1000);
      const authSignature = await this.generateCoinbaseAuthSignature(
        walletAddress,
        timestamp,
        this.COINBASE_API_PRIVATE_KEY
      );

      const requestPayload = {
        wallet_address: walletAddress,
        auth_signature: authSignature,
        timestamp_secs: timestamp
      };

      const response = await fetch(COINBASE_API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestPayload)
      });

      if (!response.ok) {
        console.log(`❌ Coinbase API error: ${response.status}`);
        return null;
      }

      const data = await response.json() as CoinbaseIdentityResponse;
      console.log(`✅ Found FID ${data.fid} for wallet ${walletAddress}`);
      return data;

    } catch (error) {
      console.error('Error fetching FID from Coinbase API:', error);
      return null;
    }
  }

  /**
   * 🔧 NEW: Neynar API - Fetch user data by FID
   */
  private async fetchNeynarUserData(fid: number): Promise<FarcasterUser | null> {
    try {
      if (!this.NEYNAR_API_KEY) {
        console.warn('⚠️ NEYNAR_API_KEY not configured');
        return null;
      }

      console.log(`🔍 Fetching Neynar data for FID: ${fid}`);

      const response = await fetch(`${NEYNAR_API_BASE}/farcaster/user/bulk?fids=${fid}`, {
        headers: {
          'api_key': this.NEYNAR_API_KEY
        }
      });

      if (!response.ok) {
        console.log(`❌ Neynar API error: ${response.status}`);
        return null;
      }

      const data = await response.json() as NeynarUserResponse;
      
      if (!data.users || data.users.length === 0) {
        console.log(`❌ No user data found for FID: ${fid}`);
        return null;
      }

      const user = data.users[0];
      const farcasterUser: FarcasterUser = {
        fid: user.fid,
        username: user.username,
        displayName: user.display_name,
        avatarUrl: user.pfp_url,
        verified: user.verified,
        custodyAddress: user.custody_address,
        verifiedAddresses: user.verified_addresses?.eth_addresses || [],
        bio: user.profile?.bio?.text,
        followerCount: user.follower_count,
        followingCount: user.following_count
      };

      console.log(`✅ Found Farcaster user: @${farcasterUser.username} (${farcasterUser.displayName})`);
      return farcasterUser;

    } catch (error) {
      console.error('Error fetching Neynar user data:', error);
      return null;
    }
  }

  /**
   * 🔧 NEW: Get comprehensive Farcaster context for user
   */
  private async getFarcasterContext(walletAddress: string): Promise<FarcasterUser | null> {
    try {
      // Check cache first
      if (this.farcasterUserCache.has(walletAddress)) {
        console.log(`📋 Using cached Farcaster data for ${walletAddress}`);
        return this.farcasterUserCache.get(walletAddress) || null;
      }

      // Step 1: Get FID from Coinbase API
      const coinbaseData = await this.fetchFIDFromWalletAddress(walletAddress);
      if (!coinbaseData) {
        console.log(`❌ Could not get FID for wallet: ${walletAddress}`);
        return null;
      }

      // Step 2: Get comprehensive user data from Neynar
      const farcasterUser = await this.fetchNeynarUserData(coinbaseData.fid);
      if (!farcasterUser) {
        console.log(`❌ Could not get Neynar data for FID: ${coinbaseData.fid}`);
        return null;
      }

      // Cache the result (expire after 1 hour)
      this.farcasterUserCache.set(walletAddress, farcasterUser);
      setTimeout(() => {
        this.farcasterUserCache.delete(walletAddress);
      }, 60 * 60 * 1000); // 1 hour

      console.log(`✅ Complete Farcaster context for ${walletAddress}: @${farcasterUser.username}`);
      return farcasterUser;

    } catch (error) {
      console.error('Error getting Farcaster context:', error);
      return null;
    }
  }

  /**
   * 🔧 NEW: Get CBW wallet addresses directly from FID (your requested flow)
   */
  private async getCBWWalletsFromFID(fid: number): Promise<{
    custodyAddress: string;
    verifiedAddresses: string[];
    allWallets: string[];
    error?: string;
  }> {
    try {
      console.log(`🎯 Getting CBW wallets for FID: ${fid}`);
      
      // Use Neynar API to get wallet addresses from FID
      const farcasterUser = await this.fetchNeynarUserData(fid);
      
      if (!farcasterUser) {
        return {
          custodyAddress: '',
          verifiedAddresses: [],
          allWallets: [],
          error: 'Could not fetch user data from Neynar'
        };
      }

      // Extract all wallet addresses
      const allWallets = [
        farcasterUser.custodyAddress,
        ...farcasterUser.verifiedAddresses
      ].filter(Boolean);

      // Remove duplicates
      const uniqueWallets = [...new Set(allWallets)];

      console.log(`✅ Found ${uniqueWallets.length} wallet addresses for FID ${fid}:`);
      console.log(`   Custody: ${farcasterUser.custodyAddress}`);
      console.log(`   Verified: ${farcasterUser.verifiedAddresses.length}`);

      return {
        custodyAddress: farcasterUser.custodyAddress,
        verifiedAddresses: farcasterUser.verifiedAddresses,
        allWallets: uniqueWallets,
      };

    } catch (error) {
      console.error('Error getting CBW wallets from FID:', error);
      return {
        custodyAddress: '',
        verifiedAddresses: [],
        allWallets: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 🔧 NEW: Neynar API - Send fungible rewards to user
   */
  private async sendFarcasterRewards(
    fid: number,
    amount: number = 0.001,
    tokenAddress: string = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' // USDC on Base
  ): Promise<{success: boolean, txHash?: string, error?: string}> {
    try {
      if (!this.NEYNAR_API_KEY) {
        console.warn('⚠️ NEYNAR_API_KEY not configured for rewards');
        return {success: false, error: 'Neynar API key not configured'};
      }

      // Check if sponsor wallet ID is configured
      if (!this.NEYNAR_SPONSOR_WALLET_ID) {
        console.warn('⚠️ NEYNAR_SPONSOR_WALLET_ID not configured for rewards');
        return {success: false, error: 'Sponsor wallet ID not configured'};
      }

      console.log(`💰 Sending ${amount} USDC rewards to FID: ${fid}`);
      console.log(`🏦 Using sponsor wallet ID: ${this.NEYNAR_SPONSOR_WALLET_ID}`);

      const requestPayload = {
        fids: [fid],
        token_address: tokenAddress,
        amount: amount.toString(),
        chain_id: 8453, // Base network
        sponsor_wallet_id: this.NEYNAR_SPONSOR_WALLET_ID, // Your actual sponsor wallet ID from Neynar
        message: `🎉 dStealth Privacy Rewards! You've earned ${amount} USDC for using stealth addresses! 🥷`
      };

      const response = await fetch(`${NEYNAR_API_BASE}/farcaster/fungibles/send`, {
        method: 'POST',
        headers: {
          'api_key': this.NEYNAR_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestPayload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.log(`❌ Neynar send fungibles error: ${response.status}`, errorData);
        return {success: false, error: `API error: ${response.status}`};
      }

      const data = await response.json() as {transaction_hash: string};
      console.log(`✅ Rewards sent successfully! TX: ${data.transaction_hash}`);
      
      return {success: true, txHash: data.transaction_hash};

    } catch (error) {
      console.error('Error sending Farcaster rewards:', error);
      return {success: false, error: error instanceof Error ? error.message : 'Unknown error'};
    }
  }

  /**
   * 🔧 NEW: Neynar API - Fetch user followers
   */
  private async fetchUserFollowers(fid: number, limit: number = 50): Promise<FarcasterUser[]> {
    try {
      if (!this.NEYNAR_API_KEY) {
        console.warn('⚠️ NEYNAR_API_KEY not configured for followers');
        return [];
      }

      console.log(`👥 Fetching followers for FID: ${fid}`);

      const response = await fetch(`${NEYNAR_API_BASE}/farcaster/followers?fid=${fid}&limit=${limit}`, {
        headers: {
          'api_key': this.NEYNAR_API_KEY
        }
      });

      if (!response.ok) {
        console.log(`❌ Neynar followers API error: ${response.status}`);
        return [];
      }

      const data = await response.json() as NeynarFollowersResponse;
      
      const followers: FarcasterUser[] = data.users.map(user => ({
        fid: user.fid,
        username: user.username,
        displayName: user.display_name,
        avatarUrl: user.pfp_url,
        verified: user.verified,
        custodyAddress: user.custody_address,
        verifiedAddresses: user.verified_addresses?.eth_addresses || [],
        bio: user.profile?.bio?.text,
        followerCount: user.follower_count,
        followingCount: user.following_count
      }));

      console.log(`✅ Found ${followers.length} followers for FID ${fid}`);
      return followers;

    } catch (error) {
      console.error('Error fetching user followers:', error);
      return [];
    }
  }

  /**
   * 🔧 ENHANCED: Reverse lookup - Find fkey.id by wallet address - NO ZK receipts for search
   */
  private async findFkeyByWallet(walletAddress: string): Promise<string | null> {
    try {
      if (!walletAddress) return null;
      
      console.log(`🔍 Searching for fkey.id with wallet: ${walletAddress}`);
      
      // Get all users from the database and check their stealth addresses
      const allUsers = await agentDb.getAllStealthData();
      
      for (const userData of allUsers) {
        // Check if the stealth address matches
        if (userData.stealthAddress && userData.stealthAddress.toLowerCase() === walletAddress.toLowerCase()) {
          console.log(`✅ Found fkey.id: ${userData.fkeyId} for wallet: ${walletAddress}`);
          return userData.fkeyId;
        }
        
        // Also check if there's a way to get the user's original wallet address
        if (this.client) {
          try {
            const inboxState = await this.client.preferences.inboxStateFromInboxIds([userData.userId]);
            const userWalletAddress = inboxState[0]?.identifiers[0]?.identifier;
            
            if (userWalletAddress && userWalletAddress.toLowerCase() === walletAddress.toLowerCase()) {
              console.log(`✅ Found fkey.id: ${userData.fkeyId} for original wallet: ${walletAddress}`);
              return userData.fkeyId;
            }
          } catch (inboxError) {
            // Skip if we can't get inbox state
            continue;
          }
        }
      }
      
      console.log(`❌ No fkey.id found for wallet: ${walletAddress}`);
      return null;
    } catch (error) {
      console.error('Error finding fkey by wallet:', error);
      return null;
    }
  }

  /**
   * 🔧 ENHANCED: Search for Farcaster users and check dStealth usage - NO ZK receipts for search
   */
  private async searchFarcasterUsers(query: string): Promise<UserSearchResult[]> {
    try {
      if (!this.NEYNAR_API_KEY) {
        console.warn('⚠️ NEYNAR_API_KEY not configured for search');
        return [];
      }

      console.log(`🔍 Searching Farcaster users: ${query}`);

      const response = await fetch(`${NEYNAR_API_BASE}/farcaster/user/search?q=${encodeURIComponent(query)}&limit=20`, {
        headers: {
          'api_key': this.NEYNAR_API_KEY
        }
      });

      if (!response.ok) {
        console.log(`❌ Neynar search API error: ${response.status}`);
        return [];
      }

      const data = await response.json() as NeynarUserResponse;
      
      const results: UserSearchResult[] = [];
      
      for (const user of data.users) {
        // Check all addresses for existing fkey.id in database
        let foundFkey: string | null = null;
        
        // Check custody address
        const custodyFkey = await this.findFkeyByWallet(user.custody_address);
        if (custodyFkey) {
          foundFkey = custodyFkey;
        }
        
        // Check verified addresses
        if (!foundFkey && user.verified_addresses?.eth_addresses) {
          for (const address of user.verified_addresses.eth_addresses) {
            const fkey = await this.findFkeyByWallet(address);
            if (fkey) {
              foundFkey = fkey;
              break;
            }
          }
        }
        
        const primaryAddress = user.verified_addresses?.eth_addresses?.[0] || user.custody_address;
        
        results.push({
          fid: user.fid,
          username: user.username,
          displayName: user.display_name,
          avatarUrl: user.pfp_url,
          verified: user.verified,
          walletAddress: primaryAddress,
          fkeyId: foundFkey || undefined,
          hasFkey: !!foundFkey
        });
      }
      
      console.log(`✅ Found ${results.length} users, ${results.filter(r => r.hasFkey).length} with fkey.id`);
      return results;
      
    } catch (error) {
      console.error('Error searching Farcaster users:', error);
      return [];
    }
  }

  /**
   * 🔧 ENHANCED: Social Discovery - Analyze followers for dStealth usage - NO ZK receipts for search
   */
  private async analyzeFollowersForDStealth(fid: number): Promise<UserSearchResult[]> {
    try {
      // Get user's followers
      const followers = await this.fetchUserFollowers(fid, 100); // Get up to 100 followers
      
      const results: UserSearchResult[] = [];
      
      console.log(`🔍 Analyzing ${followers.length} followers for dStealth usage...`);
      
      for (const follower of followers) {
        // Check all verified addresses for existing fkey.id in database
        let foundFkey: string | null = null;
        
        // Check custody address
        const custodyFkey = await this.findFkeyByWallet(follower.custodyAddress);
        if (custodyFkey) {
          foundFkey = custodyFkey;
        }
        
        // Check verified addresses if no fkey found yet
        if (!foundFkey) {
          for (const address of follower.verifiedAddresses) {
            const fkey = await this.findFkeyByWallet(address);
            if (fkey) {
              foundFkey = fkey;
              break;
            }
          }
        }
        
        // Use primary verified address or custody address
        const primaryAddress = follower.verifiedAddresses[0] || follower.custodyAddress;
        
        results.push({
          fid: follower.fid,
          username: follower.username,
          displayName: follower.displayName,
          avatarUrl: follower.avatarUrl,
          verified: follower.verified,
          walletAddress: primaryAddress,
          fkeyId: foundFkey || undefined,
          hasFkey: !!foundFkey
        });
      }
      
      const dStealthUsers = results.filter(r => r.hasFkey);
      console.log(`✅ Found ${dStealthUsers.length} dStealth users among ${followers.length} followers`);
      
      return results;
      
    } catch (error) {
      console.error('Error analyzing followers for dStealth:', error);
      return [];
    }
  }

  /**
   * 🔧 NEW: Check if message content is Intent content type
   */
  private isIntentContent(content: any): content is IntentContent {
    // First check if content is an object before using 'in' operator
    if (!content || typeof content !== 'object' || content === null) {
      return false;
    }
    
    console.log(`🔍 Checking if content is Intent:`, {
      exists: !!content,
      type: typeof content,
      isObject: typeof content === 'object',
      hasId: 'id' in content,
      hasActionId: 'actionId' in content,
      idType: content.id ? typeof content.id : 'undefined',
      actionIdType: content.actionId ? typeof content.actionId : 'undefined',
    });
    
    const result = 'id' in content && 
                   'actionId' in content &&
                   typeof content.id === 'string' &&
                   typeof content.actionId === 'string';
           
    console.log(`🔍 Intent check result: ${result}`);
    return result;
  }

  /**
   * 🔧 ENHANCED: Message processing logic for group chats - only @mentions or replies
   */
  private async shouldProcessMessage(messageContent: string, senderInboxId: string, isGroup: boolean, conversationId: string, message?: any): Promise<boolean> {
    try {
      const trimmed = messageContent.trim().toLowerCase();
      
      // Get conversation info to determine if it's a group or DM
      const client = this.client;
      if (!client) {
        console.log("🔇 No client available for conversation check");
        return false;
      }

      const conversation = await client.conversations.getConversationById(conversationId);
      if (!conversation) {
        console.log("🔇 Conversation not found");
        return false;
      }

      const isActualGroup = conversation instanceof Group;
      
      if (isActualGroup) {
        // 🔧 ENHANCED: Group chat logic - only @mentions or replies to agent
        
        // Always send welcome message if not sent yet FOR THIS GROUP
        if (!this.groupIntroductions.has(conversationId)) {
          console.log("👋 Sending group introduction to group:", conversationId);
          this.groupIntroductions.add(conversationId); // Mark as sent immediately
          return true;
        }

        // 🔧 Check for explicit @mentions
        const hasExplicitMention = trimmed.includes('@dstealth') || 
                                   trimmed.includes('@dstealth.eth') ||
                                   trimmed.includes('@dstealth.base.eth');
        
        if (hasExplicitMention) {
          console.log("📢 Group message has explicit @dstealth mention - will process");
          return true;
        }

        // 🔧 NEW: Check if this message is a reply to an agent message
        if (message && await this.isReplyToAgent(message, conversation)) {
          console.log("💬 Group message is a reply to agent - will process");
          return true;
        }

        // 🔧 STRICT: Ignore all other messages in groups
        console.log("🔇 Group message lacks @mention or reply - ignoring");
        return false;
      } else {
        // In DMs: Always process
        console.log("💬 DM - will process");
          return true;
      }
    } catch (error) {
      console.error("❌ Error checking if message should be processed:", error);
      // Default to NOT processing in groups if we can't determine
      return !isGroup;
    }
  }

  /**
   * 🔧 NEW: Check if a message is a reply to an agent message
   */
  private async isReplyToAgent(message: any, conversation: any): Promise<boolean> {
    try {
      if (!this.client) return false;

      // Get recent messages from the conversation to check for replies
      const recentMessages = await conversation.messages({ limit: 50 });
      
      // Find the most recent agent message
      const agentInboxId = this.client.inboxId.toLowerCase();
      const recentAgentMessage = recentMessages.find((msg: any) => 
        msg.senderInboxId.toLowerCase() === agentInboxId
      );

      if (!recentAgentMessage) {
        return false; // No recent agent message to reply to
      }

      // Check if this message is close in time to the agent message (within 5 minutes)
      const agentMessageTime = recentAgentMessage.sentAt.getTime();
      const currentMessageTime = message.sentAt?.getTime() || Date.now();
      const timeDiff = currentMessageTime - agentMessageTime;
      
      // If the message is within 5 minutes and after the agent message, consider it a potential reply
      if (timeDiff > 0 && timeDiff < 5 * 60 * 1000) {
        console.log(`⏰ Message timing suggests reply (${timeDiff}ms after agent message)`);
        return true;
      }

      return false;
    } catch (error) {
      console.error("❌ Error checking if message is reply to agent:", error);
      return false;
    }
  }

  /**
   * 🔧 NEW: Check if message is a fkey.id setting command
   */
  private isFkeySetCommand(content: string): boolean {
    const trimmed = content.trim().toLowerCase();
    return trimmed.startsWith('/set ') || 
           trimmed.startsWith('my fkey is ') ||
           trimmed.startsWith('my fkey.id is ');
  }

  /**
   * 🔧 NEW: Check if message is asking about fkey status
   */
  private isFkeyStatusQuery(content: string): boolean {
    const trimmed = content.trim().toLowerCase();
    return trimmed.includes('what') && trimmed.includes('my') && trimmed.includes('fkey') ||
           trimmed.includes('what is my fkey') ||
           trimmed.includes('what\'s my fkey') ||
           trimmed.includes('whats my fkey') ||
           trimmed.includes('my fkey status') ||
           trimmed.includes('fkey status') ||
           trimmed.includes('current fkey') ||
           trimmed.includes('show my fkey');
  }

  /**
   * 🔧 NEW: Handle fkey status queries
   */
  private async handleFkeyStatusQuery(senderInboxId: string, isGroup: boolean): Promise<string> {
    try {
          const userData = await agentDb.getStealthDataByUser(senderInboxId);
      
      if (!userData?.fkeyId) {
        return `🔍 No fkey.id Set

You haven't set up your fkey.id yet!

🚀 Get Started:
1. 🔑 Get FluidKey: ${this.FLUIDKEY_REFERRAL_URL}
2. 📝 Set your fkey.id: \`/set yourUsername\`
3. 🚀 Complete setup: ${this.DSTEALTH_APP_URL}

Examples:
• \`/set tantodefi\`
• \`my fkey is tantodefi\`

Need help? Type \`/help\` for all commands!`;
      }

      // 🔧 SECURITY: Get fresh user data with current address verification
      const freshData = await this.getFreshUserStealthData(senderInboxId);
      
      if (!freshData) {
        return `❌ Setup Issues

Your fkey.id ${userData.fkeyId} needs verification.

Please re-verify: \`/set ${userData.fkeyId}\`
Or get FluidKey: ${this.FLUIDKEY_REFERRAL_URL}`;
      }

      if (freshData.error) {
        return `❌ fkey.id Verification Failed

Your fkey.id: ${userData.fkeyId}  
Error: ${freshData.error}

Fix this by:
• Re-verify: \`/set ${userData.fkeyId}\`
• Check your FluidKey profile is public
• Get FluidKey: ${this.FLUIDKEY_REFERRAL_URL}`;
      }

      const { userData: currentData, currentAddress, isAddressUpdated } = freshData;
      const zkProofStatus = currentData.zkProof ? "✅ Verified" : "⚠️ Pending";
      const setupStatus = currentAddress ? "✅ Complete" : "⏳ Pending";
      
      const addressUpdateNotice = isAddressUpdated 
        ? `\n🔄 Address Updated: Your stealth address was refreshed.`
        : '';

      return `🔍 Your fkey.id Status

Username: ${currentData.fkeyId}.fkey.id  
Setup: ${setupStatus}
ZK Proof: ${zkProofStatus}
Address: ${currentAddress ? `${currentAddress.slice(0, 8)}...${currentAddress.slice(-6)}` : 'Pending'}${addressUpdateNotice}

🚀 Quick Actions:
• Create payment link: "create payment link for $25"
• Check balance: \`/balance\`
• Manage links: \`/links\`
• Help: \`/help\`

${setupStatus === "⏳ Pending" ? `Complete Setup: ${this.DSTEALTH_APP_URL}` : ""}`;

    } catch (error) {
      console.error("Error handling fkey status query:", error);
      return `❌ Error Checking fkey Status

Something went wrong. Please try:
• \`/set yourUsername\` to reset
• \`/help\` for all commands
• Contact support if issues persist`;
    }
  }

  /**
   * 🔧 FIXED: Process general messages with clear onboarding flow separation
   */
  private async processGeneralMessage(content: string, senderInboxId: string, isGroup: boolean, conversation?: any, farcasterContext?: FarcasterUser | null): Promise<string> {
    try {
      // Check if user is onboarded first
      const isOnboarded = await this.isUserOnboarded(senderInboxId);
      console.log(`🔍 Processing "${content}" - User onboarded: ${isOnboarded}, isGroup: ${isGroup}`);
      
      // For groups, always check onboarding status
      if (isGroup) {
        if (!isOnboarded) {
          console.log("🔒 Group user not onboarded - requesting DM setup");
          return this.getRequiresFkeyMessage(true);
        }
        
        // Group intro message is now handled in shouldProcessMessage - this is a fallback
        // that should rarely be called since the logic is now in shouldProcessMessage
        const conversationId = conversation?.id;
        if (conversationId && !this.groupIntroductions.has(conversationId)) {
          console.log("👋 Sending group intro message");
          this.groupIntroductions.add(conversationId);
          return this.getGroupIntroMessage();
        }
      }
      
      // 🔧 FIXED: Clear separation between onboarded and non-onboarded flows
      if (!isOnboarded) {
        console.log("🔑 Non-onboarded user flow");
        // NON-ONBOARDED USER FLOW (DMs only)
        if (isGroup) {
          return "🔒 Setup Required: DM me your fkey.id first, then try again!\n\nI can only help users who have completed onboarding.";
        }
        
        // Check if we haven't sent welcome yet
        const welcomeAlreadySent = this.userWelcomesSent.has(senderInboxId);
        console.log(`🔍 Welcome already sent: ${welcomeAlreadySent}`);
        
        if (!welcomeAlreadySent) {
          console.log("👋 Sending welcome actions to non-onboarded user");
          await this.sendWelcomeWithActions(senderInboxId, conversation);
          return ""; // Actions message sent, no text response needed
        }
        
        // Check if this is a username entry (for users who clicked "I have an fkey")
        const trimmedContent = content.trim();
        if (this.isValidUsername(trimmedContent)) {
          return await this.handleFkeyConfirmation(trimmedContent, senderInboxId, conversation);
        }
        
        // Return onboarding reminder
        console.log("🔄 Returning onboarding reminder");
        return `🔑 Complete Your Setup

Please choose one of the options above:
• ✅ I have an fkey - if you already have FluidKey
• 🆕 I don't have an fkey - if you need to sign up

Or type your fkey.id username directly (e.g., tantodefi)`;
      }
      
      // 🔧 FIXED: ONBOARDED USER FLOW ONLY - no welcome actions here
      console.log("✅ Onboarded user flow");
      const userData = await agentDb.getStealthDataByUser(senderInboxId);
      
      // Check for simple command patterns first
      if (content.startsWith('/')) {
        console.log("🔧 Processing command");
        return await this.handleCommand(content, senderInboxId, isGroup, conversation);
      }
      
      // 🔧 FIXED: More restrictive username search - only for clear username patterns
      const trimmedContent = content.trim();
      if (this.isValidUsernameSearchPattern(trimmedContent)) {
        console.log("🔍 Valid username search pattern detected");
        const searchResult = await this.handleDirectUserSearch(trimmedContent, senderInboxId);
        if (searchResult) {
          return searchResult;
        }
      }
      
      // Check for basic keywords (onboarded users only)
      const basicResponse = this.handleBasicKeywords(content);
      if (basicResponse) {
        console.log("📝 Using basic keyword response");
        return basicResponse;
      }
      
      // Try OpenAI integration for intelligent responses
      if (this.OPENAI_API_KEY) {
        console.log("🤖 Trying OpenAI response");
        const openAIResponse = await this.getOpenAIResponse(content, userData, farcasterContext);
        if (openAIResponse) {
          return openAIResponse;
        }
      }
      
      // Fallback to basic response
      console.log("🔄 Using fallback response");
      return this.getBasicResponse(content, userData, farcasterContext);
    } catch (error) {
      console.error("Error processing general message:", error);
      return `❌ Error Processing Message

Something went wrong. Please try:
• \`/help\` for all commands
• Contact support if issues persist`;
    }
  }

  /**
   * 🔧 NEW: Check if content is a valid username search pattern
   * This prevents "gm" and other casual messages from being treated as user searches
   */
  private isValidUsernameSearchPattern(content: string): boolean {
    // Must be a single word without spaces
    if (content.includes(' ')) return false;
    
    // Must be between 3-30 characters (too short words like "gm", "hi" are not usernames)
    if (content.length < 3 || content.length > 30) return false;
    
    // Must contain specific patterns that indicate it's a username
    const isSpecificPattern = 
      content.includes('.base.eth') || 
      content.includes('.eth') || 
      content.startsWith('@') ||
      content.endsWith('.fkey.id') ||
      // Only alphanumeric usernames that are 5+ characters or contain specific indicators
      (content.match(/^[a-zA-Z0-9_]+$/) && (content.length >= 5 || content.includes('_')));
    
    if (!isSpecificPattern) return false;
    
    // Blacklist common casual words that might match the pattern
    const blacklistedWords = [
      'hello', 'hi', 'hey', 'gm', 'good', 'morning', 'afternoon', 'evening', 'night',
      'thanks', 'thank', 'please', 'help', 'info', 'status', 'what', 'how', 'why', 
      'when', 'where', 'introduce', 'yourself', 'channel', 'integration', 'think',
      'awesome', 'great', 'cool', 'nice', 'wow', 'yes', 'no', 'ok', 'okay', 'sure',
      'maybe', 'perhaps', 'probably', 'definitely', 'absolutely', 'exactly', 'indeed'
    ];
    
    if (blacklistedWords.includes(content.toLowerCase())) return false;
    
    return true;
  }

  /**
   * Check if a string is a valid username (for fkey.id)
   */
  private isValidUsername(content: string): boolean {
    // Remove .fkey.id if present
    const username = content.toLowerCase().replace('.fkey.id', '');
    
    // Username should be 2-30 characters, alphanumeric plus underscore/hyphen
    return /^[a-zA-Z0-9_-]{2,30}$/.test(username);
  }

  /**
   * 🔧 NEW: Handle fkey.id setting commands
   */
  private async handleFkeySetCommand(
    content: string,
    senderInboxId: string,
    isGroup: boolean,
  ): Promise<string> {
    try {
      let username = '';
      const trimmed = content.trim();
      
      // Extract username from different command formats
      if (trimmed.toLowerCase().startsWith('/set ')) {
        username = trimmed.slice(5).trim();
      } else if (trimmed.toLowerCase().startsWith('my fkey is ')) {
        username = trimmed.slice(11).trim();
      } else if (trimmed.toLowerCase().startsWith('my fkey.id is ')) {
        username = trimmed.slice(14).trim();
      }

      // Remove .fkey.id suffix if present
      if (username.toLowerCase().endsWith('.fkey.id')) {
        username = username.slice(0, -8);
      }

      username = username.toLowerCase().trim();

      if (!username || username.length < 2) {
        return `❌ Invalid Username

Please provide a valid fkey.id username.

Examples:
• \`/set tantodefi\`
• \`/set tantodefi.fkey.id\`
• \`my fkey is tantodefi\`

Need FluidKey? Get it here: ${this.FLUIDKEY_REFERRAL_URL}`;
      }

      // ✅ FIRST: Resolve primary address for user
      const primaryAddressResult = await resolvePrimaryFromXMTP(senderInboxId, this.client);
      
      if (!primaryAddressResult) {
        return `❌ Setup Failed

Could not resolve your wallet address. Please try again later.`;
      }

      // 🔧 ENHANCED: Call fkey.id lookup API with user address and source for ZK receipt
      console.log(`🔍 Setting fkey.id for user: ${username}`);
      const lookupResult = await this.callFkeyLookupAPI(username, primaryAddressResult.primaryAddress, 'xmtp-agent-fkey-set');

      if (lookupResult.error) {
        return `❌ fkey.id Setup Failed

Could not verify \`${username}.fkey.id\`: ${lookupResult.error}

Please ensure:
1. 🔑 You have FluidKey: ${this.FLUIDKEY_REFERRAL_URL}
2. 📝 Your username is correct (e.g., "tantodefi")
3. 🌐 Your fkey.id profile is publicly accessible

Try: \`/set yourUsername\``;
      }

      // ✅ FIXED: Store fkey.id association using primary address approach
      const userData = {
        userId: primaryAddressResult.primaryAddress, // ✅ Use primary address as database key
        fkeyId: username,
        stealthAddress: lookupResult.address || "",
        zkProof: lookupResult.proof,
        lastUpdated: Date.now(),
        requestedBy: senderInboxId,
        setupStatus: 'fkey_set' as const,
        metadata: {
          source: 'xmtp-agent',
          primaryAddressSource: primaryAddressResult.source,
          primaryAddressMetadata: primaryAddressResult.metadata,
          xmtpInboxId: senderInboxId
        }
      };

      await agentDb.storeUserStealthData(userData);

      const proofStatus = lookupResult.proof ? "✅ ZK Proof Verified" : "⚠️ No ZK Proof Available";

      return `✅ fkey.id Set Successfully! 

Your Profile: \`${username}.fkey.id\`
Address: \`${lookupResult.address?.slice(0, 6)}...${lookupResult.address?.slice(-4)}\`
Status: ${proofStatus}

Now you can:
• 💳 Create payment links: "create payment link for $25"
• 🔍 Check balance: \`/balance\`
• 📊 View links: \`/links\`

Complete Setup: ${this.DSTEALTH_APP_URL}`;

    } catch (error) {
      console.error("Error setting fkey.id:", error);
      return `❌ Failed to set fkey.id. Please try again or contact support.`;
    }
  }

  /**
   * 🔧 UPDATED: Process messages with OpenAI for intelligent responses with Farcaster context
   */
  private async handleWithOpenAI(
    content: string,
    senderInboxId: string,
    isGroup: boolean,
    farcasterContext?: FarcasterUser | null,
  ): Promise<string | undefined> {
    try {
      // Check if user is onboarded
      const isOnboarded = await this.isUserOnboarded(senderInboxId);
      
      if (!isOnboarded) {
        // User not onboarded - this should be handled by processGeneralMessage
        // Don't provide responses here to avoid duplicate welcome messages
        return undefined;
      }

      // User is onboarded, get their data
      const userData = await agentDb.getStealthDataByUser(senderInboxId);
      
      // Use OpenAI if available
      if (this.OPENAI_API_KEY) {
        return await this.getOpenAIResponse(content, userData, farcasterContext);
      } else {
        // Fallback to basic responses
        return this.getBasicResponse(content, userData, farcasterContext);
      }

    } catch (error) {
      console.error("Error in OpenAI processing:", error);
      return undefined;
    }
  }

  /**
   * 🔧 UPDATED: Get OpenAI response with Farcaster context
   */
  private async getOpenAIResponse(content: string, userData: any, farcasterContext?: FarcasterUser | null): Promise<string> {
    try {
      // Build context string for OpenAI
      let contextString = `The user has fkey.id: ${userData.fkeyId}.`;
      
      if (farcasterContext) {
        contextString += ` They are connected to Farcaster as @${farcasterContext.username} (${farcasterContext.displayName})`;
        if (farcasterContext.verified) {
          contextString += ' and are verified';
        }
        contextString += `. They have ${farcasterContext.followerCount} followers and can receive privacy rewards via Farcaster.`;
      } else {
        contextString += ` They are not connected to Farcaster yet and could benefit from connecting for privacy rewards.`;
      }

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: `You are dStealth, a specialized AI assistant for the dStealth privacy payment platform. ${contextString}

STRICT SCOPE: Only help with dStealth-specific features:
- fkey.id setup and management
- Anonymous payment link creation
- Stealth address technology & explanations (Alice/Bob examples welcome)
- ZK proof receipts
- Privacy rewards via Farcaster
- dStealth agent commands (/help, /balance, /search, etc.)
- Educational explanations about stealth addresses, privacy, and how dStealth works

RESPONSE RULES:
- Keep responses under 2-3 sentences
- Always direct users to specific commands when possible
- For topics outside dStealth scope, redirect to /help
- Don't provide general crypto advice or market commentary
- Focus on actionable next steps
- Feel free to explain stealth address concepts with Alice/Bob examples

COMMAND PRIORITY: When users ask questions, guide them to relevant commands:
- Payment questions → "create payment link for $X"
- Account questions → /balance, /status
- User search → /search username
- Help → /help

If asked about non-dStealth topics, respond: "I'm focused on dStealth privacy features. Type /help for available commands or visit https://dstealth.xyz for more info."`
            },
            {
              role: 'user',
              content: content
            }
          ],
          max_tokens: 120, // Reduced from 150 to enforce conciseness
          temperature: 0.5, // Reduced from 0.7 for more focused responses
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json() as { 
        choices: Array<{ 
          message: { 
            content: string; 
          }; 
        }> 
      };
      
      let aiResponse = data.choices[0]?.message?.content || "I'm here to help with privacy and payments! Type /help for commands.";
      
      // Add Farcaster context if available and relevant
      if (farcasterContext && !aiResponse.includes('Farcaster') && !aiResponse.includes('@')) {
        aiResponse += `\n\n🎭 @${farcasterContext.username}, try /rewards to check your privacy rewards!`;
      }
      
      return aiResponse;

    } catch (error) {
      console.error("OpenAI API error:", error);
      const fallbackGreeting = farcasterContext ? `@${farcasterContext.username}` : userData.fkeyId;
      return `Hi ${fallbackGreeting}! I'm here to help with privacy and payments! Type /help for commands.`;
    }
  }

  /**
   * 🔧 UPDATED: Basic fallback response with Farcaster context
   */
  private getBasicResponse(content: string, userData: any, farcasterContext?: FarcasterUser | null): string {
    const lower = content.toLowerCase();
    
    // Create personalized greeting based on available context
    let greeting = userData.fkeyId ? `${userData.fkeyId}` : 'there';
    if (farcasterContext) {
      greeting = `@${farcasterContext.username}`;
    }
    
    if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
      const fcBadge = farcasterContext?.verified ? ' ✅' : '';
      return `👋 Hello ${greeting}${fcBadge}! I'm dStealth, your privacy assistant. How can I help you today?`;
    }
    
    if (lower.includes('help')) {
      return this.getHelpMessage();
    }
    
    const fcFeature = farcasterContext ? 
      `\n\n🎭 Farcaster Connected: @${farcasterContext.username}\n• Use /rewards to check available privacy rewards\n• Use /send-rewards to claim 0.001 USDC` : 
      `\n\n🔗 Connect to Farcaster with /fc for rewards!`;
    
    return `Hi ${greeting}! I'm here to help with anonymous payments and privacy tools. Type /help for available commands.${fcFeature}`;
  }

  /**
   * 🔧 NEW: Group introduction message (no markdown, shorter)
   */
  private getGroupIntroMessage(): string {
    return `👋 Hello! I'm dStealth 🥷

I help with anonymous payments and privacy tools.

To get started:
• DM me to set your fkey.id: /set yourUsername
• Create payment links: "create payment link for $25" 
• Get help: /help

I only respond when @mentioned or for payment requests!`;
  }

  /**
   * 🔧 UPDATED: Handle commands with enhanced help and fkey.id requirements
   */
  private async handleCommand(
    command: string,
    senderInboxId: string,
    isGroup: boolean,
    conversation?: any,
  ): Promise<string> {
    const cmd = command.toLowerCase().trim();

    // Check if user is onboarded for all commands except /set
    const isOnboarded = await this.isUserOnboarded(senderInboxId);
    
    // /help command - available to all users, but different for onboarded vs non-onboarded
    if (cmd === "/help") {
      if (isOnboarded) {
        // 🔧 FIXED: Send help actions to the same conversation where requested
        await this.sendHelpActionsMessage(senderInboxId, isGroup, conversation);
        return ""; // Return empty string since we're sending actions
      } else {
        // For non-onboarded users, show basic help
        return `🔑 Welcome to dStealth!

To use dStealth, you need to set up your fkey.id first:

Option 1: I have FluidKey
• Type your username (e.g., tantodefi)
• Or use: /set yourUsername

Option 2: I need FluidKey
• Get FluidKey: ${this.FLUIDKEY_REFERRAL_URL}
• Then return and set your username

Commands available:
• /set username - Set your fkey.id
• help - Show this help

Once you set your fkey.id, all features will be unlocked! 🚀`;
      }
    }

    // /set command - always available for onboarding
    if (cmd.startsWith("/set ")) {
      return await this.handleFkeySetCommand(command, senderInboxId, isGroup);
    }

    // All other commands require onboarding
    if (!isOnboarded) {
      return this.getRequiresFkeyMessage(isGroup);
    }

    // Commands for onboarded users only
    const userData = await agentDb.getStealthDataByUser(senderInboxId);

    switch (cmd) {
      case "/status":
        return this.getStatusMessage();

      case "/balance":
        return await this.handleBalanceCheck(senderInboxId);

      case "/links":
        return await this.handleLinksManagement(senderInboxId);

      case "/actions":
        await this.sendActionsMenu(senderInboxId);
        return ""; // Return empty string since we're sending actions

      case "/fc":
        return await this.handleFarcasterProfile(senderInboxId);

      case "/rewards":
        return await this.handleRewardsCommand(senderInboxId);

      case "/send-rewards":
        return await this.handleSendRewardsCommand(senderInboxId);

      case "/search-followers":
        return await this.handleSearchFollowersCommand(senderInboxId);

      case "/search":
        if (cmd.split(' ').length < 2) {
          // Use enhanced search with follower fallback when no username provided
          return await this.handleEnhancedSearchCommand('', senderInboxId);
        }
        const username = cmd.slice(8).trim().replace('@', ''); // Remove "/search " and @
        return await this.handleEnhancedSearchCommand(username, senderInboxId);

      default:
        if (cmd.startsWith("/fkey ")) {
          const fkeyId = cmd.slice(6).trim();
          return await this.handleFkeyLookup(fkeyId, senderInboxId);
        }
        return `❌ Unknown command. Type /help for available commands.`;
    }
  }

  /**
   * Extract payment amount from message content
   */
  private extractPaymentAmount(content: string): string | null {
    const patterns = [
      /create.*payment.*link.*for.*\$(\d+(?:\.\d{2})?)/i,
      /\$(\d+(?:\.\d{2})?).*payment.*link/i,
      /generate.*link.*\$(\d+(?:\.\d{2})?)/i,
      /payment.*link.*\$(\d+(?:\.\d{2})?)/i,
      /\$(\d+(?:\.\d{2})?)/,
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    return null;
  }

  /**
   * 🔧 FIXED: Check if message is a fkey.id pattern - ONLY match actual .fkey.id domains
   */
  private isFkeyIdPattern(content: string): boolean {
    const patterns = [/^[a-zA-Z0-9_-]+\.fkey\.id$/i];

    const trimmed = content.trim();
    return (
      patterns.some((pattern) => pattern.test(trimmed)) && trimmed.length >= 2
    );
  }

  /**
   * 🔧 ENHANCED: Call fkey.id lookup API to get ZK proof and store it as ZK receipt
   */
  private async callFkeyLookupAPI(fkeyId: string, userAddress?: string, source?: string): Promise<{ address?: string; proof?: unknown; error?: string }> {
    try {
      // Try to get user address from inbox ID if not provided
      if (!userAddress && this.client) {
        try {
          const senderInboxId = this.client.inboxId;
          const inboxState = await this.client.preferences.inboxStateFromInboxIds([senderInboxId]);
          userAddress = inboxState[0]?.identifiers[0]?.identifier;
        } catch (error) {
          console.warn('⚠️ Could not resolve user address from inbox ID:', error);
        }
      }

      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      
      // Build URL with query parameters for ZK receipt storage
      const url = new URL(`${baseUrl}/api/fkey/lookup/${fkeyId}`);
      if (userAddress) {
        url.searchParams.append('userAddress', userAddress);
      }
      if (source) {
        url.searchParams.append('source', source);
      }
      
      console.log(`🔍 Agent: Enhanced fkey.id lookup with ZK receipt generation: ${url.toString()}`);
      
      const response = await fetch(url.toString());
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json() as { isRegistered?: boolean; address?: string; proof?: unknown; error?: string };
      
      if (data.isRegistered && data.address) {
        console.log(`✅ Agent: fkey.id lookup successful with ZK receipt generated for ${fkeyId}`);
        return {
          address: data.address,
          proof: data.proof || null
        };
      } else {
        return {
          error: data.error || 'fkey.id not found or not registered'
        };
      }
      
    } catch (error) {
      console.error('❌ Error calling fkey.id lookup API:', error);
      return {
        error: error instanceof Error ? error.message : 'Failed to lookup fkey.id'
      };
    }
  }

  /**
   * 🔧 ENHANCED: Cross-platform fkey.id status checking
   * Checks agent DB, miniapp settings, and Farcaster casts for most authoritative source
   */
  private async checkFkeyAcrossAllSources(senderInboxId: string): Promise<{
    fkeyId: string | null;
    source: 'agent_db' | 'miniapp' | 'farcaster_cast' | 'farcaster_fid' | 'not_found';
    stealthAddress: string | null;
    zkProof: any;
    lastUpdated: number;
    isAuthoritative: boolean;
    needsUpdate: boolean;
  }> {
    try {
      // Get user's wallet address
      const primaryAddressResult = await resolvePrimaryFromXMTP(senderInboxId, this.client);
      if (!primaryAddressResult) {
        return {
          fkeyId: null,
          source: 'not_found',
          stealthAddress: null,
          zkProof: null,
          lastUpdated: 0,
          isAuthoritative: false,
          needsUpdate: false
        };
      }

      const userAddress = primaryAddressResult.primaryAddress;
      
      // 1. Check agent database by user address (most reliable)
      const agentData = await agentDb.getStealthDataByUser(userAddress);
      
      // 2. Check agent database by FID (if user has Farcaster context)
      let fidData: UserStealthData | null = null;
      try {
        const farcasterContext = await this.getFarcasterContext(userAddress);
        if (farcasterContext?.fid) {
          console.log(`🔍 Checking for existing fkey.id by FID: ${farcasterContext.fid}`);
          fidData = await agentDb.getStealthDataByFID(farcasterContext.fid);
        }
      } catch (error) {
        console.log(`⚠️ Could not check FID-based lookup: ${error}`);
      }
      
      // 3. Check miniapp settings (if available)
      const miniappData = await this.checkMiniappFkeySetting(userAddress);
      
      // 4. Check Farcaster casts (if available)
      const farcasterData = await this.checkFarcasterCastSetting(userAddress);
      
      // 5. Reconcile data from all sources (including FID-based lookup)
      const reconciledData = await this.reconcileFkeyData(agentData, miniappData, farcasterData, fidData);
      
      console.log(`🔍 Cross-platform fkey check for ${userAddress}:`, {
        agent: agentData?.fkeyId || 'none',
        fid: fidData?.fkeyId || 'none',
        miniapp: miniappData?.fkeyId || 'none',
        farcaster: farcasterData?.fkeyId || 'none',
        final: reconciledData.fkeyId || 'none',
        source: reconciledData.source
      });

      return reconciledData;
    } catch (error) {
      console.error('Error in checkFkeyAcrossAllSources:', error);
      return {
        fkeyId: null,
        source: 'not_found',
        stealthAddress: null,
        zkProof: null,
        lastUpdated: 0,
        isAuthoritative: false,
        needsUpdate: false
      };
    }
  }

  /**
   * 🔧 NEW: Check miniapp fkey.id setting
   */
  private async checkMiniappFkeySetting(userAddress: string): Promise<{
    fkeyId: string | null;
    lastUpdated: number;
    source: 'miniapp';
  }> {
    try {
      // Call the miniapp API to check if user has set fkey.id there
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const response = await fetch(`${frontendUrl}/api/user/profile/${userAddress}`);
      
      if (!response.ok) {
        return { fkeyId: null, lastUpdated: 0, source: 'miniapp' };
      }
      
      const profileData = await response.json();
      
      if (profileData.fkeyId) {
        console.log(`✅ Found fkey.id in miniapp: ${profileData.fkeyId} for ${userAddress}`);
        return {
          fkeyId: profileData.fkeyId,
          lastUpdated: profileData.lastUpdated || Date.now(),
          source: 'miniapp'
        };
      }
      
      return { fkeyId: null, lastUpdated: 0, source: 'miniapp' };
    } catch (error) {
      console.warn('⚠️ Could not check miniapp fkey setting:', error);
      return { fkeyId: null, lastUpdated: 0, source: 'miniapp' };
    }
  }

  /**
   * 🔧 NEW: Check Farcaster cast fkey.id setting
   */
  private async checkFarcasterCastSetting(userAddress: string): Promise<{
    fkeyId: string | null;
    lastUpdated: number;
    source: 'farcaster_cast';
  }> {
    try {
      if (!this.NEYNAR_API_KEY) {
        return { fkeyId: null, lastUpdated: 0, source: 'farcaster_cast' };
      }

      // Get user's Farcaster profile
      const farcasterUser = await this.getFarcasterContext(userAddress);
      if (!farcasterUser) {
        return { fkeyId: null, lastUpdated: 0, source: 'farcaster_cast' };
      }

      // Search for recent casts containing "@dstealth username.fkey.id"
      const response = await fetch(`${NEYNAR_API_BASE}/farcaster/casts?fid=${farcasterUser.fid}&limit=50`, {
        headers: {
          'api_key': this.NEYNAR_API_KEY
        }
      });

      if (!response.ok) {
        return { fkeyId: null, lastUpdated: 0, source: 'farcaster_cast' };
      }

      const castsData = await response.json() as { casts: any[] };
      
      // Look for casts with "@dstealth username.fkey.id" pattern
      for (const cast of castsData.casts) {
        const castText = cast.text?.toLowerCase() || '';
        const match = castText.match(/@dstealth\s+(\w+)\.fkey\.id/);
        
        if (match) {
          const fkeyId = match[1];
          console.log(`✅ Found fkey.id in Farcaster cast: ${fkeyId} for ${userAddress}`);
          return {
            fkeyId,
            lastUpdated: new Date(cast.timestamp).getTime(),
            source: 'farcaster_cast'
          };
        }
      }
      
      return { fkeyId: null, lastUpdated: 0, source: 'farcaster_cast' };
    } catch (error) {
      console.warn('⚠️ Could not check Farcaster cast fkey setting:', error);
      return { fkeyId: null, lastUpdated: 0, source: 'farcaster_cast' };
    }
  }

  /**
   * 🔧 NEW: Reconcile fkey.id data from all sources
   */
  private async reconcileFkeyData(
    agentData: any,
    miniappData: any,
    farcasterData: any,
    fidData?: any
  ): Promise<{
    fkeyId: string | null;
    source: 'agent_db' | 'miniapp' | 'farcaster_cast' | 'farcaster_fid' | 'not_found';
    stealthAddress: string | null;
    zkProof: any;
    lastUpdated: number;
    isAuthoritative: boolean;
    needsUpdate: boolean;
  }> {
    const sources = [
      { data: agentData, source: 'agent_db' as const, priority: 3 },
      { data: fidData, source: 'farcaster_fid' as const, priority: 4 },
      { data: miniappData, source: 'miniapp' as const, priority: 2 },
      { data: farcasterData, source: 'farcaster_cast' as const, priority: 1 }
    ];

    // Find the most recent and authoritative source
    let mostAuthoritative = null;
    let mostRecent = null;

    for (const source of sources) {
      if (source.data?.fkeyId) {
        if (!mostAuthoritative || source.priority > mostAuthoritative.priority) {
          mostAuthoritative = source;
        }
        if (!mostRecent || source.data.lastUpdated > mostRecent.data.lastUpdated) {
          mostRecent = source;
        }
      }
    }

    // If no fkey.id found anywhere
    if (!mostAuthoritative) {
      return {
        fkeyId: null,
        source: 'not_found',
        stealthAddress: null,
        zkProof: null,
        lastUpdated: 0,
        isAuthoritative: false,
        needsUpdate: false
      };
    }

    // Use agent DB if available and recent, otherwise use most recent
    const selectedSource = (agentData?.fkeyId && 
                           agentData.lastUpdated > Date.now() - 24 * 60 * 60 * 1000) // 24 hours
                           ? { data: agentData, source: 'agent_db' as const }
                           : mostRecent || mostAuthoritative;

    const needsUpdate = selectedSource.source !== 'agent_db' || 
                       !selectedSource.data.stealthAddress ||
                       selectedSource.data.lastUpdated < Date.now() - 60 * 60 * 1000; // 1 hour

    return {
      fkeyId: selectedSource.data.fkeyId,
      source: selectedSource.source,
      stealthAddress: selectedSource.data.stealthAddress || null,
      zkProof: selectedSource.data.zkProof || null,
      lastUpdated: selectedSource.data.lastUpdated || 0,
      isAuthoritative: selectedSource.source === 'agent_db',
      needsUpdate
    };
  }

  /**
   * 🔧 SECURITY: Helper method to always get fresh user stealth data with current fkey.id lookup
   * Uses primary address approach - resolves inbox ID to wallet address for database lookup
   */
  private async getFreshUserStealthData(senderInboxId: string): Promise<{
    userData: any;
    currentAddress: string;
    isAddressUpdated: boolean;
    error?: string;
  } | null> {
    try {
      // ✅ ENHANCED: Use cross-platform checking first
      const crossPlatformData = await this.checkFkeyAcrossAllSources(senderInboxId);
      
      if (!crossPlatformData.fkeyId) {
        console.log(`❌ No fkey.id found across all sources for inbox: ${senderInboxId}`);
        return null;
      }

      // ✅ STEP 1: Resolve inbox ID to primary wallet address
      const primaryAddressResult = await resolvePrimaryFromXMTP(senderInboxId, this.client);
      
      if (!primaryAddressResult) {
        console.error(`❌ Could not resolve primary address for inbox ID: ${senderInboxId}`);
        return null;
      }
      
      console.log(`🔑 Resolved primary address: ${primaryAddressResult.primaryAddress} for inbox: ${senderInboxId}`);
      
      // ✅ STEP 2: Get stealth data using primary address (fallback to cross-platform if needed)
      let userData = await agentDb.getStealthDataByUser(primaryAddressResult.primaryAddress);
      
      if (!userData || !userData.fkeyId) {
        // Create userData from cross-platform data if not in agent DB
        userData = {
          userId: primaryAddressResult.primaryAddress,
          fkeyId: crossPlatformData.fkeyId,
          stealthAddress: crossPlatformData.stealthAddress || '',
          zkProof: crossPlatformData.zkProof,
          lastUpdated: crossPlatformData.lastUpdated,
          requestedBy: senderInboxId,
          setupStatus: 'fkey_set' as const,
          metadata: {
            source: `synced_from_${crossPlatformData.source}`,
            primaryAddressSource: primaryAddressResult.source,
            primaryAddressMetadata: primaryAddressResult.metadata,
            xmtpInboxId: senderInboxId
          }
        };
        console.log(`🔄 Created userData from cross-platform source: ${crossPlatformData.source}`);
      }

      // ✅ STEP 3: Always do fresh fkey.id lookup for security (with ZK receipt)
      if (!userData || !userData.fkeyId) {
        return {
          userData,
          currentAddress: '',
          isAddressUpdated: false,
          error: 'No user data or fkey.id found'
        };
      }

      console.log(`🔒 Security check: Refreshing stealth address for ${userData.fkeyId}`);
      const freshLookup = await this.callFkeyLookupAPI(userData.fkeyId, primaryAddressResult.primaryAddress, 'xmtp-agent-fresh-lookup');
      
      if (freshLookup.error || !freshLookup.address) {
        return {
          userData,
          currentAddress: '',
          isAddressUpdated: false,
          error: freshLookup.error || 'No address found'
        };
      }

      const currentAddress = freshLookup.address;
      let isAddressUpdated = false;

      // ✅ STEP 4: Update stored data if address changed or missing
      if (!userData.stealthAddress || userData.stealthAddress !== currentAddress) {
        if (userData.stealthAddress) {
          console.log(`🔄 Address updated for ${userData.fkeyId}: ${userData.stealthAddress} → ${currentAddress}`);
          isAddressUpdated = true;
        }
        
        // Update stored data with fresh info using primary address
        const updatedUserData = {
          ...userData,
          userId: primaryAddressResult.primaryAddress,
          stealthAddress: currentAddress,
          zkProof: freshLookup.proof,
          lastUpdated: Date.now(),
          metadata: {
            ...(userData.metadata || {}),
            lastAddressUpdate: Date.now(),
            addressUpdateSource: 'xmtp-agent-fresh-lookup'
          }
        };

        await agentDb.storeUserStealthData(updatedUserData);
        
        return {
          userData: updatedUserData,
          currentAddress,
          isAddressUpdated
        };
      }

      return {
        userData,
        currentAddress,
        isAddressUpdated: false
      };
    } catch (error) {
      console.error('Error in getFreshUserStealthData:', error);
      return null;
    }
  }

  /**
   * Generate Coinbase Wallet payment request URL
   */
  private generateCoinbaseWalletLink(toAddress: string, amount: string, tokenSymbol: string = 'USDC'): string {
    try {
      // USDC contract address on Base
      const usdcContractBase = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
      
      // Convert amount to smallest unit (USDC has 6 decimals)
      const amountInSmallestUnit = Math.floor(parseFloat(amount) * 1000000).toString();
      
      // Construct EIP-681 URI for Base network
      const eip681Uri = `ethereum:${usdcContractBase}@8453/transfer?address=${toAddress}&uint256=${amountInSmallestUnit}`;
      
      // URL encode the EIP-681 URI
      const encodedUri = encodeURIComponent(eip681Uri);
      
      // Construct Coinbase Wallet request URL
      const coinbaseWalletUrl = `https://go.cb-w.com/pay-request?EIP681Link=${encodedUri}`;
      
      return coinbaseWalletUrl;
    } catch (error) {
      console.error('Error generating Coinbase Wallet link:', error);
      return '';
    }
  }

  /**
   * 🔧 NEW: Generate CBW request link for stealth payments (following frontend pattern)
   * This uses the same logic as the frontend DaimoPayButton.tsx generateCoinbaseWalletLink
   */
  private generateCBWRequestLink(toAddress: string, amount: string, tokenSymbol: string = 'USDC'): string {
    try {
      // USDC contract address on Base
      const usdcContractBase = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
      
      // Convert amount to smallest unit (USDC has 6 decimals)
      const amountInSmallestUnit = Math.floor(parseFloat(amount) * 1000000).toString();
      
      // Construct EIP-681 URI for Base network
      const eip681Uri = `ethereum:${usdcContractBase}@8453/transfer?address=${toAddress}&uint256=${amountInSmallestUnit}`;
      
      // URL encode the EIP-681 URI
      const encodedUri = encodeURIComponent(eip681Uri);
      
      // Construct Coinbase Wallet request URL
      const coinbaseWalletUrl = `https://go.cb-w.com/pay-request?EIP681Link=${encodedUri}`;
      
      return coinbaseWalletUrl;
    } catch (error) {
      console.error('Error generating CBW request link:', error);
      return '';
    }
  }

  /**
   * 🔧 UPDATED: Handle payment requests with fkey.id requirement
   */
  private async handlePaymentRequest(
    amount: string,
    senderInboxId: string,
    conversationId: string,
    isGroup: boolean,
    conversation?: any,
  ): Promise<string> {
    try {
      // Check if user has fkey.id set
      const userData = await agentDb.getStealthDataByUser(senderInboxId);
      
      if (!userData?.fkeyId) {
        return this.getRequiresFkeyMessage(isGroup);
      }

      // 🔧 SECURITY: Get fresh user data with current address verification
      const freshData = await this.getFreshUserStealthData(senderInboxId);

      if (!freshData) {
        return `❌ Setup Incomplete

Please complete your setup at ${this.DSTEALTH_APP_URL}`;
      }

      if (freshData.error) {
        return `❌ Security Error

Could not verify your fkey.id: ${freshData.error}

Please re-verify: \`/set ${userData.fkeyId}\``;
      }

      const { userData: currentData, currentAddress, isAddressUpdated } = freshData;
      
      // Generate proper Daimo payment link
      const amountInDollars = parseFloat(amount);
      
      // 🔧 VALIDATION: Check Daimo API limits (max $4000)
      if (amountInDollars > 4000) {
        return `❌ Payment Amount Too Large

Requested: $${amount}
Daimo Limit: $4000.00 maximum

Please try a smaller amount:
• "create payment link for $100"
• "create payment link for $500"
• "create payment link for $1000"

Why the limit? Daimo has security limits for payment links.
Need larger amounts? Visit ${this.DSTEALTH_APP_URL} for alternatives.`;
      }
      
      // Format as decimal string (e.g., "50.00") as required by Daimo API docs
      const amountDecimalString = amountInDollars.toFixed(2);
      
      const paymentRequest = {
        destinationAddress: currentAddress,
        amountUnits: amountDecimalString, // Decimal string format per Daimo API docs
        displayAmount: amount,
        tokenSymbol: "USDC",
        chainId: "8453", // Base
        intent: `ZK Stealth Payment to ${currentData.fkeyId}.fkey.id - view ZK receipt at dstealth.xyz`,
        metadata: {
          fkeyId: currentData.fkeyId,
          stealthAddress: currentAddress,
          zkProof: currentData.zkProof ? "available" : "pending",
          source: "dstealth-agent"
        }
      };

      const daimoResponse = await daimoPayClient.createPaymentLink(paymentRequest);
      
      // 🔧 CRITICAL FIX: Store payment link in Redis for frontend ZK receipts access
      try {
        // Get sender's wallet address for Redis key
        const inboxState = await this.client!.preferences.inboxStateFromInboxIds([senderInboxId]);
        const senderWalletAddress = inboxState[0]?.identifiers[0]?.identifier;
        
        if (senderWalletAddress && redis) {
          const zkReceiptKey = `zk_receipt:agent_payment_${Date.now()}:${senderWalletAddress.toLowerCase()}:${Date.now()}`;
          const zkReceiptData = {
            transactionHash: '', // Will be filled when payment is completed
            networkId: 'base',
            amount: amount,
            currency: 'USDC',
            recipientAddress: currentAddress,
            fkeyId: currentData.fkeyId,
            senderAddress: senderWalletAddress,
            timestamp: Date.now(),
            status: 'pending_payment',
            paymentLinkId: daimoResponse.id,
            paymentUrl: daimoResponse.url,
            // Include the ZK proof from agent database
            zkProof: currentData.zkProof,
            metadata: {
              transactionType: "Agent Generated Payment Link",
              privacyFeature: "stealth-address",
              zkProofAvailable: !!currentData.zkProof,
              source: "dstealth-agent",
              agentInboxId: this.client?.inboxId,
              userInboxId: senderInboxId
            }
          };
          
          // Store in Redis for frontend access (expires in 7 days - local-first system)
          await redis.set(zkReceiptKey, JSON.stringify(zkReceiptData), { ex: 86400 * 7 });
          console.log(`✅ Payment link stored for frontend ZK receipts: ${zkReceiptKey}`);
        }
      } catch (storageError) {
        console.error('⚠️ Failed to store payment link for frontend access:', storageError);
        // Don't fail the payment creation, just warn
      }
      
      // Generate Coinbase Wallet payment URL
      const coinbaseWalletUrl = this.generateCoinbaseWalletLink(currentAddress, amount, "USDC");

      const addressChangeWarning = isAddressUpdated 
        ? `\n⚠️ Address Updated: Your stealth address was refreshed.`
        : '';

      // 🔧 FIXED: Send Transaction Actions to the same conversation where requested
      await this.sendTransactionActions(senderInboxId, amount, currentData.fkeyId, daimoResponse.url, currentAddress, conversationId, isGroup, conversation);

      // 🔧 FIXED: Return empty string since action buttons are already sent (no duplicate text response)
      return "";

    } catch (error) {
      console.error("Error creating payment link:", error);
      return `❌ Failed to create payment link. Please try again.`;
    }
  }

  /**
   * 🔧 FIXED: Handle fkey.id submissions - Core Feature #2 - Now calls API and stores ZK proof
   */
  private async handleFkeyIdSubmission(
    fkeyInput: string,
    senderInboxId: string,
    conversation?: any,
  ): Promise<string> {
    try {
      const fkeyId = fkeyInput.replace(".fkey.id", "").toLowerCase().trim();

      if (!fkeyId || fkeyId.length < 2) {
        return 'Please provide a valid fkey.id username (e.g., "tantodefi" or "tantodefi.fkey.id")';
      }

      console.log(`🔍 Processing fkey.id submission: ${fkeyId}`);

      // Use the new confirmation flow instead of directly saving
      return await this.handleFkeyConfirmation(fkeyId, senderInboxId, conversation);
    } catch (error) {
      console.error("Error handling fkey.id submission:", error);
      return "❌ Failed to process fkey.id. Please try again.";
    }
  }

  /**
   * 🔧 FIXED: Handle basic keywords and greetings (for onboarded users only)
   */
  private handleBasicKeywords(content: string): string | null {
    const lower = content.toLowerCase();

    // Handle ping command for monitoring/testing
    if (lower.trim() === "ping") {
      return "ok";
    }

    if (
      lower.includes("hello") ||
      lower.includes("hi") ||
      lower.includes("hey") ||
      lower.includes("gm") ||
      lower.includes("good morning")
    ) {
      console.log("📝 Returning greeting for onboarded user");
      return `👋 Hello! I'm dStealth, your privacy assistant 🥷

What can I help you with today?
• 💳 Create payment links: "create payment link for $25"
• 💰 Check balance: \`/balance\`
• 📊 View links: \`/links\`
• ❓ Get help: \`/help\`

How can I assist with your privacy needs?`;
    }

    if (lower.includes("help")) {
      return this.getHelpMessage();
    }

    return null;
  }

  /**
   * Handle user welcome - Core Feature #1 (FluidKey signup)
   * 🔧 SECURITY: Also refreshes stealth address for consistency
   */
  private async handleUserWelcome(senderInboxId: string): Promise<string> {
    try {
      // 🔧 SECURITY: Get fresh user data for consistent experience
      const freshData = await this.getFreshUserStealthData(senderInboxId);

      if (freshData?.userData?.fkeyId) {
        const { userData, currentAddress, isAddressUpdated } = freshData;
        const setupStatus = currentAddress ? "complete" : "pending";
        const zkProofStatus = userData.zkProof ? "✅ Verified" : "⚠️ Pending";

        const addressUpdateWarning = isAddressUpdated 
          ? `\n🔄 Address Updated: Your stealth address was refreshed from fkey.id.`
          : '';

        return `👋 Welcome back, ${userData.fkeyId}! 🥷

Setup Status: ${setupStatus === "complete" ? "✅ Complete" : "⏳ Pending"}
ZK Proof: ${zkProofStatus}${addressUpdateWarning}

Quick Actions:
• "create payment link for $X" - Generate payment links
• "/balance" - Check your earnings
• "/links" - Manage your links

${setupStatus === "pending" ? `Complete Setup: ${this.DSTEALTH_APP_URL}` : ""}

Need help? Type "/help" for all commands!`;
      }

      // New user - Core Feature #1: FluidKey signup promotion
      return `👋 Welcome to dStealth! 🥷

I'm your privacy assistant for anonymous payments & rewards.

🚀 Get Started (2 minutes):

Step 1: 🔑 Get FluidKey (free privacy wallet)
${this.FLUIDKEY_REFERRAL_URL}

Step 2: 📝 Tell me your fkey.id 
Example: "tantodefi.fkey.id"

Step 3: 🚀 Complete setup
${this.DSTEALTH_APP_URL}

💰 What you'll get:
• 🥷 Anonymous payment links
• 🧾 ZK receipts for transactions  
• 🎯 Privacy rewards & points
• 🔒 Stealth addresses for privacy

Try saying: "tantodefi.fkey.id" or "/help"

*Start earning privacy rewards today!*`;
    } catch (error) {
      console.error("Error in user welcome:", error);
      return `👋 Welcome to dStealth! 🥷

Get started with FluidKey: ${this.FLUIDKEY_REFERRAL_URL}
Then tell me your fkey.id username!`;
    }
  }

  /**
   * 🔧 UPDATED: Enhanced help message for onboarded users with Farcaster integration and social discovery
   */
  private getHelpMessage(): string {
    return `🤖 dStealth Agent Commands 🥷

💳 Payment Commands:
• create payment link for $25 - Generate anonymous payment link
• /balance - Check your earnings
• /links - Manage your payment links

🎭 Farcaster Integration:
• /fc or /farcaster - Show your Farcaster profile
• /rewards - Check available privacy rewards
• /send-rewards - Send 0.001 USDC rewards to your FC wallet

🔍 Social Discovery:
• /search-followers - Find which of your FC followers use dStealth
• /find-users <query> - Search FC users for dStealth usage
• Cast "@dstealth yourfkey.fkey.id" on FC to set fkey.id

ℹ️ Info Commands:
• /help - Show this help
• /status - Check agent status
• /fkey username - Look up someone's fkey.id

📋 Group Chat Behavior:
• I only respond to @mentions or payment requests
• Use @dstealth, @dstealth.eth, or @dstealth.base.eth

🎯 Quick Actions:
• "create payment link for $50" - Generate payment link
• "hi" or "hello" - Get personalized greeting
• Questions about privacy payments

🚀 Features:
• 🥷 Anonymous sender privacy
• 🔒 Stealth address technology
• 🧾 ZK proof receipts
• 🎯 Privacy rewards via Farcaster
• 💰 Automatic rewards to FC wallet
• 👥 Social discovery of dStealth users
• 📱 Farcaster cast integration

Complete Dashboard: ${this.DSTEALTH_APP_URL}

🔗 Connect your Coinbase Wallet to Farcaster for rewards!
🎭 Cast "@dstealth yourfkey.fkey.id" on Farcaster to set up!
Need help? Just ask me anything about privacy payments!`;
  }

  /**
   * 🔧 NEW: Get simplified help message for group chats (no markdown, shorter)
   */
  private getGroupHelpMessage(): string {
    return `🤖 dStealth Agent Commands

💳 Payment: "create payment link for $25"
📊 Info: /balance, /status, /fkey username
🎭 Farcaster: /fc, /rewards, /send-rewards
🔍 Search: /search-followers, /find-users query
⚙️ Settings: /links

🥷 Privacy Features:
• Anonymous payments via stealth addresses
• ZK proof receipts for all transactions
• Privacy rewards through Farcaster
• Social discovery of dStealth users

📱 Web App: ${this.DSTEALTH_APP_URL}

💡 Only respond to @mentions in groups!`;
  }

  /**
   * Get agent status message
   */
  private getStatusMessage(): string {
    if (!this.client) {
      return "❌ Agent not available";
    }

    const status = this.getStatus();

    return `📊 Agent Status

Status: ${status.isRunning ? "🟢 Active" : "🔴 Inactive"}
Messages Processed: ${status.processedMessages}
Stream Restarts: ${status.streamRestartCount}
Installations: ${status.installationCount}/5

Core Features: ✅ All operational
• FluidKey referral system
• fkey.id profile management with ZK proofs
• Payment link generation
• ZK receipt creation

XMTP SDK: v3.1.2 with enhanced reliability
Agent Address: ${this.agentAddress}

Agent is running optimally! 🚀`;
  }

  /**
   * Handle balance check
   */
  private async handleBalanceCheck(senderInboxId: string): Promise<string> {
    try {
      const userData = await agentDb.getStealthDataByUser(senderInboxId);

      if (!userData || !userData.fkeyId) {
        return this.getRequiresFkeyMessage(false);
      }

      return `💰 Balance Overview 

Profile: ${userData.fkeyId}.fkey.id
Privacy Points: Coming soon...
Rewards: Coming soon...

💡 Earn More:
• Generate payment links
• Receive stealth payments
• Complete privacy challenges

🚀 Web App: ${this.DSTEALTH_APP_URL}`;
    } catch (error) {
      console.error("Error checking balance:", error);
      return "❌ Error checking balance. Please try again.";
    }
  }

  /**
   * Handle links management
   */
  private async handleLinksManagement(senderInboxId: string): Promise<string> {
    try {
      // 🔧 SECURITY: Refresh stealth address for links management as well
      const freshData = await this.getFreshUserStealthData(senderInboxId);

      if (!freshData) {
        return `🔗 Links Management - Setup Required

To manage your payment links:

1. 🔑 Get FluidKey: ${this.FLUIDKEY_REFERRAL_URL}
2. 📝 Tell me your fkey.id: (e.g., "tantodefi.fkey.id")
3. 🚀 Complete setup: ${this.DSTEALTH_APP_URL}

Then you can create and manage payment links!`;
      }

      if (freshData.error) {
        return `❌ Links Management Error: fkey.id Verification Failed

Could not verify your current fkey.id address: ${freshData.error}

This could mean:
• Your fkey.id profile is no longer accessible
• Your FluidKey account has issues
• Network connectivity problems

Please re-verify your fkey.id: "${freshData.userData.fkeyId}.fkey.id"
Or get support: ${this.FLUIDKEY_REFERRAL_URL}`;
      }

      const { userData, currentAddress, isAddressUpdated } = freshData;

      return `🔗 Payment Links Management

Profile: ${userData.fkeyId}.fkey.id
Active Links: View in dashboard
Analytics: View in dashboard

🚀 Quick Actions:
• "create payment link for $X" - Generate new link
• Full Dashboard: ${this.DSTEALTH_APP_URL}

💡 Pro Tip: Share your payment links to earn privacy rewards!`;
    } catch (error) {
      console.error("Error managing links:", error);
      return "❌ Failed to manage links. Please try again.";
    }
  }

  /**
   * 🔧 FIXED: Handle fkey lookup - Now actually calls the API and returns real data
   */
  private async handleFkeyLookup(
    fkeyId: string,
    senderInboxId: string,
  ): Promise<string> {
    const cleanFkeyId = fkeyId.replace(".fkey.id", "").toLowerCase().trim();

    try {
      console.log(`🔍 Looking up fkey.id: ${cleanFkeyId} for ${senderInboxId}`);

      // Get user address for ZK receipt storage
      let userAddress: string | undefined = undefined;
      try {
        const inboxState = await this.client?.preferences.inboxStateFromInboxIds([senderInboxId]);
        userAddress = inboxState?.[0]?.identifiers[0]?.identifier;
      } catch (error) {
        console.warn('⚠️ Could not resolve user address for fkey lookup:', error);
      }

      // Call the actual fkey.id lookup API with ZK receipt generation
      const lookupResult = await this.callFkeyLookupAPI(cleanFkeyId, userAddress, 'xmtp-agent-fkey-lookup');

      if (lookupResult.error) {
        return `❌ fkey.id Lookup Failed

Could not find ${cleanFkeyId}.fkey.id: ${lookupResult.error}

Common Issues:
• Username might be incorrect
• Profile might be private
• FluidKey account might not exist

🔗 Get FluidKey: ${this.FLUIDKEY_REFERRAL_URL}
💡 Want your own fkey.id? Get FluidKey first!`;
      }

      const hasZkProof = lookupResult.proof
        ? "✅ ZK Proof Available"
        : "⚠️ No ZK Proof";
      const address = lookupResult.address || "Unknown";

      return `🔍 fkey.id Lookup Result

Profile: ${cleanFkeyId}.fkey.id
Address: ${address.slice(0, 6)}...${address.slice(-4)}
ZK Proof: ${hasZkProof}
Status: ✅ Verified

🚀 Profile Features:
• Anonymous payment links
• Cryptographic identity verification
• Privacy-preserving transactions

Want to connect this profile? Just say "${cleanFkeyId}.fkey.id"
Get your own FluidKey: ${this.FLUIDKEY_REFERRAL_URL}`;
    } catch (error) {
      console.error("Error in fkey lookup:", error);
      return `❌ Lookup Error

Failed to lookup ${cleanFkeyId}.fkey.id. Please try again.

Get FluidKey: ${this.FLUIDKEY_REFERRAL_URL}`;
    }
  }

  /**
   * 🔧 NEW: Handle Farcaster profile command
   */
  private async handleFarcasterProfile(senderInboxId: string): Promise<string> {
    try {
      // Check if user has fkey.id set
      const userData = await agentDb.getStealthDataByUser(senderInboxId);
      
      if (!userData?.fkeyId) {
        return this.getRequiresFkeyMessage(false);
      }

      if (!this.client) {
        return "❌ Agent not available";
      }

      // Get sender's wallet address
      const inboxState = await this.client.preferences.inboxStateFromInboxIds([senderInboxId]);
      const senderAddress = inboxState[0]?.identifiers[0]?.identifier;

      if (!senderAddress) {
        return "❌ Could not get your wallet address";
      }

      console.log(`🎭 Fetching Farcaster profile for ${senderAddress}`);

      // Get Farcaster context
      const farcasterContext = await this.getFarcasterContext(senderAddress);

      if (!farcasterContext) {
        return `🎭 No Farcaster Profile Found

Your wallet address (${senderAddress.slice(0, 8)}...${senderAddress.slice(-6)}) is not connected to a Farcaster account.

🔗 Connect your wallet to Farcaster:
• Visit warpcast.com
• Connect your wallet
• Set up your profile

Once connected, I'll be able to:
• Send rewards to your FC wallet
• Provide personalized Farcaster context
• Enhance your privacy experience

Try again with /fc after connecting!`;
      }

      return `🎭 Your Farcaster Profile

@${farcasterContext.username} (${farcasterContext.displayName})
${farcasterContext.verified ? '✅ Verified' : '⚪ Not Verified'}
📍 FID: ${farcasterContext.fid}

📊 Stats:
• Followers: ${farcasterContext.followerCount?.toLocaleString() || 'N/A'}
• Following: ${farcasterContext.followingCount?.toLocaleString() || 'N/A'}
• Bio: ${farcasterContext.bio || 'No bio set'}

💰 Rewards Available:
• Privacy rewards: /rewards
• Send rewards: /send-rewards

🔗 Wallet Connection:
• Connected: ${senderAddress.slice(0, 8)}...${senderAddress.slice(-6)}
• Custody: ${farcasterContext.custodyAddress.slice(0, 8)}...${farcasterContext.custodyAddress.slice(-6)}
• Verified Addresses: ${farcasterContext.verifiedAddresses.length}

Ready to earn privacy rewards! 🥷`;

    } catch (error) {
      console.error("Error handling Farcaster profile:", error);
      return "❌ Error fetching Farcaster profile. Please try again.";
    }
  }

  /**
   * 🔧 NEW: Handle rewards command
   */
  private async handleRewardsCommand(senderInboxId: string): Promise<string> {
    try {
      // Check if user has fkey.id set
      const userData = await agentDb.getStealthDataByUser(senderInboxId);
      
      if (!userData?.fkeyId) {
        return this.getRequiresFkeyMessage(false);
      }

      if (!this.client) {
        return "❌ Agent not available";
      }

      // Get sender's wallet address
      const inboxState = await this.client.preferences.inboxStateFromInboxIds([senderInboxId]);
      const senderAddress = inboxState[0]?.identifiers[0]?.identifier;

      if (!senderAddress) {
        return "❌ Could not get your wallet address";
      }

      // Get Farcaster context
      const farcasterContext = await this.getFarcasterContext(senderAddress);

      if (!farcasterContext) {
        return `💰 Rewards - FC Connection Required

To earn privacy rewards, connect your wallet to Farcaster:

🔗 Setup Steps:
1. Visit warpcast.com
2. Connect your wallet: ${senderAddress.slice(0, 8)}...${senderAddress.slice(-6)}
3. Set up your profile
4. Return here with /fc

🎯 Available Rewards:
• Privacy usage rewards: 0.001 USDC per stealth payment
• Referral rewards: Coming soon
• Achievement rewards: Coming soon

Connect to Farcaster to unlock rewards! 🚀`;
      }

      // Get user's stealth data (userData already declared at function start)
      const hasStealthSetup = userData?.fkeyId && userData?.stealthAddress;

      return `💰 Privacy Rewards Dashboard

👤 Profile: @${farcasterContext.username}
🔗 Connected: ${hasStealthSetup ? '✅ Stealth Setup Complete' : '⚠️ Setup Required'}

🎯 Available Rewards:
• 💳 Create Payment Link: 0.001 USDC
• 🧾 Receive Stealth Payment: 0.001 USDC
• 🎪 Weekly Challenges: Up to 0.1 USDC

📊 Current Status:
• Privacy Points: Coming soon
• Total Earned: Coming soon
• Rank: Coming soon

🚀 Earn More:
• Complete your fkey.id setup: /set yourUsername
• Generate payment links: "create payment link for $X"
• Use stealth addresses for privacy

Ready to earn? Type /send-rewards to claim available rewards!`;

    } catch (error) {
      console.error("Error handling rewards command:", error);
      return "❌ Error fetching rewards. Please try again.";
    }
  }

  /**
   * 🔧 NEW: Handle send rewards command
   */
  private async handleSendRewardsCommand(senderInboxId: string): Promise<string> {
    try {
      if (!this.client) {
        return "❌ Agent not available";
      }

      // Get sender's wallet address
      const inboxState = await this.client.preferences.inboxStateFromInboxIds([senderInboxId]);
      const senderAddress = inboxState[0]?.identifiers[0]?.identifier;

      if (!senderAddress) {
        return "❌ Could not get your wallet address";
      }

      // Get Farcaster context
      const farcasterContext = await this.getFarcasterContext(senderAddress);

      if (!farcasterContext) {
        return `💰 Send Rewards - FC Required

To receive privacy rewards, connect your wallet to Farcaster first:

🔗 Setup:
1. Visit warpcast.com
2. Connect wallet: ${senderAddress.slice(0, 8)}...${senderAddress.slice(-6)}
3. Complete profile setup
4. Return with /fc

Then you can receive rewards via Farcaster!`;
      }

      // Check if user has stealth setup
      const userData = await agentDb.getStealthDataByUser(senderInboxId);
      
      if (!userData?.fkeyId || !userData?.stealthAddress) {
        return `💰 Send Rewards - Setup Required

Hi @${farcasterContext.username}! 

To earn privacy rewards, complete your stealth setup:

🔑 Step 1: Set fkey.id
• /set yourUsername
• Connect to FluidKey: ${this.FLUIDKEY_REFERRAL_URL}

🚀 Step 2: Generate payment links
• "create payment link for $X"

Then you can claim rewards! 🎯`;
      }

      // Try to send rewards
      console.log(`💰 Attempting to send rewards to FID: ${farcasterContext.fid}`);
      
      const rewardResult = await this.sendFarcasterRewards(farcasterContext.fid, 0.001);

      if (rewardResult.success) {
        return `🎉 Rewards Sent Successfully!

👤 Recipient: @${farcasterContext.username}
💰 Amount: 0.001 USDC
🎯 Reward Type: Privacy Usage Bonus
🔗 Transaction: ${rewardResult.txHash}

✅ Rewards sent to your Farcaster wallet!

🚀 Keep earning:
• Generate more payment links
• Use stealth addresses
• Complete privacy challenges

Thank you for using dStealth! 🥷`;
      } else {
        return `❌ Reward Send Failed

Could not send rewards to @${farcasterContext.username}:
${rewardResult.error}

🔧 Common Issues:
• Neynar API configuration
• Insufficient sponsor funds
• Network connectivity

Try again later or contact support at ${this.DSTEALTH_APP_URL}`;
      }

    } catch (error) {
      console.error("Error handling send rewards command:", error);
      return "❌ Error sending rewards. Please try again.";
    }
  }

  /**
   * 🔧 NEW: Handle search followers command
   */
  private async handleSearchFollowersCommand(senderInboxId: string): Promise<string> {
    try {
      if (!this.client) {
        return "❌ Agent not available";
      }

      // Get sender's wallet address
      const inboxState = await this.client.preferences.inboxStateFromInboxIds([senderInboxId]);
      const senderAddress = inboxState[0]?.identifiers[0]?.identifier;

      if (!senderAddress) {
        return "❌ Could not get your wallet address";
      }

      // Get Farcaster context
      const farcasterContext = await this.getFarcasterContext(senderAddress);

      if (!farcasterContext) {
        return `🔍 Search Followers - FC Required

To search your followers for dStealth users, connect your wallet to Farcaster:

🔗 Setup:
1. Visit warpcast.com
2. Connect wallet: ${senderAddress.slice(0, 8)}...${senderAddress.slice(-6)}
3. Set up your profile
4. Return with /fc

Then you can discover which of your followers use dStealth!`;
      }

      console.log(`🔍 Analyzing followers for @${farcasterContext.username} (FID: ${farcasterContext.fid})`);

      // Analyze followers for dStealth usage
      const followerAnalysis = await this.analyzeFollowersForDStealth(farcasterContext.fid);

      if (followerAnalysis.length === 0) {
        return `🔍 Follower Analysis Results

@${farcasterContext.username}, I couldn't fetch your followers right now.

This could be due to:
• Neynar API rate limits
• Network connectivity issues
• Your profile privacy settings

Try again in a few minutes, or contact support if issues persist.`;
      }

      const dStealthUsers = followerAnalysis.filter(user => user.hasFkey);
      const totalFollowers = followerAnalysis.length;

      if (dStealthUsers.length === 0) {
        return `🔍 Follower Analysis Results

@${farcasterContext.username}, I analyzed ${totalFollowers} of your followers.

❌ No dStealth Users Found

None of your recent followers have set up fkey.id yet.

🚀 Spread the word:
• Share dStealth with your community
• Tell them about privacy rewards
• Get FluidKey: ${this.FLUIDKEY_REFERRAL_URL}

Try /find-users <name> to search for specific users!`;
      }

      // Format results
      const userList = dStealthUsers
        .slice(0, 10) // Show max 10 results
        .map(user => {
          const verifiedBadge = user.verified ? ' ✅' : '';
          return `• @${user.username}${verifiedBadge} → ${user.fkeyId}.fkey.id`;
        })
        .join('\n');

      const moreResults = dStealthUsers.length > 10 ? `\n\n... and ${dStealthUsers.length - 10} more dStealth users!` : '';

      return `🔍 Follower Analysis Results

@${farcasterContext.username}, I found ${dStealthUsers.length} dStealth users among ${totalFollowers} followers:

${userList}${moreResults}

🎯 Social Discovery:
• Use /find-users <name> to search for more users
• Share fkey.id with followers for privacy rewards
• Connect more friends to expand the privacy network

Ready to explore more? 🕵️‍♂️`;

    } catch (error) {
      console.error("Error handling search followers command:", error);
      return "❌ Error searching followers. Please try again.";
    }
  }

  /**
   * 🔧 ENHANCED: Handle find users command using comprehensive search API
   */
  private async handleFindUsersCommand(searchQuery: string, senderInboxId: string): Promise<string> {
    try {
      if (!this.client) {
        return "❌ Agent not available";
      }

      console.log(`🔍 Comprehensive find users for: ${searchQuery}`);

      // Use the comprehensive search API
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:5001';
      const response = await fetch(`${backendUrl}/api/user/search/comprehensive?query=${encodeURIComponent(searchQuery)}&limit=10`);

      if (!response.ok) {
        throw new Error(`Search API failed: ${response.status}`);
      }

      const searchData = await response.json();

      if (!searchData.success || searchData.results.length === 0) {
        return `🔍 Comprehensive Search Results

No users found for "${searchQuery}" across any data source.

Try searching for:
• Username (e.g., vitalik)
• Display name (e.g., "Ethereum") 
• Handle (e.g., @tantodefi)

🌐 Searched: All available users
📍 Sources: Agent DMs, dStealth miniapp, Farcaster casts

🔗 Get more users on dStealth:
• Share FluidKey: ${this.FLUIDKEY_REFERRAL_URL}
• Invite friends to set fkey.id
• Earn referral rewards (coming soon)`;
      }

      const dStealthUsers = searchData.results.filter((user: any) => user.hasFkey);
      const totalResults = searchData.results.length;
      const sources = searchData.sources;

      // Format results with source information
      let resultMessage = `🔍 Comprehensive Search Results

Found ${totalResults} users for "${searchQuery}":
🌐 Sources: ${Object.entries(sources)
  .filter(([_, count]) => (count as number) > 0)
  .map(([source, count]) => {
    const sourceLabel = source === 'agent_db' ? 'Agent' : source === 'frontend_db' ? 'Frontend' : 'Farcaster';
    return `${sourceLabel}: ${count}`;
  })
  .join(', ')}`;

      if (dStealthUsers.length > 0) {
        const dStealthList = dStealthUsers
          .slice(0, 5) // Show max 5 dStealth users
          .map((user: any) => {
            const verifiedBadge = user.verified ? ' ✅' : '';
            const sourceIcon = user.source === 'agent_db' ? '🔗' : user.source === 'frontend_db' ? '💻' : '🎭';
            return `${sourceIcon} @${user.username}${verifiedBadge} → ${user.fkeyId}.fkey.id`;
          })
          .join('\n');

        resultMessage += `\n\n🥷 dStealth Users (${dStealthUsers.length}):
${dStealthList}`;
      }

      const regularUsers = searchData.results.filter((user: any) => !user.hasFkey);
      if (regularUsers.length > 0) {
        const regularList = regularUsers
          .slice(0, 3) // Show max 3 regular users
          .map((user: any) => {
            const verifiedBadge = user.verified ? ' ✅' : '';
            const sourceIcon = user.source === 'agent_db' ? '🔗' : user.source === 'frontend_db' ? '💻' : '🎭';
            return `${sourceIcon} @${user.username}${verifiedBadge} (no fkey.id yet)`;
          })
          .join('\n');

        resultMessage += `\n\n⚪ Other Users (${regularUsers.length}):
${regularList}`;

        if (regularUsers.length > 3) {
          resultMessage += `\n... and ${regularUsers.length - 3} more users`;
        }
      }

      resultMessage += `\n\n🚀 Grow the Network:
• Invite users to get fkey.id
• Share FluidKey: ${this.FLUIDKEY_REFERRAL_URL}
• Earn rewards for referrals (coming soon)

🔗 = Found users (from Agent DMs, dStealth miniapp, Farcaster casts)
Ready to connect? 🌐`;

      return resultMessage;

    } catch (error) {
      console.error("Error in comprehensive find users:", error);
      
      // Fallback to original Farcaster search  
      try {
        console.log('🔄 Falling back to Farcaster-only search...');
        const searchResults = await this.searchFarcasterUsers(searchQuery);
        
        if (searchResults.length > 0) {
          const dStealthUsers = searchResults.filter(user => user.hasFkey);
          
          let resultMessage = `🔍 Search Results (Fallback)

Found ${searchResults.length} users for "${searchQuery}":`;

          if (dStealthUsers.length > 0) {
            const dStealthList = dStealthUsers
              .slice(0, 3)
              .map(user => {
                const verifiedBadge = user.verified ? ' ✅' : '';
                return `🥷 @${user.username}${verifiedBadge} → ${user.fkeyId}.fkey.id`;
              })
              .join('\n');

            resultMessage += `\n\n🥷 dStealth Users (${dStealthUsers.length}):
${dStealthList}`;
          }

          resultMessage += `\n\n⚠️ Using fallback search - comprehensive search temporarily unavailable.`;
          return resultMessage;
        }
      } catch (fallbackError) {
        console.error('Fallback search also failed:', fallbackError);
      }

      return "❌ Search temporarily unavailable. Please try again later.";
    }
  }

  /**
   * 🔧 ENHANCED: Handle search command using comprehensive search API
   */
  private async handleSearchCommand(username: string, senderInboxId: string): Promise<string> {
    try {
      if (!username || username.length < 1) {
        return `❌ Please provide a username to search for.

Examples:
• /search tantodefi
• /search @vitalik
• /search ethereum.eth
• /search user.base.eth`;
      }

      console.log(`🔍 Enhanced search for: ${username}`);

      // 🔧 STEP 1: Resolve user input to address if possible
      const resolution = await this.resolveUserInput(username);
      
      console.log(`📍 Search resolution:`, {
        input: resolution.originalInput,
        type: resolution.inputType,
        resolved: resolution.resolvedAddress ? `${resolution.resolvedAddress.slice(0, 8)}...` : 'null'
      });

      // 🔧 STEP 2: Search database with both username and resolved address
      const searchResult = await this.searchDatabaseForFkey(username, resolution.resolvedAddress || undefined);
      
      if (searchResult.fkeyId) {
        // Found fkey.id in database
        const resolvedInfo = resolution.resolvedAddress ? `\n🔗 Resolved from: ${resolution.resolvedFrom || resolution.originalInput}` : '';
        
        return `🔍 User Found! 🔗

👤 ${username}${resolvedInfo}
🔑 FluidKey: ${searchResult.fkeyId}.fkey.id
💳 Privacy payments enabled

💰 You can send anonymous payments to this user!

🚀 Try it:
• "create payment link for $25"
• Share the link with them
• They'll receive payments to their stealth address

🥷 Privacy enabled! 🔒

📊 Found by: ${searchResult.foundBy} search
📍 Sources: Agent DMs, dStealth miniapp, Farcaster casts`;
      }

      // 🔧 STEP 3: If not found in database, check if we resolved an address
      if (resolution.resolvedAddress) {
        const addressType = resolution.inputType === 'ens_name' ? 'ENS name' : 
                          resolution.inputType === 'base_name' ? 'Base name' : 
                          resolution.inputType === 'farcaster_username' ? 'Farcaster username' : 'address';
        
        return `🔍 Address Found (No FluidKey)

👤 ${username}
🔗 ${addressType} resolved to: ${resolution.resolvedAddress.slice(0, 8)}...${resolution.resolvedAddress.slice(-6)}
❌ No fkey.id set up yet

💡 Help them get started:
• Share FluidKey: ${this.FLUIDKEY_REFERRAL_URL}
• Tell them to cast "@dstealth username.fkey.id" on Farcaster
• They can also DM me at @dstealth.base.eth

🚀 Grow the privacy network together!

📊 Address resolution: ${resolution.inputType} → wallet address`;
      }

      // 🔧 STEP 4: Fallback to comprehensive search API
      try {
        const backendUrl = process.env.BACKEND_URL || 'http://localhost:5001';
        const response = await fetch(`${backendUrl}/api/user/search/comprehensive?query=${encodeURIComponent(username)}&limit=5`);

        if (response.ok) {
          const searchData = await response.json();

          if (searchData.success && searchData.results.length > 0) {
            // Look for exact username match first
            let exactMatch = searchData.results.find((user: any) => 
              user.username.toLowerCase() === username.toLowerCase() ||
              (user.fkeyId && user.fkeyId.toLowerCase() === username.toLowerCase())
            );

            // If no exact match, use the first result with fkey, then first overall
            if (!exactMatch) {
              exactMatch = searchData.results.find((user: any) => user.hasFkey) || searchData.results[0];
            }

            if (exactMatch.hasFkey) {
              const verifiedBadge = exactMatch.verified ? ' ✅' : '';
              const sourceIcon = exactMatch.source === 'agent_db' ? '🔗' : exactMatch.source === 'frontend_db' ? '💻' : '🎭';
              
              return `🔍 User Found! ${sourceIcon}

👤 @${exactMatch.username}${verifiedBadge} (${exactMatch.displayName})
🔑 FluidKey: ${exactMatch.fkeyId}.fkey.id
💳 ${exactMatch.stealthAddress ? 'Stealth payments enabled' : 'Standard payments'}

💰 You can send anonymous payments to this user!

🚀 Try it:
• "create payment link for $25"
• Share the link with @${exactMatch.username}
• They'll receive payments to their stealth address

🥷 Privacy enabled! 🔒

📊 Found in: All available users
📍 Sources: Agent DMs, dStealth miniapp, Farcaster casts`;
            } else {
              const verifiedBadge = exactMatch.verified ? ' ✅' : '';
              
              return `🔍 User Found (No FluidKey) 🔗

👤 @${exactMatch.username}${verifiedBadge} (${exactMatch.displayName})
❌ No fkey.id set up yet

💡 Help them get started:
• Share FluidKey: ${this.FLUIDKEY_REFERRAL_URL}
• Tell them to cast "@dstealth username.fkey.id" on Farcaster
• They can also DM me at @dstealth.base.eth

🚀 Grow the privacy network together!

📊 Found in: All available users
📍 Sources: Agent DMs, dStealth miniapp, Farcaster casts`;
            }
          }
        }
      } catch (apiError) {
        console.error('Comprehensive search API failed:', apiError);
      }

      // 🔧 STEP 5: Final fallback to Farcaster search
      try {
        console.log('🔄 Falling back to Farcaster-only search...');
        const farcasterResults = await this.searchFarcasterUsers(username);
        
        if (farcasterResults.length > 0) {
          const exactMatch = farcasterResults.find(user => 
            user.username.toLowerCase() === username.toLowerCase()
          ) || farcasterResults[0];

          const verifiedBadge = exactMatch.verified ? ' ✅' : '';
          
          if (exactMatch.hasFkey) {
            return `🔍 User Found! (Fallback Search)

👤 @${exactMatch.username}${verifiedBadge} (${exactMatch.displayName})
🔑 FluidKey: ${exactMatch.fkeyId}.fkey.id

💰 You can send anonymous payments to this user!

⚠️ Using fallback search - comprehensive search temporarily unavailable.`;
          } else {
            return `🔍 User Found (No FluidKey)

👤 @${exactMatch.username}${verifiedBadge} (${exactMatch.displayName})
❌ No fkey.id set up yet

💡 Help them get started with FluidKey!

⚠️ Using fallback search - comprehensive search temporarily unavailable.`;
          }
        }
      } catch (fallbackError) {
        console.error('Fallback search also failed:', fallbackError);
      }

      // 🔧 STEP 6: Nothing found anywhere
      const inputTypeHelp = resolution.inputType === 'ens_name' ? 'ENS name' : 
                           resolution.inputType === 'base_name' ? 'Base name' : 
                           resolution.inputType === 'farcaster_username' ? 'Farcaster username' : 'username';
      
      return `❌ User Not Found

Sorry, I couldn't find "${username}" anywhere.

🔍 Searched as: ${inputTypeHelp}
🌐 Checked: All available users
📍 Sources: Agent DMs, dStealth miniapp, Farcaster casts
${resolution.inputType !== 'plain_username' ? `🔗 Address resolution: ${resolution.inputType === 'ens_name' ? 'ENS' : resolution.inputType === 'base_name' ? 'Base' : 'Farcaster'} lookup attempted` : ''}

💡 Suggestions:
• Check the spelling
• Try with @ prefix for Farcaster: @${username}
• Try with .eth or .base.eth suffix
• Use /find-users ${username} for broader search

Want to invite them to dStealth? Share this:
• Get FluidKey: ${this.FLUIDKEY_REFERRAL_URL}
• Cast "@dstealth username.fkey.id" on Farcaster
• DM me at @dstealth.base.eth`;

    } catch (error) {
      console.error("Error in enhanced search:", error);
      return `❌ Search temporarily unavailable. Please try again later.`;
    }
  }

  /**
   * 🔧 NEW: Handle Intent messages from action buttons
   */
  private async handleIntentMessage(
    intent: IntentContent,
    senderInboxId: string,
  ): Promise<string> {
    try {
      const actionId = intent.actionId;
      const metadata = intent.metadata;

      console.log(`🎯 Handling Intent Action: ${actionId}`);

      // Create unique intent message ID for deduplication
      const intentMessageId = `${senderInboxId}-${intent.id}-${actionId}`;
      
      // DEDUPLICATION: Check if we've already processed this intent
      if (this.processedIntentIds.has(intentMessageId)) {
        console.log(`🔄 DUPLICATE Intent detected - skipping: ${intentMessageId}`);
        console.log(`   Already processed intents: ${this.processedIntentIds.size}`);
        return ""; // Return empty string to avoid duplicate responses
      }
      
      // Mark this intent as processed
      this.processedIntentIds.add(intentMessageId);
      console.log(`✅ Intent marked as processed: ${intentMessageId}`);
      console.log(`   Total processed intents: ${this.processedIntentIds.size}`);
      
      // Clean up old intent IDs to prevent memory leaks (keep last 100)
      if (this.processedIntentIds.size > 100) {
        const oldIntents = Array.from(this.processedIntentIds).slice(0, 50);
        oldIntents.forEach(id => this.processedIntentIds.delete(id));
        console.log(`🧹 Cleaned up ${oldIntents.length} old intent IDs`);
      }

      // Extract action set ID from intent.id (e.g., "help-actions-1752163068713-wdn9zl")
      const actionSetId = intent.id;
      console.log(`🔍 Action Set ID: ${actionSetId}`);

      // Check if this is from a recent valid action set for this user
      const recentActionSets = this.userRecentActionSets.get(senderInboxId) || [];
      console.log(`🔍 Action Set Validation for user ${senderInboxId}:`);
      console.log(`   Current Intent Action Set: ${actionSetId}`);
      console.log(`   Recent Valid Action Sets: [${recentActionSets.join(', ')}]`);
      console.log(`   Total Recent Sets: ${recentActionSets.length}`);

      if (!recentActionSets.includes(actionSetId)) {
        console.log(`❌ Action set validation failed - ignoring outdated action: ${actionSetId}`);
        return "⚠️ This action has expired. Please use /help to get fresh actions.";
      }

      console.log(`✅ Action set validation passed - processing action`);

      // Extract the base action ID (remove timestamp and random suffix)
      const baseActionId = actionId.replace(/-\d+-[a-z0-9]+$/, '');
      console.log(`🎯 Base Action ID extracted: "${baseActionId}" from "${actionId}"`);

      // Handle different action types with TBA patterns
      switch (baseActionId) {
        case 'create-payment-link':
          return `💳 Create Payment Link

To create a payment link, simply specify any amount:

Examples:
• "create payment link for $25"
• "create payment link for $100" 
• "create payment link for $1500"
• "create payment link for $50.50"

Features:
• 🥷 Anonymous sender privacy
• ⚡ Direct to stealth address via Daimo
• 🧾 ZK proof receipts
• 🎯 Earn privacy rewards

Try it now! Just type the amount you want.`;

        case 'search-user':
          return `🔍 Search for User's fkey.id

Type a .base.eth handle or Farcaster username to search for their fkey.id:

Examples:
• tantodefi
• vitalik.eth
• @username
• user.base.eth

I'll search across all databases and tell you if they have set their fkey.id!

💡 Just type the username you want to search for.`;

        case 'check-balance':
          return await this.handleBalanceCheck(senderInboxId);

        case 'send-transaction':
          return `🚀 Send Transaction

I can help you create transaction requests for:
• 💰 Token transfers (ETH, USDC, etc.)
• 🔒 Privacy payments via stealth addresses
• 📱 Cross-chain transactions

Examples:
• "send 0.1 ETH to tantodefi"
• "send 25 USDC to @username"
• "create payment link for $100"

🥷 All transactions include privacy features and ZK receipts!

What would you like to send?`;

        case 'send-to-stealth':
          const stealthPaymentData = this.getPaymentDataForUser(senderInboxId);
          if (stealthPaymentData) {
            try {
              // Get the user's wallet address for the transaction
              const inboxState = await this.client!.preferences.inboxStateFromInboxIds([senderInboxId]);
              const senderWalletAddress = inboxState[0]?.identifiers[0]?.identifier;
              
              if (!senderWalletAddress) {
                return `❌ Could not determine your wallet address. Please try again.`;
              }

              // Find the user's conversation to send the transaction request
              const conversations = await this.client!.conversations.list();
              const targetConversation = conversations.find(conv => {
                if (!(conv instanceof Group)) {
                  return conv.peerInboxId === senderInboxId;
                }
                return false;
              });

              if (!targetConversation) {
                return `❌ Could not find conversation to send transaction request.`;
              }

              // Create the stealth wallet send calls
              const walletSendCalls = this.createStealthWalletSendCalls(
                senderWalletAddress,
                stealthPaymentData.stealthAddress,
                stealthPaymentData.amount,
                stealthPaymentData.fkeyId
              );

              // Send the wallet transaction request
              await targetConversation.send(walletSendCalls, ContentTypeWalletSendCalls);

              return `✅ Stealth Transaction Request Created!

💰 Amount: $${stealthPaymentData.amount} USDC
🎯 To: ${stealthPaymentData.fkeyId}.fkey.id
📍 Address: ${stealthPaymentData.stealthAddress.slice(0, 8)}...${stealthPaymentData.stealthAddress.slice(-6)}

🥷 Privacy Features Active:
• Anonymous sender protection
• ZK proof receipts
• Stealth address technology

⚡ Check your wallet to approve the transaction!`;

            } catch (error) {
              console.error("Error creating stealth transaction:", error);
              return `❌ Failed to create stealth transaction. Please try again.`;
            }
          } else {
            return `❌ Payment data not found. Please create a new payment link.`;
          }

        case 'dstealth-miniapp':
          return `https://dstealth.xyz`;

        case 'tba-request-link':
          const paymentData = this.getPaymentDataForUser(senderInboxId);
          if (paymentData) {
            return `📱 TBA Request Link

${paymentData.cbwLink}

💡 This link works with any compatible wallet app:
• Coinbase Wallet
• Trust Wallet
• MetaMask Mobile
• Rainbow Wallet

🔗 Share this link to request $${paymentData.amount} USDC from anyone!

📍 Payment goes to: ${paymentData.fkeyId}.fkey.id
🥷 Privacy features included automatically`;
          } else {
            return `❌ Payment data not found. Please create a new payment link.`;
          }

        case 'daimo-pay-link':
          const daimoPaymentData = this.getPaymentDataForUser(senderInboxId);
          if (daimoPaymentData) {
            return `🔗 Daimo Pay Link

${daimoPaymentData.daimoLink}

💡 Best experience with Daimo:
• Direct USDC transfers
• Built-in privacy features
• Mobile-optimized
• Instant transactions

🔗 Share this link to receive $${daimoPaymentData.amount} USDC!

📍 Payment goes to: ${daimoPaymentData.fkeyId}.fkey.id
🥷 ZK receipts included automatically`;
          } else {
            return `❌ Payment data not found. Please create a new payment link.`;
          }

        default:
          // Handle legacy action IDs
          return await this.handleLegacyIntentAction(baseActionId, senderInboxId);
      }

    } catch (error) {
      console.error("❌ Error handling intent message:", error);
      return "❌ Error processing action. Please try again with /help.";
    }
  }

  /**
   * 🔧 NEW: Handle legacy action IDs for backwards compatibility
   */
  private async handleLegacyIntentAction(baseActionId: string, senderInboxId: string): Promise<string> {
    switch (baseActionId) {
      case 'have-fkey':
        return await this.handleHaveFkeyFlow(senderInboxId);

      case 'no-fkey':
        return await this.handleNoFkeyFlow(senderInboxId);

      case 'confirm-fkey':
        return await this.processFkeyConfirmation(senderInboxId, true);

      case 'cancel-fkey':
        return await this.processFkeyConfirmation(senderInboxId, false);

      case 'get-help':
        return this.getHelpMessage();

      case 'setup-fkey':
        return await this.handleHaveFkeyFlow(senderInboxId);

      case 'manage-links':
        return await this.handleLinksManagement(senderInboxId);

      case 'check-status':
        return this.getStatusMessage();

      case 'create-another':
        return `➕ Create Another Payment Link

Ready to create another payment link?

Examples:
• "create payment link for $25"
• "create payment link for $100"
• "create payment link for $500"

Features:
• 🥷 Anonymous sender privacy
• ⚡ Direct to stealth address
• 🎯 Earn privacy rewards
• 🧾 ZK proof receipts

Just say the amount: "create payment link for $X"`;

      default:
        return `❌ Unknown action: ${baseActionId}. Please use /help to get available actions.`;
    }
  }

  /**
   * 🔧 FIXED: Send help actions to the conversation where requested (group or DM)
   */
  private async sendHelpActionsMessage(senderInboxId: string, isGroup: boolean, conversation?: any): Promise<void> {
    try {
      if (!this.client) return;

      const userData = await agentDb.getStealthDataByUser(senderInboxId);
      const renderTimestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);

      const helpActions: ActionsContent = {
        id: `help-actions-${renderTimestamp}-${randomSuffix}`,
        description: `🤖 dStealth Agent Help 🥷

Hi ${userData?.fkeyId || 'there'}! I'm your privacy assistant. Choose what you'd like to do:`,
        actions: [
          {
            id: `create-payment-link-${renderTimestamp}-${randomSuffix}`,
            label: "💳 Create Payment Link",
            style: "primary" as const
          },
          {
            id: `search-user-${renderTimestamp}-${randomSuffix}`,
            label: "🔍 Search User",
            style: "secondary" as const
          },
          {
            id: `check-balance-${renderTimestamp}-${randomSuffix}`,
            label: "💰 Check Balance",
            style: "secondary" as const
          },
          {
            id: `send-transaction-${renderTimestamp}-${randomSuffix}`,
            label: "🚀 Send Transaction",
            style: "primary" as const
          },
          {
            id: `dstealth-miniapp-${renderTimestamp}-${randomSuffix}`,
            label: "🌐 dStealth App",
            style: "secondary" as const
          }
        ]
      };

      // Track this action set for the user
      if (!this.userRecentActionSets.has(senderInboxId)) {
        this.userRecentActionSets.set(senderInboxId, []);
      }
      
      const userActionSets = this.userRecentActionSets.get(senderInboxId)!;
      userActionSets.push(helpActions.id);
      
      // Keep only the last 5 action sets
      if (userActionSets.length > 5) {
        userActionSets.splice(0, userActionSets.length - 5);
      }

      if (conversation) {
        await conversation.send(helpActions, ContentTypeActions);
      } else {
        // Find the conversation by sender inbox ID
        const conversations = await this.client.conversations.list();
        const targetConversation = conversations.find(conv => {
          // This is a simplified check - in reality you'd need to properly identify the conversation
          return conv.id; // You'd need proper conversation matching logic here
        });
        
        if (targetConversation) {
          await targetConversation.send(helpActions, ContentTypeActions);
        }
      }

      console.log(`✅ Help Actions sent to ${isGroup ? 'group' : 'DM'} with unique ID: ${helpActions.id}`);
      console.log(`📋 Updated recent action sets for user ${senderInboxId}:`);
      console.log(`   Added: ${helpActions.id}`);
      console.log(`   Current sets: [${userActionSets.join(', ')}]`);

    } catch (error) {
      console.error("❌ Error sending help actions:", error);
    }
  }

  /**
   * 🔧 TBA PATTERN: Send actions menu
   */
  private async sendActionsMenu(senderInboxId: string): Promise<void> {
    try {
      if (!this.client) {
        console.log("⚠️ Base agent not available, skipping Actions menu");
        return;
      }

      // Get user's conversations to send actions to
      const conversations = await this.client.conversations.list();
      
      // Find the conversation with this user
      const userConversation = conversations.find(conv => {
        // For DMs, check if this is a 1:1 conversation with the user
        if (!(conv instanceof Group)) {
          return conv.peerInboxId === senderInboxId;
        }
        return false;
      });

      if (!userConversation) {
        console.log("⚠️ User conversation not found, skipping Actions menu");
        return;
      }

      // Generate unique timestamp for this render to reset button states
      const renderTimestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);

      // Create comprehensive Actions menu with unique everything
      const actionsContent: ActionsContent = {
        id: `actions-menu-${renderTimestamp}-${randomSuffix}`,
        description: `🥷 dStealth Agent - Full Actions Menu (${new Date().toLocaleTimeString()}):`,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours from now
        actions: [
          {
            id: `setup-fkey-${renderTimestamp}-${randomSuffix}`,
            label: "🔑 Setup fkey.id",
            style: "primary"
          },
          {
            id: `check-balance-${renderTimestamp}-${randomSuffix}`,
            label: "💰 Check Balance",
            style: "secondary"
          },
          {
            id: `create-payment-link-${renderTimestamp}-${randomSuffix}`,
            label: "💳 Create Payment Link",
            style: "primary"
          },
          {
            id: `manage-links-${renderTimestamp}-${randomSuffix}`,
            label: "🔗 Manage Links",
            style: "secondary"
          },
          {
            id: `check-status-${renderTimestamp}-${randomSuffix}`,
            label: "📊 Check Status",
            style: "secondary"
          }
        ]
      };

      // Send actions using the ActionsCodec
      await userConversation.send(actionsContent, ContentTypeActions);
      console.log(`✅ Actions Menu sent with unique ID: ${actionsContent.id}`);
      
      // Track this action set in recent sets (instead of just latest)
      this.addRecentActionSet(senderInboxId, actionsContent.id);

    } catch (error) {
      console.error("❌ Error sending Actions Menu:", error);
    }
  }

  /**
   * 🔧 FIXED: Send payment-related actions with proper conversation handling
   */
  private async sendTransactionActions(
    senderInboxId: string,
    amount: string,
    fkeyId: string,
    daimoLink: string,
    stealthAddress: string,
    conversationId?: string,
    isGroup?: boolean,
    conversation?: any
  ): Promise<void> {
    try {
      if (!this.client) {
        console.log("⚠️ Base agent not available, skipping Transaction Actions");
        return;
      }

      let targetConversation = conversation;

      // If no conversation provided, find the conversation with this user
      if (!targetConversation) {
        const conversations = await this.client.conversations.list();
        
        // Find the specific conversation by ID if provided
        targetConversation = conversationId ? 
          conversations.find(conv => conv.id === conversationId) : null;

        // If no specific conversation or conversation not found, find DM with user
        if (!targetConversation) {
          targetConversation = conversations.find(conv => {
            // For DMs, check if this is a 1:1 conversation with the user
            if (!(conv instanceof Group)) {
              return conv.peerInboxId === senderInboxId;
            }
            return false;
          });
        }
      }

      if (!targetConversation) {
        console.log("⚠️ User conversation not found, skipping Transaction Actions");
        return;
      }

      // 🔧 FIXED: Send payment actions to the same conversation where requested (group or DM)
      console.log(`💳 Sending payment actions to ${isGroup ? 'group' : 'DM'} conversation`);
      
      // 🔧 REMOVED: Don't skip groups - send actions to the requesting conversation

      // Generate unique timestamp for this render to reset button states
      const renderTimestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);

      // Store payment data for self-contained responses
      const paymentData = {
        amount,
        fkeyId,
        daimoLink,
        stealthAddress,
        cbwLink: this.generateCBWRequestLink(stealthAddress, amount, 'USDC'),
        timestamp: renderTimestamp
      };

      // Create transaction-related Actions content with unique everything
      const actionsContent: ActionsContent = {
        id: `transaction-actions-${renderTimestamp}-${randomSuffix}`,
        description: `💳 Payment Link Ready for ${fkeyId}.fkey.id

Amount: $${amount} USDC

Choose your next action:`,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours from now
        actions: [
          {
            id: `send-to-stealth-${renderTimestamp}-${randomSuffix}`,
            label: "💰 Send to Stealth Address",
            style: "primary"
          },
          {
            id: `daimo-pay-link-${renderTimestamp}-${randomSuffix}`,
            label: "🔗 Daimo Pay Link",
            style: "secondary"
          },
          {
            id: `tba-request-link-${renderTimestamp}-${randomSuffix}`,
            label: "📱 TBA Request Link",
            style: "secondary"
          },
          {
            id: `create-another-${renderTimestamp}-${randomSuffix}`,
            label: "➕ Create Another",
            style: "primary"
          }
        ]
      };

      // Send actions using the ActionsCodec
      await targetConversation.send(actionsContent, ContentTypeActions);
      console.log(`✅ Transaction Actions sent to ${isGroup ? 'group' : 'DM'} with unique ID: ${actionsContent.id}`);
      
      // Track this action set in recent sets (instead of just latest)
      this.addRecentActionSet(senderInboxId, actionsContent.id);

      // Store payment data for intent responses (in memory for now)
      this.storePaymentDataForUser(senderInboxId, paymentData);

    } catch (error) {
      console.error("❌ Error sending Transaction Actions:", error);
    }
  }

  // Store payment data for intent responses
  private userPaymentData: Map<string, any> = new Map();

  private storePaymentDataForUser(senderInboxId: string, paymentData: any) {
    this.userPaymentData.set(senderInboxId, paymentData);
  }

  private getPaymentDataForUser(senderInboxId: string) {
    return this.userPaymentData.get(senderInboxId);
  }

  /**
   * 🔧 NEW: Create wallet send calls for USDC transfers to stealth addresses
   * Following the tba-chat-example-bot pattern for real wallet transactions
   */
  private createStealthWalletSendCalls(
    from: string,
    to: string,
    amount: string,
    fkeyId: string
  ): WalletSendCallsParams {
    try {
      // USDC contract address on Base
      const usdcContractBase = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
      
      // Convert amount to smallest unit (USDC has 6 decimals)
      const amountInDecimals = Math.floor(parseFloat(amount) * 1000000);
      
      // ERC20 transfer method signature and data
      const methodSignature = "0xa9059cbb"; // transfer(address,uint256)
      const transactionData = `${methodSignature}${to
        .slice(2)
        .padStart(64, "0")}${BigInt(amountInDecimals).toString(16).padStart(64, "0")}`;

      return {
        version: "1.0",
        from: from as `0x${string}`,
        chainId: "0x2105", // Base network (8453 in hex)
        calls: [
          {
            to: usdcContractBase as `0x${string}`,
            data: transactionData as `0x${string}`,
            metadata: {
              description: `Send $${amount} USDC to ${fkeyId}.fkey.id stealth address`,
              transactionType: "transfer",
              currency: "USDC",
              amount: amountInDecimals.toString(),
              decimals: "6",
              networkId: "base",
              hostname: "dstealth.xyz",
              faviconUrl: "https://dstealth.xyz/dstealth-white-on-black.png",
              title: "dStealth Agent - Stealth Payment",
              // Additional stealth payment metadata
              stealthRecipient: fkeyId,
              stealthAddress: to,
              privacyFeature: "stealth-address",
              zkProofAvailable: "true",
            },
          },
        ],
      };
    } catch (error) {
      console.error("Error creating stealth wallet send calls:", error);
      throw error;
    }
  }

  /**
   * 🔧 NEW: Handle transaction reference messages (from tba-chat-example-bot pattern)
   * When users share their transaction hash after completing a payment
   */
  private async handleTransactionReference(
    transactionRef: TransactionReference,
    senderInboxId: string,
    senderAddress: string
  ): Promise<string> {
    try {
      console.log("🧾 Processing transaction reference:", transactionRef);
      console.log("📊 Full transaction reference object:", JSON.stringify(transactionRef, null, 2));

      // Extract transaction details - the data is nested under transactionReference property
      const txData = transactionRef;
      const txHash = txData.reference;
      const networkId = txData.networkId;
      const metadata = txData.metadata;
      
      console.log("🔍 Extracted transaction data:");
      console.log(`  • txHash: ${txHash}`);
      console.log(`  • networkId: ${networkId}`);
      console.log(`  • metadata:`, metadata ? JSON.stringify(metadata, null, 4) : "null");
      console.log(`  • senderAddress: ${senderAddress}`);
      
      let receiptMessage = `📋 Transaction Receipt

💳 TRANSACTION DETAILS:
• Transaction Hash: ${txHash}
• Network: ${networkId}
• Type: ${metadata?.transactionType || 'Transfer'}
• From: ${metadata?.fromAddress || senderAddress}`;

      // Add amount information if available
      if (metadata?.currency && metadata?.amount && metadata?.decimals) {
        const amount = metadata.amount / Math.pow(10, metadata.decimals);
        receiptMessage += `\n• Amount: ${amount} ${metadata.currency}`;
      }
      
      if (metadata?.toAddress) {
        receiptMessage += `\n• To: ${metadata.toAddress}`;
      }

      // Add dStealth-specific features
      receiptMessage += `\n\n🥷 dStealth Features:
• 🔒 Privacy-enabled transaction
• 🧾 ZK receipt verification
• 🎯 Eligible for privacy rewards

🌐 View full details: ${this.DSTEALTH_APP_URL}
🔗 Blockchain explorer: https://basescan.org/tx/${txHash}

✅ Transaction receipt processed successfully!`;

      return receiptMessage;

    } catch (error) {
      console.error("❌ Error processing transaction reference:", error);
      return "❌ Error processing transaction receipt. Please try again.";
    }
  }

  /**
   * 🔧 NEW: Get blockchain explorer URL for transaction hash
   */
  private getExplorerUrl(txHash: string, networkId: string): string {
    switch (networkId) {
      case "base":
      case "base-mainnet":
        return `https://basescan.org/tx/${txHash}`;
      case "base-sepolia":
        return `https://sepolia.basescan.org/tx/${txHash}`;
      case "ethereum":
      case "mainnet":
        return `https://etherscan.io/tx/${txHash}`;
      case "sepolia":
        return `https://sepolia.etherscan.io/tx/${txHash}`;
      default:
        return `https://basescan.org/tx/${txHash}`;
    }
  }

  /**
   * 🔧 NEW: Get consistent message for non-onboarded users trying to use features requiring fkey
   */
  private getRequiresFkeyMessage(isGroup: boolean = false): string {
    if (isGroup) {
      return `🔒 fkey.id Required

This feature requires fkey.id setup. To get started:

💬 DM me to set up your fkey.id:
• Send me your username (e.g., tantodefi)
• Or use: /set yourUsername

🎭 Or cast on Farcaster:
• Cast: "@dstealth username.fkey.id"

Need FluidKey? Get it here:
${this.FLUIDKEY_REFERRAL_URL}

Once set up, you can use all features! 🚀`;
    } else {
      return `🔑 Setup Required

You need to set your fkey.id to use this feature.

Quick Setup:
• Type your username (e.g., tantodefi)
• Or use: /set yourUsername

🎭 Alternative: Cast on Farcaster
• Cast: "@dstealth username.fkey.id"

Need FluidKey? Get it here:
${this.FLUIDKEY_REFERRAL_URL}

Type /help for full setup instructions.`;
    }
  }

  /**
   * Check if user has fkey.id set and is fully onboarded
   */
  private async isUserOnboarded(senderInboxId: string): Promise<boolean> {
    try {
      // Use cross-platform checking for comprehensive onboarding status
      const crossPlatformData = await this.checkFkeyAcrossAllSources(senderInboxId);
      return !!(crossPlatformData.fkeyId && crossPlatformData.fkeyId.trim().length > 0);
    } catch (error) {
      console.error("Error checking user onboarding status:", error);
      return false;
    }
  }

  /**
   * 🔧 FIXED: Send welcome message with duplicate prevention
   */
  private async sendWelcomeWithActions(senderInboxId: string, conversation?: any): Promise<void> {
    try {
      if (!this.client) {
        console.log("⚠️ Client not available, skipping welcome actions");
        return;
      }

      // 🔧 DUPLICATE PREVENTION: Check if welcome was already sent
      if (this.userWelcomesSent.has(senderInboxId)) {
        console.log(`⚠️ Welcome actions already sent to user: ${senderInboxId}`);
        return;
      }

      let targetConversation = conversation;

      // If no conversation provided, find DM conversation with user
      if (!targetConversation) {
        const conversations = await this.client.conversations.list();
        
        targetConversation = conversations.find(conv => {
          // For DMs, check if this is a 1:1 conversation with the user
          if (!(conv instanceof Group)) {
            return conv.peerInboxId === senderInboxId;
          }
          return false;
        });

        if (!targetConversation) {
          console.log("⚠️ User conversation not found, skipping welcome actions");
          return;
        }
      }

      // 🔧 DUPLICATE PREVENTION: Don't send welcome to groups
      if (targetConversation instanceof Group) {
        console.log("⚠️ Skipping welcome actions for group conversation");
        return;
      }

      // Mark welcome as sent BEFORE sending to prevent race conditions
      this.userWelcomesSent.add(senderInboxId);

      // Generate unique timestamp for this welcome message
      const renderTimestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);

      // Create welcome actions content
      const welcomeActions: ActionsContent = {
        id: `welcome-onboarding-${renderTimestamp}-${randomSuffix}`,
        description: `👋 Welcome to dStealth! 🥷

I'm your privacy assistant for anonymous payments using stealth addresses.

🎯 What I Do:
• Generate stealth addresses for private payments
• Create anonymous payment links
• Provide ZK receipts for transactions
• Help you earn privacy rewards

🔑 To unlock all features, you need to set your fkey.id from FluidKey:

Choose your path:`,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
        actions: [
          {
            id: `have-fkey-${renderTimestamp}-${randomSuffix}`,
            label: "✅ I have an fkey",
            style: "primary"
          },
          {
            id: `no-fkey-${renderTimestamp}-${randomSuffix}`,
            label: "🆕 I don't have an fkey",
            style: "secondary"
          }
        ]
      };

      // Send welcome actions
      await targetConversation.send(welcomeActions, ContentTypeActions);
      console.log(`✅ Welcome actions sent to user: ${senderInboxId}`);
      
      // Track this action set
      this.addRecentActionSet(senderInboxId, welcomeActions.id);

    } catch (error) {
      console.error("❌ Error sending welcome actions:", error);
      // Remove from sent set if sending failed
      this.userWelcomesSent.delete(senderInboxId);
    }
  }

  /**
   * Handle "I have an fkey" flow - prompt for username
   */
  private async handleHaveFkeyFlow(senderInboxId: string): Promise<string> {
    return `🔑 Set Your fkey.id

Please enter your fkey.id username (without .fkey.id):

Examples:
• tantodefi
• alice
• myusername

Just type your username and I'll verify it! 🚀`;
  }

  /**
   * Handle "I don't have an fkey" flow - send signup instructions
   */
  private async handleNoFkeyFlow(senderInboxId: string): Promise<string> {
    return `🆕 Get Your FluidKey Account

FluidKey is a privacy-focused wallet that creates stealth addresses for anonymous payments.

📝 Sign Up Steps:
1. Visit: ${this.FLUIDKEY_REFERRAL_URL}
2. Create your account (use a non-wallet browser)
3. Choose your unique username
4. Complete profile setup

✅ After signup, return here and:
• Type your username (e.g., tantodefi)
• Or use the command: /set yourUsername

🎯 Why FluidKey?
• Generate stealth addresses
• Receive payments anonymously  
• Protect your privacy
• Earn rewards with dStealth

Ready to get started? Visit the link above! 🚀`;
  }

  /**
   * Handle fkey.id confirmation flow
   */
  private async handleFkeyConfirmation(fkeyId: string, senderInboxId: string, conversation?: any): Promise<string> {
    // Store pending confirmation
    this.userConfirmationPending.set(senderInboxId, {
      fkeyId: fkeyId,
      timestamp: Date.now()
    });

    // Send confirmation actions
    await this.sendFkeyConfirmationActions(senderInboxId, fkeyId, conversation);

    return `🔍 Confirm Your fkey.id

Is this correct: ${fkeyId}.fkey.id ?

Please confirm using the buttons below:`;
  }

  /**
   * Send fkey.id confirmation action buttons
   */
  private async sendFkeyConfirmationActions(senderInboxId: string, fkeyId: string, conversation?: any): Promise<void> {
    try {
      if (!this.client) {
        console.log("⚠️ Client not available, skipping confirmation actions");
        return;
      }

      let targetConversation = conversation;

      // If no conversation provided, find DM conversation with user
      if (!targetConversation) {
        const conversations = await this.client.conversations.list();
        
        targetConversation = conversations.find(conv => {
          // For DMs, check if this is a 1:1 conversation with the user
          if (!(conv instanceof Group)) {
            return conv.peerInboxId === senderInboxId;
          }
          return false;
        });

        if (!targetConversation) {
          console.log("⚠️ User conversation not found, skipping confirmation actions");
          return;
        }
      }

      // Generate unique timestamp for this confirmation
      const renderTimestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);

      // Create confirmation actions content
      const confirmationActions: ActionsContent = {
        id: `fkey-confirmation-${renderTimestamp}-${randomSuffix}`,
        description: `🔍 Confirm your fkey.id: ${fkeyId}.fkey.id`,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 minutes
        actions: [
          {
            id: `confirm-fkey-${renderTimestamp}-${randomSuffix}`,
            label: "✅ Yes, that's correct",
            style: "primary"
          },
          {
            id: `cancel-fkey-${renderTimestamp}-${randomSuffix}`,
            label: "❌ No, let me try again",
            style: "secondary"
          }
        ]
      };

      // Send confirmation actions
      await targetConversation.send(confirmationActions, ContentTypeActions);
      console.log(`✅ Confirmation actions sent for fkey: ${fkeyId}`);
      
      // Track this action set
      this.addRecentActionSet(senderInboxId, confirmationActions.id);

    } catch (error) {
      console.error("❌ Error sending confirmation actions:", error);
    }
  }

  /**
   * Process fkey.id confirmation and save to database
   */
  private async processFkeyConfirmation(senderInboxId: string, confirmed: boolean): Promise<string> {
    try {
      const pendingConfirmation = this.userConfirmationPending.get(senderInboxId);
      
      if (!pendingConfirmation) {
        return `❌ No Pending Confirmation

I don't have a pending fkey.id confirmation for you. Please start over by typing your username.`;
      }

      // Clear pending confirmation
      this.userConfirmationPending.delete(senderInboxId);

      if (!confirmed) {
        return `🔄 Try Again

No problem! Please enter your fkey.id username again:

Examples:
• tantodefi
• alice
• myusername`;
      }

      // Confirmed - now verify and save the fkey.id
      const fkeyId = pendingConfirmation.fkeyId;
      
      // Get user address for ZK receipt storage
      let userAddress: string | undefined = undefined;
      try {
        const inboxState = await this.client?.preferences.inboxStateFromInboxIds([senderInboxId]);
        userAddress = inboxState?.[0]?.identifiers[0]?.identifier;
      } catch (error) {
        console.warn('⚠️ Could not resolve user address for fkey confirmation:', error);
      }
      
      // Call the existing fkey verification logic with ZK receipt generation
      const verificationResult = await this.callFkeyLookupAPI(fkeyId, userAddress, 'xmtp-agent-fkey-confirmation');
      
      if (verificationResult.error) {
        return `❌ Verification Failed

Your fkey.id "${fkeyId}" could not be verified:
${verificationResult.error}

Please check:
• Is your FluidKey profile public?
• Did you spell your username correctly?
• Is your FluidKey account fully set up?

Try again with: /set ${fkeyId}`;
      }

      // Save to database
      const stealthData = {
        userId: senderInboxId,
        fkeyId: fkeyId,
        stealthAddress: verificationResult.address || "",
        zkProof: verificationResult.proof || null,
        lastUpdated: Date.now(),
        requestedBy: this.client?.inboxId || "",
        setupStatus: 'fkey_set' as const
      };

      await agentDb.storeUserStealthData(stealthData);

      // Send success message and help menu
      await this.sendPostOnboardingHelp(senderInboxId, fkeyId);

      return `✅ fkey.id Set Successfully!

Your fkey.id ${fkeyId}.fkey.id is now verified and saved!

🎉 All features unlocked:
• Create anonymous payment links
• Generate stealth addresses
• Receive ZK receipts
• Earn privacy rewards

🚀 Quick Start:
Check the actions below to get started!`;

    } catch (error) {
      console.error("❌ Error processing fkey confirmation:", error);
      return `❌ Error Saving fkey.id

Something went wrong while saving your fkey.id. Please try again or contact support.`;
    }
  }

  /**
   * Send post-onboarding help menu
   */
  private async sendPostOnboardingHelp(senderInboxId: string, fkeyId: string, conversation?: any): Promise<void> {
    try {
      if (!this.client) return;

      let targetConversation = conversation;

      // If no conversation provided, find DM conversation with user
      if (!targetConversation) {
        const conversations = await this.client.conversations.list();
        targetConversation = conversations.find(conv => {
          if (!(conv instanceof Group)) {
            return conv.peerInboxId === senderInboxId;
          }
          return false;
        });

        if (!targetConversation) return;
      }

      // Generate unique timestamp
      const renderTimestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);

      // Create help actions
      const helpActions: ActionsContent = {
        id: `post-onboarding-help-${renderTimestamp}-${randomSuffix}`,
        description: `🎉 Welcome ${fkeyId}! Your dStealth account is ready. What would you like to do?`,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
        actions: [
          {
            id: `create-payment-link-${renderTimestamp}-${randomSuffix}`,
            label: "💳 Create Payment Link",
            style: "primary"
          },
          {
            id: `check-balance-${renderTimestamp}-${randomSuffix}`,
            label: "💰 Check Balance",
            style: "secondary"
          },
          {
            id: `get-help-${renderTimestamp}-${randomSuffix}`,
            label: "❓ Get Help",
            style: "secondary"
          },
          {
            id: `dstealth-miniapp-${renderTimestamp}-${randomSuffix}`,
            label: "🌐 dStealth App",
            style: "secondary"
          }
        ]
      };

      await targetConversation.send(helpActions, ContentTypeActions);
      this.addRecentActionSet(senderInboxId, helpActions.id);

    } catch (error) {
      console.error("❌ Error sending post-onboarding help:", error);
    }
  }

  /**
   * 🔧 ENHANCED: Handle direct user search with comprehensive address resolution
   */
  private async handleDirectUserSearch(username: string, senderInboxId: string): Promise<string | null> {
    try {
      const cleanUsername = username.trim();
      
      if (!cleanUsername || cleanUsername.length < 2) {
        return null; // Not a valid username search
      }

      console.log(`🔍 Enhanced direct user search for: ${cleanUsername}`);

      // 🔧 STEP 1: Resolve user input to address if possible
      const resolution = await this.resolveUserInput(cleanUsername);
      
      console.log(`📍 Input resolution:`, {
        input: resolution.originalInput,
        type: resolution.inputType,
        resolved: resolution.resolvedAddress ? `${resolution.resolvedAddress.slice(0, 8)}...` : 'null'
      });

      // 🔧 STEP 2: Search shared database with both username and resolved address
      const searchResult = await this.searchDatabaseForFkey(cleanUsername, resolution.resolvedAddress || undefined);
      
      if (searchResult.fkeyId) {
        // Found fkey.id in shared database
        const resolvedInfo = resolution.resolvedAddress ? `\n🔗 Resolved from: ${resolution.resolvedFrom || resolution.originalInput}` : '';
        
        return `🔍 User Found! 🔗

👤 ${cleanUsername}${resolvedInfo}
🔑 FluidKey: ${searchResult.fkeyId}.fkey.id
💳 Privacy payments enabled

💰 You can send anonymous payments to this user!

🚀 Try it:
• "create payment link for $25"
• Share the link with them
• They'll receive payments to their stealth address

🥷 Privacy enabled! 🔒

📊 Found by: ${searchResult.foundBy} search
📍 Sources: Agent DMs, dStealth miniapp, Farcaster casts`;
      }

      // 🔧 STEP 3: If not found in database, check if we resolved an address
      if (resolution.resolvedAddress) {
        const addressType = resolution.inputType === 'ens_name' ? 'ENS name' : 
                          resolution.inputType === 'base_name' ? 'Base name' : 
                          resolution.inputType === 'farcaster_username' ? 'Farcaster username' : 'address';
        
        return `🔍 Address Found (No FluidKey)

👤 ${cleanUsername}
🔗 ${addressType} resolved to: ${resolution.resolvedAddress.slice(0, 8)}...${resolution.resolvedAddress.slice(-6)}
❌ No fkey.id set up yet

💡 Help them get started:
• Share FluidKey: ${this.FLUIDKEY_REFERRAL_URL}
• Tell them to cast "@dstealth username.fkey.id" on Farcaster
• They can also DM me at @dstealth.base.eth

🚀 Grow the privacy network together!

📊 Address resolution: ${resolution.inputType} → wallet address`;
      }

      // 🔧 STEP 4: Nothing found anywhere
      const inputTypeHelp = resolution.inputType === 'ens_name' ? 'ENS name' : 
                           resolution.inputType === 'base_name' ? 'Base name' : 
                           resolution.inputType === 'farcaster_username' ? 'Farcaster username' : 'username';
      
      return `🔍 User Search Results

Sorry, I couldn't find "${cleanUsername}" anywhere.

🔍 Searched as: ${inputTypeHelp}
🌐 Checked: All available users
📍 Sources: Agent DMs, dStealth miniapp, Farcaster casts
${resolution.inputType !== 'plain_username' ? `🔗 Address resolution: ${resolution.inputType === 'ens_name' ? 'ENS' : resolution.inputType === 'base_name' ? 'Base' : 'Farcaster'} lookup attempted` : ''}

💡 Suggestions:
• Check the spelling
• Try with @ prefix for Farcaster: @${cleanUsername}
• Try with .eth or .base.eth suffix
• Use /search ${cleanUsername} for broader search

Want to invite them to dStealth? Share this:
• Get FluidKey: ${this.FLUIDKEY_REFERRAL_URL}
• Cast "@dstealth username.fkey.id" on Farcaster
• DM me at @dstealth.base.eth`;

    } catch (error) {
      console.error('Error in enhanced direct user search:', error);
      return null; // Fall back to normal message processing
    }
  }

  /**
   * 🔧 NEW: Resolve ENS names to addresses
   */
  private async resolveENSName(ensName: string): Promise<string | null> {
    try {
      // Remove .eth if present for processing
      const cleanName = ensName.endsWith('.eth') ? ensName : `${ensName}.eth`;
      
      console.log(`🔍 Resolving ENS name: ${cleanName}`);
      
      // Use ethers to resolve ENS name
      const provider = new ethers.JsonRpcProvider('https://ethereum-rpc.publicnode.com');
      const address = await provider.resolveName(cleanName);
      
      if (address) {
        console.log(`✅ ENS resolved: ${cleanName} -> ${address}`);
        return address.toLowerCase();
      }
      
      console.log(`❌ ENS resolution failed for: ${cleanName}`);
      return null;
    } catch (error) {
      console.error(`❌ Error resolving ENS name ${ensName}:`, error);
      return null;
    }
  }

  /**
   * 🔧 NEW: Resolve Base names to addresses
   */
  private async resolveBaseName(baseName: string): Promise<string | null> {
    try {
      // Remove .base.eth if present for processing
      const cleanName = baseName.endsWith('.base.eth') ? baseName : `${baseName}.base.eth`;
      
      console.log(`🔍 Resolving Base name: ${cleanName}`);
      
      // Use Base network provider to resolve Base name
      const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
      const address = await provider.resolveName(cleanName);
      
      if (address) {
        console.log(`✅ Base name resolved: ${cleanName} -> ${address}`);
        return address.toLowerCase();
      }
      
      console.log(`❌ Base name resolution failed for: ${cleanName}`);
      return null;
    } catch (error) {
      console.error(`❌ Error resolving Base name ${baseName}:`, error);
      return null;
    }
  }

  /**
   * 🔧 NEW: Resolve Farcaster username to wallet address
   */
  private async resolveFarcasterUsername(username: string): Promise<string | null> {
    try {
      if (!this.NEYNAR_API_KEY) {
        console.warn('⚠️ NEYNAR_API_KEY not configured for Farcaster resolution');
        return null;
      }

      const cleanUsername = username.replace(/^@/, '');
      console.log(`🔍 Resolving Farcaster username: ${cleanUsername}`);

      const response = await fetch(`${NEYNAR_API_BASE}/farcaster/user/by_username?username=${cleanUsername}`, {
        headers: {
          'api_key': this.NEYNAR_API_KEY
        }
      });

      if (!response.ok) {
        console.log(`❌ Farcaster user lookup failed: ${response.status}`);
        return null;
      }

      const data = await response.json() as { user: any };
      
      if (data.user) {
        // Prefer custody address, fallback to first verified address
        const address = data.user.custody_address || data.user.verified_addresses?.eth_addresses?.[0];
        
        if (address) {
          console.log(`✅ Farcaster username resolved: @${cleanUsername} -> ${address}`);
          return address.toLowerCase();
        }
      }
      
      console.log(`❌ No address found for Farcaster username: ${cleanUsername}`);
      return null;
    } catch (error) {
      console.error(`❌ Error resolving Farcaster username ${username}:`, error);
      return null;
    }
  }

  /**
   * 🔧 NEW: Comprehensive address resolution for different input types
   */
  private async resolveUserInput(input: string): Promise<{
    originalInput: string;
    resolvedAddress: string | null;
    inputType: 'ethereum_address' | 'ens_name' | 'base_name' | 'farcaster_username' | 'plain_username';
    resolvedFrom?: string;
  }> {
    const cleanInput = input.trim().toLowerCase();
    
    // Check if it's already an Ethereum address
    if (cleanInput.match(/^0x[a-fA-F0-9]{40}$/)) {
      return {
        originalInput: input,
        resolvedAddress: cleanInput,
        inputType: 'ethereum_address'
      };
    }
    
    // Check if it's a Base name
    if (cleanInput.includes('.base.eth')) {
      const resolvedAddress = await this.resolveBaseName(cleanInput);
      return {
        originalInput: input,
        resolvedAddress,
        inputType: 'base_name',
        resolvedFrom: cleanInput
      };
    }
    
    // Check if it's an ENS name
    if (cleanInput.includes('.eth')) {
      const resolvedAddress = await this.resolveENSName(cleanInput);
      return {
        originalInput: input,
        resolvedAddress,
        inputType: 'ens_name',
        resolvedFrom: cleanInput
      };
    }
    
    // Check if it's a Farcaster username (starts with @)
    if (cleanInput.startsWith('@')) {
      const resolvedAddress = await this.resolveFarcasterUsername(cleanInput);
      return {
        originalInput: input,
        resolvedAddress,
        inputType: 'farcaster_username',
        resolvedFrom: cleanInput
      };
    }
    
    // Plain username - could be Farcaster or just a username
    // Try Farcaster first
    const farcasterAddress = await this.resolveFarcasterUsername(cleanInput);
    if (farcasterAddress) {
      return {
        originalInput: input,
        resolvedAddress: farcasterAddress,
        inputType: 'farcaster_username',
        resolvedFrom: `@${cleanInput}`
      };
    }
    
    // If not found on Farcaster, treat as plain username
    return {
      originalInput: input,
      resolvedAddress: null,
      inputType: 'plain_username'
    };
  }

  /**
   * 🔧 UNIFIED: Search shared database for fkey.id by multiple methods
   */
  private async searchDatabaseForFkey(username: string, resolvedAddress?: string): Promise<{
    fkeyId: string | null;
    foundBy: 'username' | 'address' | 'not_found';
    source: 'shared_db';
  }> {
    // All data is stored in the same shared database (agentDb using Redis)
    // This includes users from: Agent DMs, dStealth miniapp, and Farcaster casts
    
    // First try username search in shared database
    const usernameResult = await this.findFkeyByUsername(username);
    if (usernameResult) {
      return {
        fkeyId: usernameResult,
        foundBy: 'username',
        source: 'shared_db'
      };
    }
    
    // Then try address search if we have a resolved address
    if (resolvedAddress) {
      const addressResult = await this.findFkeyByWallet(resolvedAddress);
      if (addressResult) {
        return {
          fkeyId: addressResult,
          foundBy: 'address',
          source: 'shared_db'
        };
      }
    }
    
    return {
      fkeyId: null,
      foundBy: 'not_found',
      source: 'shared_db'
    };
  }

  /**
   * 🔧 NEW: Search for fkey.id by username in database
   */
  private async findFkeyByUsername(username: string): Promise<string | null> {
    try {
      const allUsers = await agentDb.getAllStealthData();
      
      for (const userData of allUsers) {
        if (userData.fkeyId && userData.fkeyId.toLowerCase() === username.toLowerCase()) {
          return userData.fkeyId;
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error finding fkey by username:', error);
      return null;
    }
  }


  /**
   * 🔧 NEW: Context-aware action button expiration
   */
  private calculateSmartExpiration(actionType: string, userContext: any): string {
    const now = Date.now();
    
    switch (actionType) {
      case 'welcome':
        // Welcome actions expire quickly to prevent confusion
        return new Date(now + 5 * 60 * 1000).toISOString(); // 5 minutes
      
      case 'payment':
        // Payment actions have longer expiration
        return new Date(now + 60 * 60 * 1000).toISOString(); // 1 hour
      
      case 'confirmation':
        // Confirmation actions expire quickly
        return new Date(now + 10 * 60 * 1000).toISOString(); // 10 minutes
      
      case 'help':
        // Help actions can last longer
        return new Date(now + 24 * 60 * 60 * 1000).toISOString(); // 24 hours
      
      default:
        // Default expiration
        return new Date(now + 12 * 60 * 60 * 1000).toISOString(); // 12 hours
    }
  }

  /**
   * 🔧 NEW: Dynamic action button generation based on user context
   */
  private generateContextualActions(userStatus: any, actionType: string = 'general'): ActionsContent {
    const renderTimestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const actions = [];

    // Base actions available to all users
    if (!userStatus.hasValidFkey) {
      actions.push({
        id: `setup-fkey-${renderTimestamp}-${randomSuffix}`,
        label: "🔑 Setup fkey.id",
        style: "primary" as const
      });
    }

    if (userStatus.hasValidFkey) {
      actions.push({
        id: `create-payment-link-${renderTimestamp}-${randomSuffix}`,
        label: "💳 Create Payment Link",
        style: "primary" as const
      });
      
      actions.push({
        id: `check-balance-${renderTimestamp}-${randomSuffix}`,
        label: "💰 Check Balance",
        style: "secondary" as const
      });
    }

    // Farcaster-specific actions
    if (userStatus.hasFarcasterProfile) {
      actions.push({
        id: `send-rewards-${renderTimestamp}-${randomSuffix}`,
        label: "🎯 Send Rewards",
        style: "secondary" as const
      });
      
      actions.push({
        id: `search-followers-${renderTimestamp}-${randomSuffix}`,
        label: "👥 Search Followers",
        style: "secondary" as const
      });
    }

    // Universal actions
    actions.push({
      id: `dstealth-miniapp-${renderTimestamp}-${randomSuffix}`,
      label: "🌐 dStealth App",
      style: "secondary" as const
    });

    actions.push({
      id: `get-help-${renderTimestamp}-${randomSuffix}`,
      label: "❓ Get Help",
      style: "secondary" as const
    });

    const description = this.getContextualDescription(userStatus, actionType);
    const expiration = this.calculateSmartExpiration(actionType, userStatus);

    return {
      id: `contextual-actions-${renderTimestamp}-${randomSuffix}`,
      description,
      actions,
      expiresAt: expiration
    };
  }

  /**
   * 🔧 NEW: Get contextual description for action buttons
   */
  private getContextualDescription(userStatus: any, actionType: string): string {
    const timestamp = new Date().toLocaleTimeString();
    
    if (actionType === 'welcome') {
      return `👋 Welcome to dStealth! Choose an action to get started (${timestamp}):`;
    }
    
    if (actionType === 'payment') {
      return `💳 Payment options for ${userStatus.fkeyId || 'your account'} (${timestamp}):`;
    }
    
    if (actionType === 'help') {
      const fkeyStatus = userStatus.hasValidFkey ? `✅ ${userStatus.fkeyId}` : '❌ No fkey.id';
      const fcStatus = userStatus.hasFarcasterProfile ? `✅ @${userStatus.farcasterUsername}` : '❌ No FC';
      return `🤖 dStealth Agent - ${fkeyStatus} | ${fcStatus} (${timestamp}):`;
    }
    
    return `🥷 dStealth Agent - Choose an action (${timestamp}):`;
  }

  /**
   * 🔧 NEW: Batch operations for database queries
   */
  private async batchGetStealthData(userIds: string[]): Promise<Map<string, any>> {
    const results = new Map<string, any>();
    
    try {
      // Process in batches of 10 to avoid overwhelming the database
      const batchSize = 10;
      const batches = [];
      
      for (let i = 0; i < userIds.length; i += batchSize) {
        batches.push(userIds.slice(i, i + batchSize));
      }
      
      // Process batches in parallel
      const batchPromises = batches.map(async (batch) => {
        const batchResults = await Promise.all(
          batch.map(async (userId) => {
            const data = await agentDb.getStealthDataByUser(userId);
            return { userId, data };
          })
        );
        
        return batchResults;
      });
      
      const allBatchResults = await Promise.all(batchPromises);
      
      // Flatten results and populate map
      for (const batchResult of allBatchResults) {
        for (const { userId, data } of batchResult) {
          if (data) {
            results.set(userId, data);
          }
        }
      }
      
      console.log(`✅ Batch loaded ${results.size} user records from ${userIds.length} requests`);
      return results;
    } catch (error) {
      console.error('Error in batch get stealth data:', error);
      return results;
    }
  }

  /**
   * 🔧 NEW: Batch operations for fkey lookups
   */
  private async batchFkeyLookups(fkeyIds: string[]): Promise<Map<string, any>> {
    const results = new Map<string, any>();
    
    try {
      // Process in batches of 5 to avoid API rate limits
      const batchSize = 5;
      const batches = [];
      
      for (let i = 0; i < fkeyIds.length; i += batchSize) {
        batches.push(fkeyIds.slice(i, i + batchSize));
      }
      
      // Process batches sequentially to respect rate limits
      for (const batch of batches) {
        const batchResults = await Promise.all(
          batch.map(async (fkeyId) => {
            const data = await this.callFkeyLookupAPI(fkeyId);
            return { fkeyId, data };
          })
        );
        
        for (const { fkeyId, data } of batchResults) {
          if (data && !data.error) {
            results.set(fkeyId, data);
          }
        }
        
        // Add small delay between batches to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      console.log(`✅ Batch looked up ${results.size} fkey records from ${fkeyIds.length} requests`);
      return results;
    } catch (error) {
      console.error('Error in batch fkey lookups:', error);
      return results;
    }
  }

  /**
   * 🔧 NEW: Enhanced /search command with follower fallback
   */
  private async handleEnhancedSearchCommand(searchQuery: string, senderInboxId: string): Promise<string> {
    try {
      // If no query provided, return user's followers/following
      if (!searchQuery || searchQuery.trim() === '') {
        return await this.handleFollowerSearch(senderInboxId);
      }
      
      // Otherwise, perform regular search
      return await this.handleSearchCommand(searchQuery, senderInboxId);
    } catch (error) {
      console.error('Error in enhanced search command:', error);
      return "❌ Search temporarily unavailable. Please try again later.";
    }
  }

  /**
   * 🔧 NEW: Handle follower search when no username provided
   */
  private async handleFollowerSearch(senderInboxId: string): Promise<string> {
    try {
      if (!this.client) {
        return "❌ Agent not available";
      }

      // Get sender's wallet address
      const inboxState = await this.client.preferences.inboxStateFromInboxIds([senderInboxId]);
      const senderAddress = inboxState[0]?.identifiers[0]?.identifier;

      if (!senderAddress) {
        return "❌ Could not get your wallet address";
      }

      // Get Farcaster context
      const farcasterContext = await this.getFarcasterContext(senderAddress);

      if (!farcasterContext) {
        return `🔍 No Search Query & No Farcaster Profile

You didn't provide a search query and you're not connected to Farcaster.

🔗 To search your followers/following:
1. Connect your wallet to Farcaster at warpcast.com
2. Return here and use /search with no parameters

🔍 To search for specific users:
• /search username
• /search @username
• /search user.base.eth

Examples:
• /search tantodefi
• /search @vitalik
• /search user.base.eth`;
      }

      // Get both followers and following
      const [followers, following] = await Promise.all([
        this.fetchUserFollowers(farcasterContext.fid, 50),
        this.fetchUserFollowing(farcasterContext.fid, 50)
      ]);

      const totalConnections = followers.length + following.length;
      const allConnections = [...followers, ...following];

      // Check which ones have dStealth
      const dStealthUsers = [];
      for (const user of allConnections) {
        const fkeyId = await this.findFkeyByWallet(user.custodyAddress) || 
                      await this.findFkeyByWallet(user.verifiedAddresses[0]);
        
        if (fkeyId) {
          dStealthUsers.push({
            ...user,
            fkeyId,
            type: followers.includes(user) ? 'follower' : 'following'
          });
        }
      }

      if (dStealthUsers.length === 0) {
        return `🔍 Your Farcaster Network Analysis

@${farcasterContext.username}, I analyzed your network:

📊 Network Size:
• Followers: ${followers.length}
• Following: ${following.length}
• Total: ${totalConnections}

❌ No dStealth Users Found

None of your followers or following have set up fkey.id yet.

🚀 Grow the Privacy Network:
• Share dStealth with your community
• Tell them about FluidKey: ${this.FLUIDKEY_REFERRAL_URL}
• Earn referral rewards (coming soon)

Try specific searches: /search username`;
      }

      const userList = dStealthUsers
        .slice(0, 10)
        .map(user => {
          const verifiedBadge = user.verified ? ' ✅' : '';
          const typeIcon = user.type === 'follower' ? '👥' : '🔗';
          return `${typeIcon} @${user.username}${verifiedBadge} → ${user.fkeyId}.fkey.id`;
        })
        .join('\n');

      const moreResults = dStealthUsers.length > 10 ? `\n\n... and ${dStealthUsers.length - 10} more dStealth users!` : '';

      return `🔍 Your Farcaster Network Analysis

@${farcasterContext.username}, found ${dStealthUsers.length} dStealth users in your network:

${userList}${moreResults}

📊 Network Summary:
• Total connections: ${totalConnections}
• dStealth users: ${dStealthUsers.length}
• Privacy adoption: ${((dStealthUsers.length / totalConnections) * 100).toFixed(1)}%

🎯 Icons:
• 👥 = Your followers
• 🔗 = People you follow

Ready to connect with them privately! 🥷`;

    } catch (error) {
      console.error('Error in follower search:', error);
      return "❌ Error analyzing your network. Please try again later.";
    }
  }

  /**
   * 🔧 NEW: Fetch user's following list
   */
  private async fetchUserFollowing(fid: number, limit: number = 50): Promise<FarcasterUser[]> {
    try {
      if (!this.NEYNAR_API_KEY) {
        console.warn('⚠️ NEYNAR_API_KEY not configured for following');
        return [];
      }

      console.log(`🔗 Fetching following for FID: ${fid}`);

      const response = await fetch(`${NEYNAR_API_BASE}/farcaster/following?fid=${fid}&limit=${limit}`, {
        headers: {
          'api_key': this.NEYNAR_API_KEY
        }
      });

      if (!response.ok) {
        console.log(`❌ Neynar following API error: ${response.status}`);
        return [];
      }

      const data = await response.json() as NeynarFollowersResponse;
      
      const following: FarcasterUser[] = data.users.map(user => ({
        fid: user.fid,
        username: user.username,
        displayName: user.display_name,
        avatarUrl: user.pfp_url,
        verified: user.verified,
        custodyAddress: user.custody_address,
        verifiedAddresses: user.verified_addresses?.eth_addresses || [],
        bio: user.profile?.bio?.text,
        followerCount: user.follower_count,
        followingCount: user.following_count
      }));

      console.log(`✅ Found ${following.length} following for FID ${fid}`);
      return following;

    } catch (error) {
      console.error('Error fetching user following:', error);
      return [];
    }
  }

  /**
   * 🔧 NEW: Add action set to user's recent action sets for validation
   */
  private addRecentActionSet(senderInboxId: string, actionSetId: string): void {
    if (!this.userRecentActionSets.has(senderInboxId)) {
      this.userRecentActionSets.set(senderInboxId, []);
    }
    
    const userActionSets = this.userRecentActionSets.get(senderInboxId)!;
    userActionSets.push(actionSetId);
    
    // Keep only the last MAX_VALID_ACTION_SETS action sets
    if (userActionSets.length > this.MAX_VALID_ACTION_SETS) {
      userActionSets.splice(0, userActionSets.length - this.MAX_VALID_ACTION_SETS);
    }
    
    console.log(`📋 Added action set ${actionSetId} for user ${senderInboxId}`);
    console.log(`   Current action sets: [${userActionSets.join(', ')}]`);
  }

}
