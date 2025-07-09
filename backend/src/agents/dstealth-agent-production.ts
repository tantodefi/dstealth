/**
 * 🔧 Production dStealth Agent - Clean Architecture with XMTP SDK v3.1.0
 *
 * Core Features:
 * 1. FluidKey signup with referral code
 * 2. fkey.id setting and management via commands
 * 3. Payment link generation + ZK receipts (requires fkey.id)
 * 4. Smart group chat behavior with @mentions
 * 5. OpenAI integration for intelligent responses
 *
 * Architecture: Uses XmtpAgentBase for clean separation of concerns
 */

import { agentDb } from '../lib/agent-database.js';
import { daimoPayClient } from '../lib/daimo-pay.js';
import { XmtpAgentBase, type XmtpAgentConfig, type ProcessedMessage, type StreamFailureCallback } from '../lib/xmtp-agent-base.js';
import { createSigner, getEncryptionKeyFromHex } from '../helper.js';
import { env } from '../config/env.js';
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

// 🔧 NEW: Coinbase Wallet Content Type IDs
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

// 🔧 NEW: Coinbase Wallet Actions types
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

interface DStealthAgentStatus {
  isRunning: boolean;
  streamRestartCount: number;
  processedMessageCount: number;
  installationCount: number;
  lastError?: string;
}

// 🔧 NEW: Actions Codec Implementation
export class ActionsCodec implements ContentCodec<ActionsContent> {
  get contentType(): ContentTypeId {
    return ContentTypeActions;
  }

  encode(content: ActionsContent): EncodedContent {
    this.validateContent(content);
    return {
      type: ContentTypeActions,
      parameters: { encoding: 'UTF-8' },
      content: new TextEncoder().encode(JSON.stringify(content)),
    };
  }

  decode(content: EncodedContent): ActionsContent {
    const encoding = content.parameters.encoding;
    if (encoding && encoding !== 'UTF-8') {
      throw new Error(`unrecognized encoding ${encoding}`);
    }
    const decodedContent = new TextDecoder().decode(content.content);
    try {
      const parsed = JSON.parse(decodedContent) as ActionsContent;
      this.validateContent(parsed);
      return parsed;
    } catch (error) {
      throw new Error(`Failed to decode Actions content: ${error}`);
    }
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

  private validateContent(content: ActionsContent): void {
    if (!content.id || typeof content.id !== 'string') {
      throw new Error('Actions.id is required and must be a string');
    }
    if (!content.description || typeof content.description !== 'string') {
      throw new Error('Actions.description is required and must be a string');
    }
    if (!Array.isArray(content.actions) || content.actions.length === 0) {
      throw new Error('Actions.actions is required and must be a non-empty array');
    }
    if (content.actions.length > 10) {
      throw new Error('Actions.actions cannot exceed 10 actions for UX reasons');
    }
  }
}

// 🔧 NEW: Intent Codec Implementation
export class IntentCodec implements ContentCodec<IntentContent> {
  get contentType(): ContentTypeId {
    return ContentTypeIntent;
  }

  encode(content: IntentContent): EncodedContent {
    this.validateContent(content);
    return {
      type: ContentTypeIntent,
      parameters: { encoding: 'UTF-8' },
      content: new TextEncoder().encode(JSON.stringify(content)),
    };
  }

  decode(content: EncodedContent): IntentContent {
    const encoding = content.parameters.encoding;
    if (encoding && encoding !== 'UTF-8') {
      throw new Error(`unrecognized encoding ${encoding}`);
    }
    const decodedContent = new TextDecoder().decode(content.content);
    try {
      const parsed = JSON.parse(decodedContent) as IntentContent;
      this.validateContent(parsed);
      return parsed;
    } catch (error) {
      throw new Error(`Failed to decode Intent content: ${error}`);
    }
  }

  fallback(content: IntentContent): string {
    return `User selected action: ${content.actionId}`;
  }

  shouldPush(): boolean {
    return true;
  }

  private validateContent(content: IntentContent): void {
    if (!content.id || typeof content.id !== 'string') {
      throw new Error('Intent.id is required and must be a string');
    }
    if (!content.actionId || typeof content.actionId !== 'string') {
      throw new Error('Intent.actionId is required and must be a string');
    }
  }
}

// 🔧 Custom ReactionCodec removed - using official XMTP package instead

/**
 * Production-ready dStealth Agent focused on core business features
 */
export class DStealthAgentProduction {
  private baseAgent: XmtpAgentBase | null = null;
  private agentAddress: string | null = null;
  private processedMessageCount = 0;
  private lastError: string | null = null;

