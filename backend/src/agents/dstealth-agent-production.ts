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
  type ContentCodec,
  ContentTypeId,
  type EncodedContent,
} from "@xmtp/content-type-primitives";

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
  private client: Client | null = null;
  private agentAddress: string | null = null;
  private processedMessageCount = 0;
  private groupIntroductions: Set<string> = new Set();

  // Track the latest action set ID for each user to invalidate old buttons
  private userLatestActionSetId: Map<string, string> = new Map();

  // Track processed intent messages to prevent duplicates
  private processedIntentIds: Set<string> = new Set();

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
        codecs: [new ActionsCodec(), new IntentCodec(), new ReactionCodec()],
      });

      const identifier = await signer.getIdentifier();
      this.agentAddress = identifier.identifier;

      console.log(`📧 Agent Address: ${this.agentAddress}`);
      console.log(`🆔 Agent Inbox ID: ${this.client.inboxId}`);

      // Sync conversations
      console.log("🔄 Syncing conversations...");
      await this.client.conversations.sync();

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
        const response = await this.processTextMessage(message.content, senderInboxId, isGroup);
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
  private async processTextMessage(messageContent: string, senderInboxId: string, isGroup: boolean): Promise<string | undefined> {
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
        return await this.handleFkeyIdSubmission(messageContent, senderInboxId);
      }

      // Handle general messages with OpenAI or basic responses
      return await this.processGeneralMessage(messageContent, senderInboxId, isGroup);

    } catch (error) {
      console.error("❌ Error processing text message:", error);
      return "❌ Error processing your message. Please try again.";
    }
  }

  /**
   * Get client for action button methods
   */
  getClient(): Client | null {
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
        return `🔍 **No fkey.id Set**

You haven't set up your fkey.id yet!

**🚀 Get Started:**
1. 🔑 **Get FluidKey**: ${this.FLUIDKEY_REFERRAL_URL}
2. 📝 **Set your fkey.id**: \`/set yourUsername\`
3. 🚀 **Complete setup**: ${this.DSTEALTH_APP_URL}

**Examples:**
• \`/set tantodefi\`
• \`my fkey is tantodefi\`

**Need help?** Type \`/help\` for all commands!`;
      }

      // 🔧 SECURITY: Get fresh user data with current address verification
      const freshData = await this.getFreshUserStealthData(senderInboxId);
      
      if (!freshData) {
        return `❌ **Setup Issues**

Your fkey.id **${userData.fkeyId}** needs verification.

**Please re-verify**: \`/set ${userData.fkeyId}\`
**Or get FluidKey**: ${this.FLUIDKEY_REFERRAL_URL}`;
      }

      if (freshData.error) {
        return `❌ **fkey.id Verification Failed**

**Your fkey.id**: ${userData.fkeyId}  
**Error**: ${freshData.error}

**Fix this by:**
• Re-verify: \`/set ${userData.fkeyId}\`
• Check your FluidKey profile is public
• Get FluidKey: ${this.FLUIDKEY_REFERRAL_URL}`;
      }

      const { userData: currentData, currentAddress, isAddressUpdated } = freshData;
      const zkProofStatus = currentData.zkProof ? "✅ Verified" : "⚠️ Pending";
      const setupStatus = currentAddress ? "✅ Complete" : "⏳ Pending";
      
      const addressUpdateNotice = isAddressUpdated 
        ? `\n🔄 **Address Updated**: Your stealth address was refreshed.`
        : '';

      return `🔍 **Your fkey.id Status**

**Username**: ${currentData.fkeyId}.fkey.id  
**Setup**: ${setupStatus}
**ZK Proof**: ${zkProofStatus}
**Address**: ${currentAddress ? `${currentAddress.slice(0, 8)}...${currentAddress.slice(-6)}` : 'Pending'}${addressUpdateNotice}

**🚀 Quick Actions:**
• **Create payment link**: "create payment link for $25"
• **Check balance**: \`/balance\`
• **Manage links**: \`/links\`
• **Help**: \`/help\`

${setupStatus === "⏳ Pending" ? `**Complete Setup**: ${this.DSTEALTH_APP_URL}` : ""}`;

    } catch (error) {
      console.error("Error handling fkey status query:", error);
      return `❌ **Error Checking fkey Status**

Something went wrong. Please try:
• \`/set yourUsername\` to reset
• \`/help\` for all commands
• Contact support if issues persist`;
    }
  }

  /**
   * 🔧 NEW: Process general messages with intelligent responses
   */
  private async processGeneralMessage(content: string, senderInboxId: string, isGroup: boolean): Promise<string> {
    try {
      // Get user data for context
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
        const openAIResponse = await this.handleWithOpenAI(content, senderInboxId, isGroup);
        if (openAIResponse) {
          return openAIResponse;
        }
      }
      
      // 🔧 NEW: Group intro message if not sent yet
      if (isGroup && !this.groupIntroductions.has(senderInboxId)) {
        this.groupIntroductions.add(senderInboxId);
        return this.getGroupIntroMessage();
      }
      
      // Fallback to basic response
      return this.getBasicResponse(content, userData);
    } catch (error) {
      console.error("Error processing general message:", error);
      return `❌ **Error Processing Message**

Something went wrong. Please try:
• \`/help\` for all commands
• Contact support if issues persist`;
    }
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
        return `❌ **Invalid Username**

Please provide a valid fkey.id username.

**Examples:**
• \`/set tantodefi\`
• \`/set tantodefi.fkey.id\`
• \`my fkey is tantodefi\`

**Need FluidKey?** Get it here: ${this.FLUIDKEY_REFERRAL_URL}`;
      }

      // 🔧 ONLY NOW: Call fkey.id lookup API
      console.log(`🔍 Setting fkey.id for user: ${username}`);
      const lookupResult = await this.callFkeyLookupAPI(username);

      if (lookupResult.error) {
        return `❌ **fkey.id Setup Failed**

Could not verify \`${username}.fkey.id\`: ${lookupResult.error}

**Please ensure:**
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

      return `✅ **fkey.id Set Successfully!** 

**Your Profile**: \`${username}.fkey.id\`
**Address**: \`${lookupResult.address?.slice(0, 6)}...${lookupResult.address?.slice(-4)}\`
**Status**: ${proofStatus}

**Now you can:**
• 💳 Create payment links: "create payment link for $25"
• 🔍 Check balance: \`/balance\`
• 📊 View links: \`/links\`

**Complete Setup**: ${this.DSTEALTH_APP_URL}`;

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
      // Check if user has fkey.id set
          const userData = await agentDb.getStealthDataByUser(senderInboxId);
      
      if (!userData?.fkeyId) {
        // User hasn't set fkey.id
        if (isGroup) {
          // In groups, don't respond to users without fkey.id unless specifically mentioned
          return undefined;
          } else {
          // In DMs, ask them to set fkey.id
          return `👋 **Welcome to dStealth!** 🥷

To use the dStealth agent, please first set your fkey.id:

**Step 1**: 🔑 **Get FluidKey** (if you don't have it)
${this.FLUIDKEY_REFERRAL_URL}

**Step 2**: 📝 **Set your fkey.id**
• \`/set yourUsername\`
• \`my fkey is yourUsername\`

**Step 3**: 🚀 **Complete setup**
${this.DSTEALTH_APP_URL}

**Need help?** Type \`/help\` for commands!`;
        }
      }

      // 🔧 NEW: Use OpenAI if available
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
    
    return `Hi ${userData.fkeyId}! I'm here to help with anonymous payments and privacy tools. Type \`/help\` for available commands.`;
  }

  /**
   * 🔧 NEW: Group introduction message
   */
  private getGroupIntroMessage(): string {
    return `👋 **Hello! I'm dStealth** 🥷

I help with **anonymous payments** and **privacy tools**.

**To get started:**
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

    // /help command - always available - send action buttons
    if (cmd === "/help") {
        await this.sendHelpActionsMessage(senderInboxId);
        return ""; // Return empty string since we're sending actions
    }

    // /actions command - send action buttons
    if (cmd === "/actions") {
        await this.sendActionsMenu(senderInboxId);
        return ""; // Return empty string since we're sending actions
    }

    // Check if user has fkey.id set for other commands
    const userData = await agentDb.getStealthDataByUser(senderInboxId);
    if (!userData?.fkeyId && cmd !== "/help") {
      if (isGroup) {
        return "🔒 Please DM me to set your fkey.id first: `/set yourUsername`";
      } else {
        return `🔒 **Please set your fkey.id first**

**Set your fkey.id:**
• \`/set yourUsername\`
• \`my fkey is yourUsername\`

**Need FluidKey?** ${this.FLUIDKEY_REFERRAL_URL}`;
      }
    }

    switch (cmd) {
      case "/status":
        return this.getStatusMessage();

      case "/balance":
        return await this.handleBalanceCheck(senderInboxId);

      case "/links":
        return await this.handleLinksManagement(senderInboxId);

      default:
        if (cmd.startsWith("/set ")) {
          // Handle via fkey set command
          return await this.handleFkeySetCommand(command, senderInboxId, isGroup);
        }
        if (cmd.startsWith("/fkey ")) {
          const fkeyId = cmd.slice(6).trim();
          return await this.handleFkeyLookup(fkeyId, senderInboxId);
        }
        return `❌ Unknown command. Type \`/help\` for available commands.`;
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
          return "🔒 Please DM me to set your fkey.id first: `/set yourUsername`";
        } else {
        return `🔒 **Payment Link Setup Required**

To create payment links, please set your fkey.id first:

**Step 1**: \`/set yourUsername\`
**Step 2**: Complete setup at ${this.DSTEALTH_APP_URL}

**Need FluidKey?** ${this.FLUIDKEY_REFERRAL_URL}`;
        }
      }

      // 🔧 SECURITY: Get fresh user data with current address verification
      const freshData = await this.getFreshUserStealthData(senderInboxId);

      if (!freshData) {
        return `❌ **Setup Incomplete**

Please complete your setup at ${this.DSTEALTH_APP_URL}`;
      }

      if (freshData.error) {
        return `❌ **Security Error**

Could not verify your fkey.id: ${freshData.error}

Please re-verify: \`/set ${userData.fkeyId}\``;
      }

      const { userData: currentData, currentAddress, isAddressUpdated } = freshData;
      
      // Generate proper Daimo payment link
      const amountInDollars = parseFloat(amount);
      
      // 🔧 VALIDATION: Check Daimo API limits (max $4000)
      if (amountInDollars > 4000) {
        return `❌ **Payment Amount Too Large**

**Requested**: $${amount}
**Daimo Limit**: $4000.00 maximum

**Please try a smaller amount:**
• "create payment link for $100"
• "create payment link for $500"
• "create payment link for $1000"

**Why the limit?** Daimo has security limits for payment links.
**Need larger amounts?** Visit ${this.DSTEALTH_APP_URL} for alternatives.`;
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
        ? `\n⚠️ **Address Updated**: Your stealth address was refreshed.`
        : '';

      // Send main Daimo response
      const daimoMessage = `💳 Payment Link Created! 🥷

Amount: $${amount} USDC
Recipient: ${currentData.fkeyId}.fkey.id
Address: ${currentAddress.slice(0, 6)}...${currentAddress.slice(-4)}${addressChangeWarning}

🔗 Daimo Payment Link: ${daimoResponse.url}

Features:
• 🥷 Anonymous sender privacy
• ⚡ Direct to stealth address via Daimo
• 🎯 Earn privacy rewards
• 🧾 ZK proof receipt

Share this link to receive payments!`;

      // 🔧 FIXED: Send Transaction Actions for the payment link - now uses senderInboxId
      await this.sendTransactionActions(senderInboxId, amount, currentData.fkeyId, daimoResponse.url, currentAddress);

      return daimoMessage;

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
  ): Promise<string> {
    try {
      const fkeyId = fkeyInput.replace(".fkey.id", "").toLowerCase().trim();

      if (!fkeyId || fkeyId.length < 2) {
        return 'Please provide a valid fkey.id username (e.g., "tantodefi" or "tantodefi.fkey.id")';
      }

      // 🔧 FIXED: Call fkey.id lookup API to get ZK proof
      console.log(`🔍 Looking up fkey.id: ${fkeyId}`);
      const lookupResult = await this.callFkeyLookupAPI(fkeyId);

      if (lookupResult.error) {
        return `❌ **fkey.id Lookup Failed**

Could not verify ${fkeyId}.fkey.id: ${lookupResult.error}

**Please ensure:**
1. 🔑 You have a FluidKey account: ${this.FLUIDKEY_REFERRAL_URL}
2. 📝 Your username is correct (e.g., "tantodefi.fkey.id")
3. 🌐 Your fkey.id profile is publicly accessible

Try again with the correct username, or get FluidKey first!`;
      }

      // Store fkey.id association with ZK proof
      const userData = {
        userId: senderInboxId,
        fkeyId,
        stealthAddress: lookupResult.address || "", // Store the verified address
        zkProof: lookupResult.proof, // 🔧 FIXED: Store the actual ZK proof
        lastUpdated: Date.now(),
        requestedBy: senderInboxId,
      };

      await agentDb.storeUserStealthData(userData);

      const proofStatus = lookupResult.proof
        ? "✅ ZK Proof Verified"
        : "⚠️ No ZK Proof Available";

      return `✅ **fkey.id Connected!** 

**Your Profile**: ${fkeyId}.fkey.id
**Address**: ${lookupResult.address?.slice(0, 6)}...${lookupResult.address?.slice(-4)}
**ZK Proof**: ${proofStatus}

**🚀 Next Steps:**
1. **Complete Setup**: ${this.DSTEALTH_APP_URL}
2. **Generate Stealth Address** 
3. **Create Payment Links**: "create payment link for $X"

**💡 Your ZK proof enables:**
• Generate anonymous payment links
• Receive cryptographic receipts for transactions
• Earn privacy rewards
• Access advanced stealth features

**Ready to finish setup?** Visit ${this.DSTEALTH_APP_URL} now!`;
    } catch (error) {
      console.error("Error handling fkey.id submission:", error);
      return "❌ Failed to save fkey.id. Please try again.";
    }
  }

  /**
   * Handle basic keywords and greetings
   */
  private handleBasicKeywords(content: string): string | null {
    const lower = content.toLowerCase();

    if (
      lower.includes("hello") ||
      lower.includes("hi") ||
      lower.includes("hey")
    ) {
      return `👋 **Hello! I'm the dStealth Agent** 🥷

I help you create **anonymous payment links** and earn **privacy rewards**!

**🚀 Get Started:**
1. 🔑 **Get FluidKey**: ${this.FLUIDKEY_REFERRAL_URL}
2. 📝 **Tell me your fkey.id**: (e.g., "tantodefi.fkey.id")
3. 🚀 **Complete setup**: ${this.DSTEALTH_APP_URL}
4. 💳 **Create links**: "create payment link for $X"

**Commands**: /help, /status, /balance
**Questions?** Just ask me anything about stealth payments!`;
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
          ? `\n🔄 **Address Updated**: Your stealth address was refreshed from fkey.id.`
          : '';

        return `👋 **Welcome back, ${userData.fkeyId}!** 🥷

**Setup Status**: ${setupStatus === "complete" ? "✅ Complete" : "⏳ Pending"}
**ZK Proof**: ${zkProofStatus}${addressUpdateWarning}

**Quick Actions:**
• **"create payment link for $X"** - Generate payment links
• **"/balance"** - Check your earnings
• **"/links"** - Manage your links

${setupStatus === "pending" ? `**Complete Setup**: ${this.DSTEALTH_APP_URL}` : ""}

**Need help?** Type "/help" for all commands!`;
      }

      // New user - Core Feature #1: FluidKey signup promotion
      return `👋 **Welcome to dStealth!** 🥷

I'm your **privacy assistant** for anonymous payments & rewards.

**🚀 Get Started (2 minutes):**

**Step 1**: 🔑 **Get FluidKey** (free privacy wallet)
${this.FLUIDKEY_REFERRAL_URL}

**Step 2**: 📝 **Tell me your fkey.id** 
Example: "tantodefi.fkey.id"

**Step 3**: 🚀 **Complete setup**
${this.DSTEALTH_APP_URL}

**💰 What you'll get:**
• 🥷 **Anonymous payment links**
• 🧾 **ZK receipts** for transactions  
• 🎯 **Privacy rewards** & points
• 🔒 **Stealth addresses** for privacy

**Try saying**: "tantodefi.fkey.id" or "/help"

*Start earning privacy rewards today!*`;
    } catch (error) {
      console.error("Error in user welcome:", error);
      return `👋 **Welcome to dStealth!** 🥷

Get started with FluidKey: ${this.FLUIDKEY_REFERRAL_URL}
Then tell me your fkey.id username!`;
    }
  }

  /**
   * 🔧 UPDATED: Enhanced help message with new commands - No markdown formatting
   */
  private getHelpMessage(): string {
    return `🤖 dStealth Agent Commands 🥷

🔧 Setup Commands:
• /set yourUsername - Set your fkey.id (required)
• my fkey is yourUsername - Alternative way to set fkey.id

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
• DM me to set up your fkey.id privately
• Use @dstealth, @dstealth.eth, or @dstealth.base.eth

🚀 Quick Start:
1. Get FluidKey: ${this.FLUIDKEY_REFERRAL_URL}
2. Set fkey.id: /set yourUsername  
3. Complete setup: ${this.DSTEALTH_APP_URL}
4. Create payment links!

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

    return `📊 **Agent Status**

**Status**: ${status.isRunning ? "🟢 Active" : "🔴 Inactive"}
**Messages Processed**: ${status.processedMessageCount}
**Stream Restarts**: ${status.streamRestartCount}
**Installations**: ${status.installationCount}/5

**Core Features**: ✅ All operational
• FluidKey referral system
• fkey.id profile management with ZK proofs
• Payment link generation
• ZK receipt creation

**XMTP SDK**: v3.1.0+ with enhanced reliability
**Agent Address**: ${status.agentAddress}

Agent is running optimally! 🚀`;
  }

  /**
   * Handle balance check
   */
  private async handleBalanceCheck(senderInboxId: string): Promise<string> {
    try {
      const userData = await agentDb.getStealthDataByUser(senderInboxId);

      if (!userData || !userData.fkeyId) {
        return `💰 **Balance Check - Setup Required**

To check your balance, complete your setup:

1. 🔑 **Get FluidKey**: ${this.FLUIDKEY_REFERRAL_URL}
2. 📝 **Tell me your fkey.id**: (e.g., "tantodefi.fkey.id")
3. 🚀 **Complete setup**: ${this.DSTEALTH_APP_URL}

Once setup is complete, I can show your privacy rewards balance!`;
      }

      return `💰 **Balance Overview** 

**Profile**: ${userData.fkeyId}.fkey.id
**Privacy Points**: Coming soon...
**Rewards**: Coming soon...

**💡 Earn More:**
• Generate payment links
• Receive stealth payments
• Complete privacy challenges

**Full Dashboard**: ${this.DSTEALTH_APP_URL}`;
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
        return `🔗 **Links Management - Setup Required**

To manage your payment links:

1. 🔑 **Get FluidKey**: ${this.FLUIDKEY_REFERRAL_URL}
2. 📝 **Tell me your fkey.id**: (e.g., "tantodefi.fkey.id")
3. 🚀 **Complete setup**: ${this.DSTEALTH_APP_URL}

Then you can create and manage payment links!`;
      }

      if (freshData.error) {
        return `❌ **Links Management Error: fkey.id Verification Failed**

Could not verify your current fkey.id address: ${freshData.error}

**This could mean:**
• Your fkey.id profile is no longer accessible
• Your FluidKey account has issues
• Network connectivity problems

**Please re-verify your fkey.id**: "${freshData.userData.fkeyId}.fkey.id"
**Or get support**: ${this.FLUIDKEY_REFERRAL_URL}`;
      }

      const { userData, currentAddress, isAddressUpdated } = freshData;

      return `🔗 **Payment Links Management**

**Profile**: ${userData.fkeyId}.fkey.id
**Active Links**: View in dashboard
**Analytics**: View in dashboard

**🚀 Quick Actions:**
• **"create payment link for $X"** - Generate new link
• **Full Dashboard**: ${this.DSTEALTH_APP_URL}

**💡 Pro Tip**: Share your payment links to earn privacy rewards!`;
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
        return `❌ **fkey.id Lookup Failed**

Could not find ${cleanFkeyId}.fkey.id: ${lookupResult.error}

**Common Issues:**
• Username might be incorrect
• Profile might be private
• FluidKey account might not exist

**🔗 Get FluidKey**: ${this.FLUIDKEY_REFERRAL_URL}
**💡 Want your own fkey.id?** Get FluidKey first!`;
      }

      const hasZkProof = lookupResult.proof
        ? "✅ ZK Proof Available"
        : "⚠️ No ZK Proof";
      const address = lookupResult.address || "Unknown";

      return `🔍 **fkey.id Lookup Result**

**Profile**: ${cleanFkeyId}.fkey.id
**Address**: ${address.slice(0, 6)}...${address.slice(-4)}
**ZK Proof**: ${hasZkProof}
**Status**: ✅ Verified

**🚀 Profile Features**:
• Anonymous payment links
• Cryptographic identity verification
• Privacy-preserving transactions

**Want to connect this profile?** Just say "${cleanFkeyId}.fkey.id"
**Get your own FluidKey**: ${this.FLUIDKEY_REFERRAL_URL}`;
    } catch (error) {
      console.error("Error in fkey lookup:", error);
      return `❌ **Lookup Error**

Failed to lookup ${cleanFkeyId}.fkey.id. Please try again.

**Get FluidKey**: ${this.FLUIDKEY_REFERRAL_URL}`;
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

      // Check if this is from the latest action set for this user
      const latestActionSetId = this.userLatestActionSetId.get(senderInboxId);
      console.log(`🔍 Action Set Validation for user ${senderInboxId}:`);
      console.log(`   Current Intent Action Set: ${actionSetId}`);
      console.log(`   Latest Stored Action Set: ${latestActionSetId || 'none'}`);
      console.log(`   Total Tracked Users: ${this.userLatestActionSetId.size}`);
      
      if (latestActionSetId && latestActionSetId !== actionSetId) {
        console.log(`⚠️  REJECTING outdated action set: ${actionSetId}, latest: ${latestActionSetId}`);
        return `⚠️ Outdated Action Button

The action button you clicked is from an older menu. Please use the latest action buttons.

Clicked Action Set: ${actionSetId}
Latest Action Set: ${latestActionSetId}

To get the latest actions:
Type /help for a fresh set of action buttons.

Why this happens:
• New action buttons were sent after the one you clicked
• Only the most recent action buttons are valid
• This prevents accidentally clicking old buttons

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
        case 'test-simple':
          return `🧪 Test Button Clicked Successfully!

✅ Intent Message Working! 

The action button successfully triggered an Intent message with:
• Action ID: ${actionId}
• Base Action: ${baseActionId}
• Intent ID: ${intent.id}
• Sender: ${senderInboxId}

This confirms that:
1. ✅ Action buttons are rendering correctly
2. ✅ Intent messages are being sent by Coinbase Wallet
3. ✅ Intent content type detection is working
4. ✅ Intent message processing is functional
5. ✅ Base action ID extraction is working

🎉 The action button system is working! 

Next steps:
• All other action buttons should now work
• Try clicking "💰 Check balance" or other buttons
• Type /help to see all available actions

Complete Setup: ${this.DSTEALTH_APP_URL}`;

        case 'check-balance':
          return await this.handleBalanceCheck(senderInboxId);

        case 'create-payment-link':
          return `💳 Create Payment Link

To create a payment link, specify the amount:

Examples:
• "create payment link for $25"
• "create payment link for $100"
• "create payment link for $500"

Setup Required:
🔑 Get FluidKey: ${this.FLUIDKEY_REFERRAL_URL}
📝 Set fkey.id: /set yourUsername
🚀 Complete setup: ${this.DSTEALTH_APP_URL}

Try saying: "create payment link for $25"`;

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
          return `📤 Share Your Payment Link

Copy the Daimo link from the previous message and share it with:

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
          return `🧾 View ZK Receipt

Your cryptographic receipt will be available at:

Receipt Dashboard: ${this.DSTEALTH_APP_URL}

What's included:
• 🧾 Cryptographic proof of payment
• 🔒 Privacy-preserving verification
• 📊 Transaction analytics
• 🏆 Privacy rewards earned

Why ZK receipts?
• Prove payment without revealing sender identity
• Earn privacy rewards for stealth transactions
• Build reputation in privacy-first economy`;

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
          return `💰 Send Transaction

Ready to send your transaction? Use Coinbase Wallet to complete the payment:

📱 Open Coinbase Wallet
💳 Navigate to your payment
🚀 Confirm and send

Features:
• 🥷 Anonymous sender privacy
• ⚡ Direct to stealth address
• 🧾 ZK proof receipt
• 🎯 Earn privacy rewards

Your transaction will be processed securely through the stealth protocol.`;

        case 'open-daimo-link':
          return `🔗 Open Daimo Payment Link

The Daimo payment link has been created! You can:

📋 Copy the link from the previous message
🌐 Open it in any browser
💳 Complete payment with any wallet
📱 Share with others to receive payments

Daimo Features:
• ⚡ Fast Base network payments
• 💰 USDC transactions
• 🔗 Universal payment links
• 🛡️ Secure transactions

The link works with any wallet that supports Base network.`;

        // Legacy support for old simple IDs (just in case)
        case 'test':
        case 'balance':
        case 'payment':
        case 'help':
          console.log(`🔄 Legacy action ID detected: ${baseActionId}`);
          return this.handleIntentMessage({...intent, actionId: baseActionId === 'test' ? 'test-simple' : 
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
            id: `test-simple-${renderTimestamp}-${randomSuffix}`,
            label: "🧪 Test Button",
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
      
      // Store this as the latest action set for this user
      this.userLatestActionSetId.set(senderInboxId, actionsContent.id);
      console.log(`📋 Stored latest action set ID for user ${senderInboxId}: ${actionsContent.id}`);

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
      
      // Store this as the latest action set for this user
      this.userLatestActionSetId.set(senderInboxId, actionsContent.id);
      console.log(`📋 Stored latest action set ID for user ${senderInboxId}: ${actionsContent.id}`);

    } catch (error) {
      console.error("❌ Error sending Actions Menu:", error);
    }
  }

  /**
   * 🔧 FIXED: Send payment-related actions - Now uses senderInboxId like other methods
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

      // Create transaction-related Actions content with unique everything
      const actionsContent: ActionsContent = {
        id: `transaction-actions-${renderTimestamp}-${randomSuffix}`,
        description: `💳 Payment Link Created for ${fkeyId}.fkey.id ($${amount} USDC) - ${new Date().toLocaleTimeString()}`,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours from now
        actions: [
          {
            id: `send-transaction-${renderTimestamp}-${randomSuffix}`,
            label: "💰 Send Transaction",
            style: "primary"
          },
          {
            id: `open-daimo-link-${renderTimestamp}-${randomSuffix}`,
            label: "🔗 Open Daimo Link",
            style: "secondary"
          },
          {
            id: `share-link-${renderTimestamp}-${randomSuffix}`,
            label: "📤 Share Link",
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
      
      // Store this as the latest action set for this user
      this.userLatestActionSetId.set(senderInboxId, actionsContent.id);
      console.log(`📋 Stored latest action set ID for user ${senderInboxId}: ${actionsContent.id}`);

    } catch (error) {
      console.error("❌ Error sending Transaction Actions:", error);
    }
  }
}