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

import { agentDb } from '../lib/agent-database.js';
import { daimoPayClient } from '../lib/daimo-pay.js';
import { createSigner, getEncryptionKeyFromHex } from '../helper.js';
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

// Action button content types (from working example)
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
}

interface IntentContent {
  id: string;
  actionId: string;
  metadata?: Record<string, string | number | boolean | null>;
}

// Action button codecs (from working example)
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
  }
}

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

  // Configuration
  private readonly FLUIDKEY_REFERRAL_URL = "https://app.fluidkey.com/?ref=62YNSG";
  private readonly DSTEALTH_APP_URL = "https://dstealth.xyz";
  private readonly OPENAI_API_KEY = process.env.OPENAI_API_KEY;

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
          conversation.id
        );

        if (!shouldProcess) {
          return;
        }

        // Process the message with our dStealth logic
        const response = await this.processTextMessage(message.content, senderInboxId, isGroup, conversation);
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
  private async processTextMessage(messageContent: string, senderInboxId: string, isGroup: boolean, conversation?: any): Promise<string | undefined> {
    try {
      console.log(`📝 Processing text message: "${messageContent}" from ${senderInboxId}`);
      
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
        return await this.handleCommand(messageContent, senderInboxId, isGroup);
      }

      // Handle payment amount requests
      const paymentAmount = this.extractPaymentAmount(messageContent);
      if (paymentAmount) {
        return await this.handlePaymentRequest(paymentAmount, senderInboxId, "conversation", isGroup);
      }

      // Handle fkey.id pattern (e.g., "tantodefi.fkey.id")
      if (this.isFkeyIdPattern(messageContent)) {
        return await this.handleFkeyIdSubmission(messageContent, senderInboxId, conversation);
      }

      // Handle general messages with OpenAI or basic responses
      return await this.processGeneralMessage(messageContent, senderInboxId, isGroup, conversation);

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
   * Get agent status
   */
  getStatus() {
    return {
      isRunning: !!this.client,
              processedMessageCount: this.processedMessageCount,
      agentAddress: this.agentAddress,
      streamRestartCount: this.streamRestartCount,
      installationCount: this.installationCount,
    };
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
   * 🔧 UPDATED: Enhanced message processing logic for group chats
   */
  private async shouldProcessMessage(messageContent: string, senderInboxId: string, isGroup: boolean, conversationId: string): Promise<boolean> {
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
        // 🔧 FIXED: Group chat logic - VERY restrictive - only @mentions
        
        // Always send welcome message if not sent yet
        if (!this.groupIntroductions.has(conversationId)) {
          console.log("👋 Sending group introduction");
          this.groupIntroductions.add(conversationId); // Mark as sent immediately
          return true;
        }

        // 🔧 STRICT: Only respond to explicit @mentions in groups
        const hasExplicitMention = trimmed.includes('@dstealth') || 
                                   trimmed.includes('@dstealth.eth') ||
                                   trimmed.includes('@dstealth.base.eth');
        
        if (hasExplicitMention) {
          console.log("📢 Group message has explicit @dstealth mention - will process");
          return true;
        }

        // 🔧 REMOVED: Payment trigger logic for groups - only @mentions allowed
        console.log("🔇 Group message lacks @mention - ignoring");
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
   * 🔧 UPDATED: Process general messages with onboarding flow
   */
  private async processGeneralMessage(content: string, senderInboxId: string, isGroup: boolean, conversation?: any): Promise<string> {
    try {
      // Check if user is onboarded first
      const isOnboarded = await this.isUserOnboarded(senderInboxId);
      
      // For groups, always check onboarding status
      if (isGroup) {
        if (!isOnboarded) {
          return "🔒 Please DM me to set up your fkey.id first! I can only help users who have completed onboarding.";
        }
        
        // Group intro message if not sent yet
        if (!this.groupIntroductions.has(senderInboxId)) {
          this.groupIntroductions.add(senderInboxId);
          return this.getGroupIntroMessage();
        }
      }
      
      // For DMs, if user is not onboarded, send welcome flow
      if (!isGroup && !isOnboarded) {
        // Check if we haven't sent welcome yet
        if (!this.userWelcomesSent.has(senderInboxId)) {
          await this.sendWelcomeWithActions(senderInboxId, conversation);
          return ""; // Actions message sent, no text response needed
        }
        
        // Check if this is a username entry (for users who clicked "I have an fkey")
        const trimmedContent = content.trim();
        if (this.isValidUsername(trimmedContent)) {
          return await this.handleFkeyConfirmation(trimmedContent, senderInboxId, conversation);
        }
        
        // Return onboarding reminder
        return `🔑 Complete Your Setup

Please choose one of the options above:
• ✅ I have an fkey - if you already have FluidKey
• 🆕 I don't have an fkey - if you need to sign up

Or type your fkey.id username directly (e.g., tantodefi)`;
      }
      
      // User is onboarded, proceed with normal flow
      const userData = await agentDb.getStealthDataByUser(senderInboxId);
      
      // Check for command patterns
      if (content.startsWith('/')) {
        return await this.handleCommand(content, senderInboxId, isGroup);
      }
      
      // Check for basic keywords
      const basicResponse = this.handleBasicKeywords(content);
      if (basicResponse) {
        return basicResponse;
      }
      
      // Try OpenAI integration for intelligent responses
      if (this.OPENAI_API_KEY) {
        const openAIResponse = await this.getOpenAIResponse(content, userData);
        if (openAIResponse) {
          return openAIResponse;
        }
      }
      
      // Fallback to basic response
      return this.getBasicResponse(content, userData);
    } catch (error) {
      console.error("Error processing general message:", error);
      return `❌ Error Processing Message

Something went wrong. Please try:
• \`/help\` for all commands
• Contact support if issues persist`;
    }
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

      // 🔧 ONLY NOW: Call fkey.id lookup API
      console.log(`🔍 Setting fkey.id for user: ${username}`);
      const lookupResult = await this.callFkeyLookupAPI(username);

      if (lookupResult.error) {
        return `❌ fkey.id Setup Failed

Could not verify \`${username}.fkey.id\`: ${lookupResult.error}

Please ensure:
1. 🔑 You have FluidKey: ${this.FLUIDKEY_REFERRAL_URL}
2. 📝 Your username is correct (e.g., "tantodefi")
3. 🌐 Your fkey.id profile is publicly accessible

Try: \`/set yourUsername\``;
      }

      // Store fkey.id association with ZK proof
      const userData = {
        userId: senderInboxId,
        fkeyId: username,
        stealthAddress: lookupResult.address || "",
        zkProof: lookupResult.proof,
        lastUpdated: Date.now(),
        requestedBy: senderInboxId,
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
   * 🔧 NEW: Process messages with OpenAI for intelligent responses
   */
  private async handleWithOpenAI(
    content: string,
    senderInboxId: string,
    isGroup: boolean,
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
        return await this.getOpenAIResponse(content, userData);
      } else {
        // Fallback to basic responses
        return this.getBasicResponse(content, userData);
      }

    } catch (error) {
      console.error("Error in OpenAI processing:", error);
      return undefined;
    }
  }

  /**
   * 🔧 NEW: Get OpenAI response
   */
  private async getOpenAIResponse(content: string, userData: any): Promise<string> {
    try {
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
              content: `You are dStealth, a privacy-focused AI agent that helps users with anonymous payments and stealth addresses. The user has fkey.id: ${userData.fkeyId}. Keep responses concise, helpful, and privacy-focused. You can help with payment links, privacy tools, and general questions about cryptocurrency privacy.`
            },
            {
              role: 'user',
              content: content
            }
          ],
          max_tokens: 150,
          temperature: 0.7,
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
      return data.choices[0]?.message?.content || "I'm here to help with privacy and payments! Type /help for commands.";

    } catch (error) {
      console.error("OpenAI API error:", error);
      return "I'm here to help with privacy and payments! Type /help for commands.";
    }
  }

  /**
   * 🔧 NEW: Basic fallback response
   */
  private getBasicResponse(content: string, userData: any): string {
    const lower = content.toLowerCase();
    
    if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
      return `👋 Hello ${userData.fkeyId}! I'm dStealth, your privacy assistant. How can I help you today?`;
    }
    
    if (lower.includes('help')) {
      return this.getHelpMessage();
    }
    
    return `Hi ${userData.fkeyId}! I'm here to help with anonymous payments and privacy tools. Type /help for available commands.`;
  }

  /**
   * 🔧 NEW: Group introduction message
   */
  private getGroupIntroMessage(): string {
    return `👋 Hello! I'm dStealth 🥷

I help with anonymous payments and privacy tools.

To get started:
• DM me to set your fkey.id: \`/set yourUsername\`
• Create payment links: "create payment link for $25" 
• Get help: \`/help\`

I only respond when @mentioned or for payment requests!`;
  }

  /**
   * 🔧 UPDATED: Handle commands with enhanced help and fkey.id requirements
   */
  private async handleCommand(
    command: string,
    senderInboxId: string,
    isGroup: boolean,
  ): Promise<string> {
    const cmd = command.toLowerCase().trim();

    // Check if user is onboarded for all commands except /set
    const isOnboarded = await this.isUserOnboarded(senderInboxId);
    
    // /help command - available to all users, but different for onboarded vs non-onboarded
    if (cmd === "/help") {
      if (isOnboarded) {
        await this.sendHelpActionsMessage(senderInboxId);
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
      if (isGroup) {
        return "🔒 Please DM me to set up your fkey.id first! Type /help for instructions.";
      } else {
        return `🔑 Setup Required

You need to set your fkey.id to use dStealth features.

Quick Setup:
• Type your username (e.g., tantodefi)
• Or use: /set yourUsername

Need FluidKey? ${this.FLUIDKEY_REFERRAL_URL}

Type /help for full setup instructions.`;
      }
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
   * 🔧 FIXED: Call fkey.id lookup API to get ZK proof and store it
   */
  private async callFkeyLookupAPI(fkeyId: string): Promise<{ address?: string; proof?: unknown; error?: string }> {
    try {
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const response = await fetch(`${baseUrl}/api/fkey/lookup/${fkeyId}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json() as { isRegistered?: boolean; address?: string; proof?: unknown; error?: string };
      
      if (data.isRegistered && data.address) {
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
   * 🔧 SECURITY: Helper method to always get fresh user stealth data with current fkey.id lookup
   */
  private async getFreshUserStealthData(senderInboxId: string): Promise<{
    userData: any;
    currentAddress: string;
    isAddressUpdated: boolean;
    error?: string;
  } | null> {
    try {
      const userData = await agentDb.getStealthDataByUser(senderInboxId);
      
      if (!userData || !userData.fkeyId) {
        return null;
      }

      // Always do fresh fkey.id lookup for security
      console.log(`🔒 Security check: Refreshing stealth address for ${userData.fkeyId}`);
      const freshLookup = await this.callFkeyLookupAPI(userData.fkeyId);
      
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

      // Update stored data if address changed or missing
      if (!userData.stealthAddress || userData.stealthAddress !== currentAddress) {
        if (userData.stealthAddress) {
          console.log(`🔄 Address updated for ${userData.fkeyId}: ${userData.stealthAddress} → ${currentAddress}`);
          isAddressUpdated = true;
        }
        
        // Update stored data with fresh info
        const updatedUserData = {
          ...userData,
          stealthAddress: currentAddress,
          zkProof: freshLookup.proof,
          lastUpdated: Date.now(),
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
  ): Promise<string> {
    try {
      // Check if user has fkey.id set
      const userData = await agentDb.getStealthDataByUser(senderInboxId);
      
      if (!userData?.fkeyId) {
        if (isGroup) {
          return "🔒 Please DM me to set your fkey.id first: /set yourUsername";
        } else {
        return `🔒 Payment Link Setup Required

To create payment links, please set your fkey.id first:

Step 1: \`/set yourUsername\`
Step 2: Complete setup at ${this.DSTEALTH_APP_URL}

Need FluidKey? ${this.FLUIDKEY_REFERRAL_URL}`;
        }
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
      
      // Generate Coinbase Wallet payment URL
      const coinbaseWalletUrl = this.generateCoinbaseWalletLink(currentAddress, amount, "USDC");

      const addressChangeWarning = isAddressUpdated 
        ? `\n⚠️ Address Updated: Your stealth address was refreshed.`
        : '';

      // 🔧 FIXED: Send Transaction Actions for the payment link - now uses senderInboxId
      await this.sendTransactionActions(senderInboxId, amount, currentData.fkeyId, daimoResponse.url, currentAddress);

      // Return empty string since we're only sending action buttons now
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
   * Handle basic keywords and greetings (for onboarded users only)
   */
  private handleBasicKeywords(content: string): string | null {
    const lower = content.toLowerCase();

    if (
      lower.includes("hello") ||
      lower.includes("hi") ||
      lower.includes("hey") ||
      lower.includes("gm") ||
      lower.includes("good morning")
    ) {
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
   * 🔧 UPDATED: Enhanced help message for onboarded users
   */
  private getHelpMessage(): string {
    return `🤖 dStealth Agent Commands 🥷

💳 Payment Commands:
• create payment link for $25 - Generate anonymous payment link
• /balance - Check your earnings
• /links - Manage your payment links

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
• 🎯 Privacy rewards

Complete Dashboard: ${this.DSTEALTH_APP_URL}

Need help? Just ask me anything about privacy payments!`;
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
Messages Processed: ${status.processedMessageCount}
Stream Restarts: ${status.streamRestartCount}
Installations: ${status.installationCount}/5

Core Features: ✅ All operational
• FluidKey referral system
• fkey.id profile management with ZK proofs
• Payment link generation
• ZK receipt creation

XMTP SDK: v3.1.2 with enhanced reliability
Agent Address: ${status.agentAddress}

Agent is running optimally! 🚀`;
  }

  /**
   * Handle balance check
   */
  private async handleBalanceCheck(senderInboxId: string): Promise<string> {
    try {
      const userData = await agentDb.getStealthDataByUser(senderInboxId);

      if (!userData || !userData.fkeyId) {
        return `💰 Balance Check - Setup Required

To check your balance, complete your setup:

1. 🔑 Get FluidKey: ${this.FLUIDKEY_REFERRAL_URL}
2. 📝 Tell me your fkey.id: (e.g., "tantodefi.fkey.id")
3. 🚀 Complete setup: ${this.DSTEALTH_APP_URL}

Once setup is complete, I can show your privacy rewards balance!`;
      }

      return `💰 Balance Overview 

Profile: ${userData.fkeyId}.fkey.id
Privacy Points: Coming soon...
Rewards: Coming soon...

💡 Earn More:
• Generate payment links
• Receive stealth payments
• Complete privacy challenges

Full Dashboard: ${this.DSTEALTH_APP_URL}`;
    } catch (error) {
      console.error("Error checking balance:", error);
      return "❌ Failed to check balance. Please try again.";
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

      // Call the actual fkey.id lookup API
      const lookupResult = await this.callFkeyLookupAPI(cleanFkeyId);

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
      
      if (recentActionSets.length > 0 && !recentActionSets.includes(actionSetId)) {
        console.log(`⚠️  REJECTING outdated action set: ${actionSetId}`);
        console.log(`   Valid sets: ${recentActionSets.join(', ')}`);
        return `⚠️ Outdated Action Button

The action button you clicked is from an older menu. Please use more recent action buttons.

Clicked Action Set: ${actionSetId}
Recent Valid Sets: ${recentActionSets.length}

To get fresh actions:
Type /help for a new set of action buttons.

Why this happens:
• You have too many old button sets open
• Only the last ${this.MAX_VALID_ACTION_SETS} button sets are valid
• This prevents confusion from too many button sets

Try again: Type /help now!`;
      } else {
        console.log(`✅ Action set validation passed - processing action`);
      }

      // Extract base action ID from complex format: "action-name-timestamp-random"
      // Examples: 
      // - "get-help-1752163068713-wdn9zl" -> "get-help"
      // - "create-payment-link-1752163068713-wdn9zl" -> "create-payment-link"
      // - "test-simple-1752163068713-wdn9zl" -> "test-simple"
      
      let baseActionId = actionId;
      
      // Remove timestamp-random suffix pattern (e.g., "-1752163068713-wdn9zl")
      const timestampPattern = /-\d{13}-[a-z0-9]{6}$/;
      if (timestampPattern.test(actionId)) {
        baseActionId = actionId.replace(timestampPattern, '');
      }
      
      console.log(`🎯 Base Action ID extracted: "${baseActionId}" from "${actionId}"`);
      
      switch (baseActionId) {
        // New welcome onboarding actions
        case 'have-fkey':
          return await this.handleHaveFkeyFlow(senderInboxId);

        case 'no-fkey':
          return await this.handleNoFkeyFlow(senderInboxId);

        case 'confirm-fkey':
          return await this.processFkeyConfirmation(senderInboxId, true);

        case 'cancel-fkey':
          return await this.processFkeyConfirmation(senderInboxId, false);

        case 'dstealth-miniapp':
          return `https://dstealth.xyz`;

        case 'check-balance':
          return await this.handleBalanceCheck(senderInboxId);

        case 'create-payment-link':
          // Check if user has fkey.id set before creating payment link
          const userData = await agentDb.getStealthDataByUser(senderInboxId);
          
          if (!userData?.fkeyId) {
            return `🔒 Setup Required for Payment Links

To create payment links, please set your fkey.id first:

Step 1: 🔑 Get FluidKey: ${this.FLUIDKEY_REFERRAL_URL}
Step 2: 📝 Set your fkey.id: /set yourUsername
Step 3: 🚀 Complete setup: ${this.DSTEALTH_APP_URL}

Once setup is complete, you can create payment links instantly!`;
          }

          // Return instructions for flexible text-based payment creation
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

        case 'get-help':
          return this.getHelpMessage();

        case 'setup-fkey':
          return `🔑 Setup fkey.id

To set up your fkey.id:

Step 1: 🔑 Get FluidKey (if you don't have it)
${this.FLUIDKEY_REFERRAL_URL}

Step 2: 📝 Set your fkey.id
• /set yourUsername
• my fkey is yourUsername

Step 3: 🚀 Complete setup
${this.DSTEALTH_APP_URL}

Examples:
• /set tantodefi
• my fkey is tantodefi

Need help? Just ask me anything!`;

        case 'manage-links':
          return await this.handleLinksManagement(senderInboxId);

        case 'check-status':
          return this.getStatusMessage();

        case 'open-coinbase-wallet':
          return `🔗 Open in Coinbase Wallet

Your payment link is ready! Use the Coinbase Wallet app to:

• 📱 Open Coinbase Wallet
• 💳 Navigate to payment links
• 🚀 Complete your payment

Direct Link: Use the Daimo link from the previous message

Need help? Contact support at ${this.DSTEALTH_APP_URL}`;

        case 'share-link':
          return `📤 Share Payment Link

Share this payment link to receive anonymous payments:

The link from your previous payment will work with any wallet that supports Base network.

Sharing Options:
• 📱 Social media
• 💬 Direct messages
• 📧 Email
• 🔗 Any platform

Privacy Features:
• 🥷 Anonymous sender protection
• 🔒 Stealth address technology
• 🧾 ZK proof receipts

Dashboard: ${this.DSTEALTH_APP_URL}`;

        case 'view-receipt':
          return `🧾 ZK Receipt Available

Your transaction receipt will be available on the dStealth dashboard once payment is processed.

Features:
• 🔒 Zero-knowledge proof
• 🧾 Transaction verification
• 📊 Payment analytics
• 💼 Export options

View receipts: ${this.DSTEALTH_APP_URL}

The ZK proof ensures privacy while providing transaction verification.`;

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

        case 'send-transaction':
        case 'send-to-stealth':
          const paymentData = this.getPaymentDataForUser(senderInboxId);
          if (paymentData) {
            // 🔧 FIXED: Actually send wallet transaction request instead of just text
            try {
              // Get sender's wallet address
              const client = this.client;
              if (!client) {
                return `❌ Agent Error: Unable to access client for wallet transaction`;
              }

              // Get user's wallet address from inbox state
              const inboxState = await client.preferences.inboxStateFromInboxIds([senderInboxId]);
              const senderWalletAddress = inboxState[0]?.identifiers[0]?.identifier;
              
              if (!senderWalletAddress) {
                return `❌ Wallet Error: Unable to determine your wallet address`;
              }

              // Create wallet send calls for the stealth payment
              const walletSendCalls = this.createStealthWalletSendCalls(
                senderWalletAddress,
                paymentData.stealthAddress,
                paymentData.amount,
                paymentData.fkeyId
              );

              // Find the conversation to send the wallet request
              const conversations = await client.conversations.list();
              const userConversation = conversations.find(conv => {
                if (!(conv instanceof Group)) {
                  return conv.peerInboxId === senderInboxId;
                }
                return false;
              });

              if (!userConversation) {
                return `❌ Conversation Error: Unable to find conversation for wallet request`;
              }

              // Send the wallet send calls request
              await userConversation.send(walletSendCalls, ContentTypeWalletSendCalls);
              
              console.log(`💰 Wallet transaction request sent: $${paymentData.amount} USDC to ${paymentData.stealthAddress}`);
              
              // Return confirmation message
              return `💰 Wallet Transaction Request Sent!

Amount: $${paymentData.amount} USDC
Recipient: ${paymentData.fkeyId}.fkey.id  
Stealth Address: ${paymentData.stealthAddress.slice(0, 8)}...${paymentData.stealthAddress.slice(-6)}

✅ Please approve the transaction in your wallet

Features:
• 🥷 Anonymous sender privacy
• ⚡ Direct to stealth address
• 🧾 ZK proof receipt available
• 🎯 Earn privacy rewards

After approval: Share the transaction reference for ZK receipt!`;

            } catch (error) {
              console.error("Error sending wallet transaction request:", error);
              return `❌ Transaction Error: Failed to create wallet transaction request. Please try again.`;
            }
          } else {
            return `❌ Payment Data Missing: No payment information found. Please create a payment link first.`;
          }

        case 'open-daimo-link':
        case 'copy-payment-link':
        case 'daimo-pay-link':
          const linkData = this.getPaymentDataForUser(senderInboxId);
          if (linkData) {
            return `🔗 Daimo Pay Link

${linkData.daimoLink}`;
          } else {
            return `🔗 Daimo Pay Link

Your payment link is ready! Use the Daimo link from your recent payment creation.`;
          }

        case 'cbw-request-link':
          const cbwLinkData = this.getPaymentDataForUser(senderInboxId);
          if (cbwLinkData) {
            return `📱 CBW Request Link

${cbwLinkData.cbwLink}`;
          } else {
            return `📱 CBW Request Link

Your CBW payment link is ready! Use the CBW link from your recent payment creation.`;
          }

        case 'share-link':
        case 'share-payment-link':
          const shareData = this.getPaymentDataForUser(senderInboxId);
          if (shareData) {
            return `📤 Share Payment Link

Amount: $${shareData.amount} USDC
Recipient: ${shareData.fkeyId}.fkey.id

🔗 Payment Link:
${shareData.daimoLink}

Share this link to receive payments:
• 📱 Social media
• 💬 Direct messages  
• 📧 Email
• 🔗 Any platform

Privacy Features:
• 🥷 Anonymous sender protection
• 🔒 Stealth address technology
• 🧾 ZK proof receipts

Dashboard: ${this.DSTEALTH_APP_URL}`;
          } else {
            return `📤 Share Payment Link

Share your payment link to receive anonymous payments with privacy features.

Dashboard: ${this.DSTEALTH_APP_URL}`;
          }

        case 'create-another':
        case 'create-new-link':
          return `➕ Create Another Payment Link

Ready to create another payment link?

Examples:
• "create payment link for $25"
• "create payment link for $100"
• "create payment link for $500"
• "create payment link for $50.50"

Just type the amount: "create payment link for $X"`;

        // Legacy support for old simple IDs (just in case)
        case 'test':
        case 'test-simple':
        case 'balance':
        case 'payment':
        case 'help':
          console.log(`🔄 Legacy action ID detected: ${baseActionId}`);
          return this.handleIntentMessage({...intent, actionId: baseActionId === 'test' || baseActionId === 'test-simple' ? 'dstealth-miniapp' : 
                                                             baseActionId === 'balance' ? 'check-balance' :
                                                             baseActionId === 'payment' ? 'create-payment-link' :
                                                             'get-help'}, senderInboxId);

        default:
          console.log(`❓ Unknown base action ID: "${baseActionId}" from full ID: "${actionId}"`);
          return `❓ Unknown Action: ${baseActionId}

This action isn't recognized. Available actions:
• 🧪 Test Button (test-simple)
• 💰 Check Balance (check-balance)
• 💳 Create Payment Link (create-payment-link)
• 🔑 Setup fkey.id (setup-fkey)
• 🔗 Manage Links (manage-links)
• 📊 Check Status (check-status)
• ❓ Get Help (get-help)

Debug Info:
• Full Action ID: ${actionId}
• Extracted Base ID: ${baseActionId}

Need help? Type /help for all commands!`;
      }
    } catch (error) {
      console.error("❌ Error handling Intent message:", error);
      return `❌ Error Processing Action

Something went wrong processing your action. Please try:
• Type /help for available commands
• Contact support if the issue persists

Error: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  }

  /**
   * Helper method to track recent action sets for a user
   */
  private addRecentActionSet(senderInboxId: string, actionSetId: string): void {
    const recentSets = this.userRecentActionSets.get(senderInboxId) || [];
    
    // Add new action set to the beginning
    recentSets.unshift(actionSetId);
    
    // Keep only the most recent MAX_VALID_ACTION_SETS
    while (recentSets.length > this.MAX_VALID_ACTION_SETS) {
      recentSets.pop();
    }
    
    this.userRecentActionSets.set(senderInboxId, recentSets);
    
    console.log(`📋 Updated recent action sets for user ${senderInboxId}:`);
    console.log(`   Added: ${actionSetId}`);
    console.log(`   Current sets: [${recentSets.join(', ')}]`);
  }

  /**
   * 🔧 TBA PATTERN: Send help actions message (following TBA pattern)
   */
  private async sendHelpActionsMessage(senderInboxId: string): Promise<void> {
    try {
      if (!this.client) {
        console.log("⚠️ Base agent not available, skipping Help Actions message");
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
        console.log("⚠️ User conversation not found, skipping Help Actions message");
        return;
      }

      // Generate unique timestamp for this render to reset button states
      const renderTimestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);

      // Create Actions content with unique everything for complete state reset
      const actionsContent: ActionsContent = {
        id: `help-actions-${renderTimestamp}-${randomSuffix}`,
        description: `🤖 dStealth Agent - Choose an action (${new Date().toLocaleTimeString()}):`,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours from now
        actions: [
          {
            id: `dstealth-miniapp-${renderTimestamp}-${randomSuffix}`,
            label: "🌐 dStealth Miniapp",
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
            id: `get-help-${renderTimestamp}-${randomSuffix}`,
            label: "❓ Get Help",
            style: "secondary"
          }
        ]
      };

      // Send actions using the ActionsCodec
      await userConversation.send(actionsContent, ContentTypeActions);
      console.log(`✅ Help Actions sent with unique ID: ${actionsContent.id}`);
      
      // Track this action set in recent sets (instead of just latest)
      this.addRecentActionSet(senderInboxId, actionsContent.id);

    } catch (error) {
      console.error("❌ Error sending Help Actions:", error);
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
   * 🔧 ENHANCED: Send payment-related actions with self-contained information
   */
  private async sendTransactionActions(
    senderInboxId: string,
    amount: string,
    fkeyId: string,
    daimoLink: string,
    stealthAddress: string
  ): Promise<void> {
    try {
      if (!this.client) {
        console.log("⚠️ Base agent not available, skipping Transaction Actions");
        return;
      }

      // Get user's conversations to send actions to (same pattern as other methods)
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
        console.log("⚠️ User conversation not found, skipping Transaction Actions");
        return;
      }

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
            id: `cbw-request-link-${renderTimestamp}-${randomSuffix}`,
            label: "📱 CBW Request Link",
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
      await userConversation.send(actionsContent, ContentTypeActions);
      console.log(`✅ Transaction Actions sent with unique ID: ${actionsContent.id}`);
      
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
              faviconUrl: "https://dstealth.xyz/favicon.ico",
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
      
      // Extract transaction details
      const txData = transactionRef;
      const txHash = txData.reference;
      const networkId = txData.networkId;
      const metadata = txData.metadata;
      
      console.log("🔍 Transaction details extracted:");
      console.log(`  • Transaction Hash: ${txHash}`);
      console.log(`  • Network ID: ${networkId}`);
      console.log(`  • Metadata:`, metadata);
      
      // Check if this is a stealth payment transaction
      const isStealthPayment = (metadata as any)?.stealthRecipient || 
                               (metadata as any)?.privacyFeature === "stealth-address" ||
                               (metadata as any)?.zkProofAvailable === "true";
      
      if (isStealthPayment) {
        console.log("🥷 Stealth payment transaction detected!");
        
        // Store transaction for ZK receipt processing
        const userData = await agentDb.getStealthDataByUser(senderInboxId);
        if (userData) {
          // 🔧 ENHANCED: Store ZK receipt in Redis for frontend access
          try {
            const zkReceiptKey = `zk_receipt:${txHash}:${senderAddress}:${Date.now()}`;
            const zkReceiptData = {
              transactionHash: txHash,
              networkId: networkId?.toString() || "base",
              amount: metadata?.amount ? (parseFloat(metadata.amount.toString()) / 1000000).toFixed(2) : "Unknown",
              currency: "USDC",
              recipientAddress: userData.stealthAddress,
              fkeyId: userData.fkeyId,
              senderAddress: senderAddress,
              timestamp: Date.now(),
              status: 'completed',
              // Include the ZK proof from agent database
              zkProof: userData.zkProof,
              metadata: {
                transactionType: metadata?.transactionType || "Stealth Payment",
                privacyFeature: "stealth-address",
                zkProofAvailable: !!userData.zkProof,
                source: "dstealth-agent"
              }
            };
            
            // Store in Redis for frontend access (expires in 30 days)
            if (redis) {
              await redis.set(zkReceiptKey, JSON.stringify(zkReceiptData), { ex: 86400 * 30 });
              console.log(`✅ ZK receipt stored for frontend access: ${zkReceiptKey}`);
            }
          } catch (receiptError) {
            console.warn('⚠️ Failed to store ZK receipt for frontend:', receiptError);
          }
          
          console.log(`💾 Storing transaction reference for ZK receipt: ${txHash}`);
        }
        
        // Generate ZK receipt response
        const explorerUrl = this.getExplorerUrl(txHash, networkId?.toString() || "base");
        
        return `🧾 ZK Receipt - Stealth Payment Confirmed!

Transaction Details:
• Hash: ${txHash}
• Network: ${networkId === "base" ? "Base" : networkId}
• Type: ${metadata?.transactionType || "Stealth Payment"}
• Amount: ${metadata?.amount ? `$${(parseFloat(metadata.amount.toString()) / 1000000).toFixed(2)} USDC` : "Unknown"}
• Recipient: ${(metadata as any)?.stealthRecipient || "Stealth Address"}

Privacy Features:
• 🥷 Anonymous sender protection
• 🔒 Stealth address technology  
• 🧾 ZK proof receipt generated
• 🎯 Privacy rewards earned

🔗 View Transaction:
${explorerUrl}

✅ Transaction confirmed! Your ZK receipt is being processed.
🏆 Privacy rewards: Check your dashboard at ${this.DSTEALTH_APP_URL}

Thank you for using stealth payments! 🥷`;
      } else {
        // Regular transaction reference
        const explorerUrl = this.getExplorerUrl(txHash, networkId?.toString() || "base");
        
        return `📋 Transaction Reference Received

Transaction Details:
• Hash: ${txHash}
• Network: ${networkId === "base" ? "Base" : networkId}
• Type: ${metadata?.transactionType || "Transfer"}
• From: ${metadata?.fromAddress || senderAddress}

🔗 View Transaction:
${explorerUrl}

✅ Transaction confirmed! 
Want privacy features? Set up your fkey.id with /set yourUsername`;
      }
      
    } catch (error) {
      console.error("Error processing transaction reference:", error);
      return `❌ Transaction Processing Error

Failed to process your transaction reference. Please try again.

Need help? Contact support at ${this.DSTEALTH_APP_URL}`;
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
   * Check if user has fkey.id set and is fully onboarded
   */
  private async isUserOnboarded(senderInboxId: string): Promise<boolean> {
    try {
      const userData = await agentDb.getStealthDataByUser(senderInboxId);
      return !!(userData?.fkeyId && userData.fkeyId.trim().length > 0);
    } catch (error) {
      console.error("Error checking user onboarding status:", error);
      return false;
    }
  }

  /**
   * Send welcome message with action buttons for fkey.id onboarding
   */
  private async sendWelcomeWithActions(senderInboxId: string, conversation?: any): Promise<void> {
    try {
      if (!this.client) {
        console.log("⚠️ Client not available, skipping welcome actions");
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

      // Mark welcome as sent
      this.userWelcomesSent.add(senderInboxId);

    } catch (error) {
      console.error("❌ Error sending welcome actions:", error);
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
      
      // Call the existing fkey verification logic
      const verificationResult = await this.callFkeyLookupAPI(fkeyId);
      
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
        setupStatus: "fkey_set" as const
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
}