  // FluidKey referral configuration
  private readonly FLUIDKEY_REFERRAL_URL = "https://app.fluidkey.com/?ref=62YNSG";
  private readonly DSTEALTH_APP_URL = "https://dstealth.xyz";

  // 🔧 NEW: Track group introductions to send welcome only once per group
  private groupIntroductions: Set<string> = new Set();

  // 🔧 NEW: OpenAI configuration
  private readonly OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  /**
   * Create and start the production dStealth agent
   */
  static async createAndStart(
    config: XmtpAgentConfig,
    streamFailureCallback?: StreamFailureCallback,
  ): Promise<DStealthAgentProduction> {
    const agent = new DStealthAgentProduction();
    await agent.initialize(config, streamFailureCallback);
    return agent;
  }

  /**
   * Initialize the agent with XMTP client and content type codecs
   */
  private async initialize(
    config: XmtpAgentConfig,
    streamFailureCallback?: StreamFailureCallback,
  ): Promise<void> {
    try {
      console.log("🤖 Initializing Production dStealth Agent...");

      // Register content type codecs for Coinbase Wallet Actions
      const codecs = [
        new ActionsCodec(),
        new IntentCodec(),
        new ReactionCodec(), // Add ReactionCodec here
      ];

      this.baseAgent = await XmtpAgentBase.createAndStart(
        { ...config, codecs },
        this.processMessage.bind(this),
        streamFailureCallback,
      );

      // Get agent details
      const agentClient = this.baseAgent.getClient();
      const signer = createSigner(config.walletKey);
      const identifier = await Promise.resolve(signer.getIdentifier());
      this.agentAddress = identifier.identifier;

      console.log("🔧 Content type codecs passed to XmtpAgentBase (will be registered with XMTP client)");
      console.log("✅ Production dStealth Agent initialized successfully");
      console.log(`📬 Agent Address: ${this.agentAddress}`);
      console.log(`📬 Agent Inbox ID: ${agentClient.inboxId}`);
    } catch (error) {
      console.error("❌ Failed to initialize Production dStealth Agent:", error);
      throw error;
    }
  }

  /**
   * Process incoming XMTP message and generate appropriate response
   */
  private async processMessage(
    message: ProcessedMessage,
  ): Promise<string | undefined> {
    try {
      this.processedMessageCount++;
      
      // 🥷 NEW: Send proper ninja emoji reaction using Node SDK content type pattern
      try {
        if (this.baseAgent && message.messageId) {
          const client = this.baseAgent.getClient();
          const conversation = await client.conversations.getConversationById(message.conversationId);
          
          if (conversation) {
            // Create proper XMTP reaction content
            const reaction: Reaction = {
              reference: message.messageId,
              action: "added",
              content: "🥷",
              schema: "unicode"
            };
            
            // Use proper Node SDK content type pattern (bypass type checking)
            await (conversation as any).send(reaction, ContentTypeReaction);
            console.log("🥷 Ninja reaction sent (proper content type)");
          }
        }
      } catch (receiptError) {
        console.error("⚠️ Failed to send ninja reaction:", receiptError);
        // Fallback to simple emoji if content type fails
        try {
          const client = this.baseAgent?.getClient();
          const conversation = await client?.conversations.getConversationById(message.conversationId);
          if (conversation) {
            await conversation.send("🥷");
            console.log("🥷 Ninja emoji sent (fallback)");
          }
        } catch (fallbackError) {
          console.error("⚠️ Fallback emoji also failed:", fallbackError);
        }
      }
      
      // 🔧 NEW: Proper content type detection for Intent messages
      const messageContent = message.content;
      const senderInboxId = message.senderInboxId;
      
      console.log(`💬 Processing message from ${senderInboxId}`);
      console.log(`📋 Content type: ${typeof messageContent}`);

      // Handle Intent content type from Coinbase Wallet button interactions
      if (this.isIntentContent(messageContent)) {
        const intent = messageContent as IntentContent;
        console.log(`🎯 Processing Intent: ${intent.actionId}`);
        
        const response = await this.handleIntentMessage(intent, senderInboxId);
        return response;
      }
      
      // Check if message should be processed based on channel (DM vs group)
      const isGroup = message.conversationId.startsWith("group-");
      const shouldProcess = await this.shouldProcessMessage(
        messageContent,
        senderInboxId,
        isGroup,
        message.conversationId,
      );
      
      if (!shouldProcess) {
        console.log("⏸️ Message skipped - not addressed to agent");
        return undefined;
      }
      
      // Extract message text
      const content = (messageContent as string).trim();
      
      console.log(`📝 Message content: "${content}"`);
      
      // Handle fkey.id setting commands first
      if (this.isFkeySetCommand(content)) {
        return await this.handleFkeySetCommand(content, senderInboxId, isGroup);
      }

      // 🔧 NEW: Handle fkey status queries
      if (this.isFkeyStatusQuery(content)) {
        return await this.handleFkeyStatusQuery(senderInboxId, isGroup);
      }

      // Handle fkey.id patterns (e.g., "tantodefi.fkey.id")
      if (this.isFkeyIdPattern(content)) {
        return await this.handleFkeyIdSubmission(content, senderInboxId);
      }

      // Extract payment amount if present
      const paymentAmount = this.extractPaymentAmount(content);
      if (paymentAmount) {
        return await this.handlePaymentRequest(paymentAmount, senderInboxId, message.conversationId, isGroup);
      }

      // Process general message using OpenAI
      const response = await this.processGeneralMessage(content, senderInboxId, isGroup);
      
      return response;
    } catch (error) {
      console.error("❌ Error processing message:", error);
      throw error;
    }
  }

  /**
   * 🔧 NEW: Check if message content is Intent content type
   */
  private isIntentContent(content: any): content is IntentContent {
    return content && 
           typeof content === 'object' && 
           'id' in content && 
           'actionId' in content &&
           typeof content.id === 'string' &&
           typeof content.actionId === 'string';
  }

  /**
   * 🔧 UPDATED: Enhanced message processing logic for group chats
   */
  private async shouldProcessMessage(messageContent: string, senderInboxId: string, isGroup: boolean, conversationId: string): Promise<boolean> {
    try {
      const trimmed = messageContent.trim().toLowerCase();
      
      // Get conversation info to determine if it's a group or DM
      const client = this.baseAgent?.getClient();
      if (!client) {
        console.log("🔇 No client available for conversation check");
        return false;
      }

      const conversation = await client.conversations.getConversationById(conversationId);
      if (!conversation) {
        console.log("🔇 Conversation not found");
        return false;
      }

      const isGroup = conversation instanceof Group;
      
      if (isGroup) {
        // 🔧 UPDATED: Group chat logic - more restrictive
        
        // Always send welcome message if not sent yet
        if (!this.groupIntroductions.has(conversationId)) {
          console.log("👋 Sending group introduction");
          return true;
        }

        // Check for @mentions
        const hasMention = trimmed.includes('@dstealth') || 
                          trimmed.includes('@dstealth.eth') ||
                          trimmed.includes('@dstealth.base.eth');
        
        if (hasMention) {
          console.log("📢 Group message mentions @dstealth - will process");
          return true;
        }

        // Check for payment link requests and other trigger phrases
        const hasPaymentTrigger = (trimmed.includes('create') && trimmed.includes('payment') && trimmed.includes('link')) ||
                                  (trimmed.includes('payment') && trimmed.includes('link')) ||
                                  (trimmed.includes('create') && trimmed.includes('link'));
        
        if (hasPaymentTrigger) {
          const userData = await agentDb.getStealthDataByUser(senderInboxId);
          if (userData?.fkeyId) {
            console.log("💰 Group payment request from user with fkey.id - will process");
            return true;
          } else {
            console.log("🔒 Group payment request from user without fkey.id - will ask to DM");
            return true; // Process to send DM request message
          }
        }

        // TODO: Check if message is a reply to the agent (requires message metadata)
        // For now, we can't easily detect replies in groups without additional XMTP metadata
        
        console.log("🔇 Group message doesn't meet criteria - ignoring");
        return false;
      } else {
        // In DMs: Always process (will handle fkey.id requirement in response)
        console.log("💬 DM - will process");
          return true;
        }
    } catch (error) {
      console.error("❌ Error checking if message should be processed:", error);
      // Default to processing if we can't determine (safer)
          return true;
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
      const baseUrl = env.FRONTEND_URL || 'http://localhost:3000';
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
      const daimoMessage = `💳 **Payment Link Created!** 🥷

**Amount**: $${amount} USDC
**Recipient**: ${currentData.fkeyId}.fkey.id
**Address**: ${currentAddress.slice(0, 6)}...${currentAddress.slice(-4)}${addressChangeWarning}

**🔗 Daimo Payment Link**: ${daimoResponse.url}

**Features:**
• 🥷 Anonymous sender privacy
• ⚡ Direct to stealth address via Daimo
• 🎯 Earn privacy rewards
• 🧾 ZK proof receipt

Share this link to receive payments!`;

      // 🔧 NEW: Send Coinbase Wallet Actions as separate message
      await this.sendActionsMessage(conversationId, amount, currentData.fkeyId, coinbaseWalletUrl);

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
   * 🔧 UPDATED: Enhanced help message with new commands
   */
  private getHelpMessage(): string {
    return `🤖 **dStealth Agent Commands** 🥷

**🔧 Setup Commands:**
• \`/set yourUsername\` - Set your fkey.id (required)
• \`my fkey is yourUsername\` - Alternative way to set fkey.id

**💳 Payment Commands:**
• \`create payment link for $25\` - Generate anonymous payment link
• \`/balance\` - Check your earnings
• \`/links\` - Manage your payment links

**ℹ️ Info Commands:**
• \`/help\` - Show this help
• \`/status\` - Check agent status
• \`/fkey username\` - Look up someone's fkey.id

**📋 Group Chat Behavior:**
• I only respond to @mentions or payment requests
• DM me to set up your fkey.id privately
• Use @dstealth, @dstealth.eth, or @dstealth.base.eth

**🚀 Quick Start:**
1. Get FluidKey: ${this.FLUIDKEY_REFERRAL_URL}
2. Set fkey.id: \`/set yourUsername\`  
3. Complete setup: ${this.DSTEALTH_APP_URL}
4. Create payment links!

**Need help?** Just ask me anything about privacy payments!`;
  }

  /**
   * Get agent status message
   */
  private getStatusMessage(): string {
    if (!this.baseAgent) {
      return "❌ Agent not available";
    }

    const status = this.baseAgent.getStatus();

    return `📊 **Agent Status**

**Status**: ${status.isRunning ? "🟢 Active" : "🔴 Inactive"}
**Messages Processed**: ${this.processedMessageCount}
**Stream Restarts**: ${status.streamRestartCount}
**Installations**: ${status.installationCount}/5

**Core Features**: ✅ All operational
• FluidKey referral system
• fkey.id profile management with ZK proofs
• Payment link generation
• ZK receipt creation

**XMTP SDK**: v3.1.0+ with enhanced reliability
**Agent Address**: ${this.agentAddress}

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
   * 🔧 NEW: Handle Intent content type messages from Coinbase Wallet button interactions
   */
  private async handleIntentMessage(
    intent: IntentContent,
    senderInboxId: string,
  ): Promise<string> {
    try {
      const actionId = intent.actionId;
      const metadata = intent.metadata;

      console.log(`🎯 Handling intent action: ${actionId} with metadata:`, metadata);

      switch (actionId) {
        case 'show-actions':
          await this.sendActionsMenu(senderInboxId);
          return ""; // Empty string since we're sending actions

        case 'check-balance':
          return await this.handleBalanceCheck(senderInboxId);

        case 'create-payment-link':
          return `💳 **Create Payment Link**

To create a payment link, specify the amount:

**Examples:**
• "create payment link for $25"
• "create payment link for $100"
• "create payment link for $500"

**Note:** You'll need a fkey.id set up first. Type "/set yourUsername" if you haven't done this yet.

**Get FluidKey:** ${this.FLUIDKEY_REFERRAL_URL}`;

        case 'setup-fkey':
          return `🚀 **Set Up Your fkey.id**

**Step 1**: Get FluidKey (free privacy wallet)
${this.FLUIDKEY_REFERRAL_URL}

**Step 2**: Tell me your username
Example: "tantodefi.fkey.id" or "/set tantodefi"

**Step 3**: Complete setup
${this.DSTEALTH_APP_URL}

**Benefits:**
• 🥷 Anonymous payment links
• 🧾 ZK receipts for transactions
• 🎯 Privacy rewards & points`;

        case 'more-info':
          return this.getHelpMessage();

        case 'send-small':
          // Create payment link for $0.005
          const conversationId = await this.getConversationIdForUser(senderInboxId);
          if (conversationId) {
            return await this.handlePaymentRequest("0.005", senderInboxId, conversationId, false);
          }
          return `❌ **Error Creating Payment Link**

Could not find conversation to send payment link. Please try again.`;

        case 'send-large':
          // Create payment link for $1
          const conversationId2 = await this.getConversationIdForUser(senderInboxId);
          if (conversationId2) {
            return await this.handlePaymentRequest("1", senderInboxId, conversationId2, false);
          }
          return `❌ **Error Creating Payment Link**

Could not find conversation to send payment link. Please try again.`;

        case 'coinbase_wallet_payment':
          const amount = metadata?.amount as string;
          if (!amount) {
            return `❌ **Invalid Payment Amount**

Could not process your Coinbase Wallet payment. Please specify an amount.`;
          }
          
          // Get user data for payment processing
          const userData = await agentDb.getStealthDataByUser(senderInboxId);
          if (!userData || !userData.fkeyId) {
            return `🔒 **Setup Required**

Please set your fkey.id first to use payment features:
1. Get FluidKey: ${this.FLUIDKEY_REFERRAL_URL}
2. Set fkey.id: \`/set yourUsername\`
3. Complete setup: ${this.DSTEALTH_APP_URL}`;
          }

          // Generate Coinbase Wallet payment URL for the confirmed amount
          const coinbaseWalletUrl = this.generateCoinbaseWalletLink(userData.stealthAddress || userData.fkeyId, amount, "USDC");

          return `✅ **Coinbase Wallet Payment Link Ready**

**Amount**: $${amount} USDC
**Recipient**: ${userData.fkeyId}.fkey.id
**Payment URL**: ${coinbaseWalletUrl}

🔐 **Privacy Features:**
• Payment goes to your stealth address
• Anonymous sender protection
• ZK proof verification available

Click the link above to complete payment in Coinbase Wallet!`;

        case 'payment_link_help':
          return this.getHelpMessage();

        default:
          return `🤖 **Intent Action: ${actionId}**

I received your button interaction but this specific action isn't implemented yet.

**Available actions:**
• Payment link generation
• fkey.id setup
• Balance checking

Type "/help" to see available commands!`;
      }
    } catch (error) {
      console.error("Error handling intent message:", error);
      return `❌ **Error Handling Intent**

An error occurred while processing your button interaction. Please try again or use text commands.`;
    }
  }

  /**
   * 🔧 FIXED: Send a message to a conversation via XMTP
   */
  private async sendMessage(conversationId: string, content: string): Promise<void> {
    try {
      if (!this.baseAgent) {
        throw new Error("Base agent not available");
      }
      
      console.log(`📤 Sending message to conversation ${conversationId.slice(0, 8)}...`);
      await this.baseAgent.sendMessage(conversationId, content);
      console.log("✅ Message sent successfully");
    } catch (error) {
      console.error("❌ Failed to send message:", error);
      throw error;
    }
  }

  /**
   * 🔧 COMPLETED: Send Coinbase Wallet Actions content type
   */
  private async sendActionsMessage(
    conversationId: string, 
    amount: string, 
    fkeyId: string, 
    coinbaseWalletUrl: string
  ): Promise<void> {
    try {
      if (!this.baseAgent) {
        console.log("⚠️ Base agent not available, skipping Actions message");
        return;
      }

      const client = this.baseAgent.getClient();
      const conversation = await client.conversations.getConversationById(conversationId);
      
      if (!conversation) {
        console.log("⚠️ Conversation not found, skipping Actions message");
        return;
      }

      console.log(`🎯 Sending Coinbase Wallet Actions message for $${amount} to ${fkeyId}`);

      // Create proper Actions content for Coinbase Wallet
      const actionsContent: ActionsContent = {
        id: `payment_actions_${Date.now()}`,
        description: `💳 Interactive Payment Options for $${amount} USDC`,
        actions: [
          {
            id: "coinbase_wallet_payment",
            label: `💼 Pay $${amount} via Coinbase Wallet`,
            style: "primary"
          },
          {
            id: "payment_link_help", 
            label: "❓ How do payment links work?",
            style: "secondary"
          },
          {
            id: "setup_fkey",
            label: "🔧 Set up your own fkey.id",
            style: "secondary"
          }
        ],
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      };

      try {
        // Use proper Node SDK content type pattern (bypass type checking)
        await (conversation as any).send(actionsContent, ContentTypeActions);
        console.log("✅ Coinbase Wallet Actions sent (proper content type)");
      } catch (actionsError) {
        console.error("⚠️ Failed to send Actions content type:", actionsError);
        
        // Fallback to formatted text if content type fails
        const actionsText = `💳 **Interactive Payment Options for $${amount} USDC**

**Recipient**: ${fkeyId}.fkey.id

🔗 **Coinbase Wallet Payment**: 
${coinbaseWalletUrl}

**Quick Actions:**
[💼] Pay $${amount} via Coinbase Wallet
[❓] How do payment links work?
[🔧] Set up your own fkey.id

**Alternative Links:**
• Coinbase Wallet: ${coinbaseWalletUrl}
• Complete Setup: ${this.DSTEALTH_APP_URL}
• Get FluidKey: ${this.FLUIDKEY_REFERRAL_URL}`;

        await conversation.send(actionsText);
        console.log("✅ Actions sent as formatted text (fallback)");
      }

    } catch (error) {
      console.error("❌ Failed to send Coinbase Wallet Actions:", error);
      
      // Fallback to regular markdown link if Actions fail
      try {
        const fallbackMessage = `💼 **Alternative Payment Method**

[💳 Pay $${amount} via Coinbase Wallet](${coinbaseWalletUrl})

Click the link above to complete payment in Coinbase Wallet!`;
        
        await this.sendMessage(conversationId, fallbackMessage);
        console.log("✅ Sent fallback Coinbase Wallet link");
      } catch (fallbackError) {
        console.error("❌ Failed to send fallback message:", fallbackError);
      }
    }
  }

  /**
   * Send help actions message (following TBA pattern)
   */
  private async sendHelpActionsMessage(senderInboxId: string): Promise<void> {
    try {
      if (!this.baseAgent) {
        console.log("⚠️ Base agent not available, skipping Help Actions message");
        return;
      }

      // Get user's conversations to send actions to
      const client = this.baseAgent.getClient();
      const conversations = await client.conversations.list();
      
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

      const actionsContent: ActionsContent = {
        id: `help-${Date.now()}`,
        description: "👋 Welcome to dStealth! Here are some actions you can take:",
        actions: [
          {
            id: "show-actions",
            label: "🚀 Show me actions",
            style: "primary",
          },
          {
            id: "check-balance",
            label: "💰 Check balance",
            style: "primary",
          },
          {
            id: "create-payment-link",
            label: "💳 Create payment link",
            style: "primary",
          },
          {
            id: "setup-fkey",
            label: "🔧 Set up fkey.id",
            style: "secondary",
          },
          {
            id: "more-info",
            label: "ℹ️ More info",
            style: "secondary",
          }
        ]
      };

      try {
        await (userConversation as any).send(actionsContent, ContentTypeActions);
        console.log("✅ Help Actions sent (proper content type)");
      } catch (actionsError) {
        console.error("⚠️ Failed to send Help Actions content type:", actionsError);
        
        // Fallback to formatted text
        const fallbackText = `👋 **Welcome to dStealth!** 🥷

Choose an action:
• 🚀 Show me actions (type "/actions")
• 💰 Check balance (type "/balance")
• 💳 Create payment link (type "create payment link for $X")
• 🔧 Set up fkey.id (type "/set username")
• ℹ️ More info (type "/help")

**Quick Start:** Get FluidKey at ${this.FLUIDKEY_REFERRAL_URL}
**Complete Setup:** ${this.DSTEALTH_APP_URL}`;

        await userConversation.send(fallbackText);
        console.log("✅ Help Actions sent as formatted text (fallback)");
      }
    } catch (error) {
      console.error("❌ Failed to send Help Actions:", error);
    }
  }

  /**
   * Send actions menu (following TBA pattern)
   */
  private async sendActionsMenu(senderInboxId: string): Promise<void> {
    try {
      if (!this.baseAgent) {
        console.log("⚠️ Base agent not available, skipping Actions Menu");
        return;
      }

      // Get user's conversations to send actions to
      const client = this.baseAgent.getClient();
      const conversations = await client.conversations.list();
      
      // Find the conversation with this user
      const userConversation = conversations.find(conv => {
        // For DMs, check if this is a 1:1 conversation with the user
        if (!(conv instanceof Group)) {
          return conv.peerInboxId === senderInboxId;
        }
        return false;
      });

      if (!userConversation) {
        console.log("⚠️ User conversation not found, skipping Actions Menu");
        return;
      }

      const actionsContent: ActionsContent = {
        id: `actions-${Date.now()}`,
        description: "Choose an action:",
        actions: [
          {
            id: "send-small",
            label: "Send 0.005 USDC",
            style: "primary",
          },
          {
            id: "send-large", 
            label: "Send 1 USDC",
            style: "primary",
          },
          {
            id: "check-balance",
            label: "💰 Check balance",
            style: "primary",
          },
          {
            id: "create-payment-link",
            label: "💳 Create payment link",
            style: "secondary",
          },
          {
            id: "setup-fkey",
            label: "🔧 Set up fkey.id",
            style: "secondary",
          }
        ]
      };

      try {
        await (userConversation as any).send(actionsContent, ContentTypeActions);
        console.log("✅ Actions Menu sent (proper content type)");
      } catch (actionsError) {
        console.error("⚠️ Failed to send Actions Menu content type:", actionsError);
        
        // Fallback to formatted text
        const fallbackText = `**Choose an action:**

• Send 0.005 USDC (type "create payment link for $0.005")
• Send 1 USDC (type "create payment link for $1")
• 💰 Check balance (type "/balance")
• 💳 Create payment link (type "create payment link for $X")
• 🔧 Set up fkey.id (type "/set username")

**Need help?** Type "/help" for more options!
**Complete Setup:** ${this.DSTEALTH_APP_URL}`;

        await userConversation.send(fallbackText);
        console.log("✅ Actions Menu sent as formatted text (fallback)");
      }
    } catch (error) {
      console.error("❌ Failed to send Actions Menu:", error);
    }
  }

  /**
   * Get conversation ID for a specific user
   */
  private async getConversationIdForUser(senderInboxId: string): Promise<string | null> {
    try {
      if (!this.baseAgent) {
        console.log("⚠️ Base agent not available");
        return null;
      }

      const client = this.baseAgent.getClient();
      const conversations = await client.conversations.list();
      
      // Find the conversation with this user
      const userConversation = conversations.find(conv => {
        // For DMs, check if this is a 1:1 conversation with the user
        if (!(conv instanceof Group)) {
          return conv.peerInboxId === senderInboxId;
        }
        return false;
      });

      if (!userConversation) {
        console.log("⚠️ User conversation not found");
        return null;
      }

      return userConversation.id;
    } catch (error) {
      console.error("❌ Failed to get conversation ID for user:", error);
      return null;
    }
  }

  /**
   * Get agent contact information
   */
  getContactInfo(): { inboxId: string; address: string } {
    if (!this.baseAgent) {
      throw new Error("Agent not initialized");
    }

    return {
      inboxId: this.baseAgent.getClient().inboxId,
      address: this.agentAddress || "unknown",
    };
  }

  /**
   * Get agent status
   */
  getStatus(): DStealthAgentStatus {
    if (!this.baseAgent) {
      return {
        isRunning: false,
        streamRestartCount: 0,
        processedMessageCount: this.processedMessageCount,
        installationCount: 0,
        lastError: this.lastError || "Agent not initialized",
      };
    }

    const baseStatus = this.baseAgent.getStatus();
    return {
      isRunning: baseStatus.isRunning,
      streamRestartCount: baseStatus.streamRestartCount,
      processedMessageCount: this.processedMessageCount,
      installationCount: baseStatus.installationCount,
      lastError: this.lastError || undefined,
    };
  }

  /**
   * Get XMTP client
   */
  getClient() {
    if (!this.baseAgent) {
      throw new Error("Agent not initialized");
    }
    return this.baseAgent.getClient();
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    console.log("🛑 Shutting down Production dStealth Agent...");

    if (this.baseAgent) {
      await this.baseAgent.shutdown();
    }

    console.log("✅ Production dStealth Agent shutdown complete");
  }
}
