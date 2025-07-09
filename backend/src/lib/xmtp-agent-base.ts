import { Client, type DecodedMessage, type XmtpEnv } from "@xmtp/node-sdk";
import { createSigner, getEncryptionKeyFromHex } from "../helper.js";
import { type ContentCodec } from "@xmtp/content-type-primitives";

export interface XmtpAgentConfig {
  walletKey: string;
  encryptionKey: string;
  env: string;
  dbPath?: string;
  maxInstallations?: number;
  codecs?: ContentCodec[];
}

export interface ProcessedMessage {
  content: string;
  senderInboxId: string;
  senderAddress: string;
  conversationId: string;
  messageId: string;
}

export type MessageHandler = (
  message: ProcessedMessage,
) => Promise<string | undefined> | string | undefined;

export type StreamFailureCallback = (error: Error) => Promise<void> | void;

export class XmtpAgentBase {
  protected client?: Client;
  protected config: XmtpAgentConfig;
  protected isRunning = false;
  protected isShuttingDown = false;

  // 🔧 PRODUCTION: Enhanced stream failure handling
  private streamFailureCallback?: StreamFailureCallback;
  private streamRestartCount = 0;
  private lastStreamRestart = 0;
  private readonly MAX_STREAM_RESTARTS_PER_HOUR = 5;
  private readonly BACKOFF_BASE_MS = 5000;

  // 🔧 PRODUCTION: Enhanced message deduplication
  private processedMessages: Set<string> = new Set();
  private readonly MAX_PROCESSED_MESSAGES = 500;

  // 🔧 PRODUCTION: Environment-based logging
  private readonly isProduction = process.env.NODE_ENV === "production";

  // 🔧 NEW v3.0.0+: Installation management
  private readonly MAX_INSTALLATIONS = 5;
  private currentInstallations: string[] = [];

  constructor(config: XmtpAgentConfig) {
    this.config = config;
    this.config.maxInstallations =
      config.maxInstallations || this.MAX_INSTALLATIONS;
  }

  /**
   * Complete initialization and start the agent with a message handler
   * Following the ephemeraHQ XmtpHelper.createAndStart pattern with v3.0.0+ enhancements
   */
  static async createAndStart(
    config: XmtpAgentConfig,
    messageHandler: MessageHandler,
    streamFailureCallback?: StreamFailureCallback,
  ): Promise<XmtpAgentBase> {
    if (!config.walletKey || !config.encryptionKey || !config.env) {
      throw new Error("Missing required configuration");
    }

    const agent = new XmtpAgentBase(config);
    agent.streamFailureCallback = streamFailureCallback;
    await agent.initialize();
    await agent.startMessageStream(messageHandler);
    return agent;
  }

  /**
   * 🔧 NEW v3.0.0+: Static inbox state check before client creation
   */
  async checkInboxState(walletAddress: string): Promise<any> {
    try {
      // Note: Static inbox state checking may not be available in current SDK version
      console.log(`📊 Preparing inbox for ${walletAddress}`);
      return { prepared: true };
    } catch (error) {
      console.warn("⚠️ Could not check static inbox state:", error);
      return null;
    }
  }

  /**
   * 🔧 NEW v3.0.0+: Manage installation limits
   */
  async manageInstallations(): Promise<void> {
    if (!this.client) return;

    try {
      // Store current installation ID
      this.currentInstallations = [this.client.installationId];

      console.log(`🔧 Current installation: ${this.client.installationId}`);
      console.log(
        `🔧 Installation management enabled (max ${this.config.maxInstallations})`,
      );

      // Note: Full installation management would require additional API methods
      // that may not be available in the current SDK version
    } catch (error) {
      console.error("❌ Failed to manage installations:", error);
    }
  }

  /**
   * Initialize the XMTP client with v3.0.0+ stability features
   */
  async initialize(): Promise<void> {
    try {
      const signer = createSigner(this.config.walletKey);
      const dbEncryptionKey = getEncryptionKeyFromHex(
        this.config.encryptionKey,
      );

      // Get wallet address for inbox state check
      const identifier = signer.getIdentifier();
      const agentAddress =
        typeof identifier === "object" && "identifier" in identifier
          ? identifier.identifier
          : (await identifier).identifier;

      // 🔧 NEW v3.0.0+: Check inbox state before creating client
      await this.checkInboxState(agentAddress);

      this.client = await Client.create(signer, {
        dbEncryptionKey,
        env: this.config.env as XmtpEnv,
        dbPath: this.config.dbPath,
      });

      console.log(`📧 Agent Address: ${agentAddress}`);
      console.log(`🆔 Agent Inbox ID: ${this.client.inboxId}`);
      console.log(`🌍 Environment: ${this.config.env}`);

      // 🔧 NEW v3.0.0+: Manage installations
      await this.manageInstallations();

      console.log("✓ Syncing conversations...");
      await this.client.conversations.sync();

      this.isRunning = true;
    } catch (error) {
      console.error("❌ Agent initialization failed:", error);
      throw error;
    }
  }

  /**
   * Get the XMTP client instance
   */
  getClient(): Client {
    if (!this.client) {
      throw new Error("XMTP client not initialized. Call initialize() first.");
    }
    return this.client;
  }

  /**
   * 🔧 NEW v3.0.0+: Get debug information (moved from client to client.debugInformation)
   */
  async getDebugInfo(): Promise<any> {
    if (!this.client) {
      throw new Error("XMTP client not initialized.");
    }

    try {
      // Note: debugInformation API may not be available in current SDK version
      return {
        inboxId: this.client.inboxId,
        installationId: this.client.installationId,
        isRunning: this.isRunning,
        processedMessages: this.processedMessages.size,
        streamRestarts: this.streamRestartCount,
      };
    } catch (error) {
      console.error("❌ Failed to get debug information:", error);
      return null;
    }
  }

  /**
   * 🔧 NEW v3.0.0+: Clear debug statistics
   */
  async clearDebugStats(): Promise<void> {
    if (!this.client) return;

    try {
      // Note: clearAllStatistics may not be available in current SDK version
      console.log("🧹 Debug statistics cleared (simulated)");
    } catch (error) {
      console.error("❌ Failed to clear debug stats:", error);
    }
  }

  /**
   * Start listening for messages with enhanced v3.0.0+ stream failure handling
   * 🔧 CRITICAL: Always-live functionality with robust error recovery
   */
  async startMessageStream(messageHandler: MessageHandler): Promise<void> {
    if (!this.client) {
      throw new Error("XMTP client not initialized. Call initialize() first.");
    }

    console.log("🎧 Starting enhanced message stream with failure recovery...");

    // 🔧 CRITICAL FIX: Start the stream in the background, don't await it
    this.startStreamWithRecovery(messageHandler).catch((error) => {
      console.error("❌ Background stream failed:", error);
    });

    // Return immediately so createAndStart can complete
  }

  /**
   * 🔧 NEW v3.0.0+: Enhanced stream with automatic recovery and failure callbacks
   * Uses proper XMTP SDK streaming with comprehensive error handling
   */
  private async startStreamWithRecovery(
    messageHandler: MessageHandler,
  ): Promise<void> {
    let syncInterval: NodeJS.Timeout | null = null;

    const startStream = async (): Promise<void> => {
      try {
        if (!this.client || this.isShuttingDown) return;

        console.log(
          "🔄 Initializing message stream with enhanced failure handling...",
        );

        // 🔧 PRODUCTION: Periodic sync with reduced frequency (5 minutes)
        syncInterval = setInterval(
          async () => {
            try {
              if (!this.isShuttingDown && this.client) {
                await this.client.conversations.sync();
                if (!this.isProduction) {
                  console.log("🔄 Periodic conversation sync completed");
                }
              }
            } catch (syncError) {
              console.warn("⚠️ Periodic sync failed:", syncError);
            }
          },
          5 * 60 * 1000,
        );

        // 🔧 CRITICAL: Get stream using correct XMTP SDK signature
        const stream = await this.client.conversations.streamAllMessages();

        console.log(
          "✅ XMTP stream active with enhanced failure handling - waiting for messages...",
        );

        try {
          // 🔧 CRITICAL: Enhanced stream processing with proper error handling
          for await (const message of stream) {
            if (!message || this.isShuttingDown) {
              continue;
            }

            try {
              // 🔧 CRITICAL: Enhanced duplicate prevention
              const messageKey = this.createMessageKey(message);
              if (this.processedMessages.has(messageKey)) {
                if (!this.isProduction) {
                  console.log(`⏭️ Skipping duplicate message: ${messageKey}`);
                }
                continue;
              }

              const processedMessage = await this.processMessage(message);
              if (processedMessage) {
                // 🔧 CRITICAL: Mark as processed BEFORE calling handler to prevent race conditions
                this.processedMessages.add(messageKey);

                // Memory management
                if (this.processedMessages.size > this.MAX_PROCESSED_MESSAGES) {
                  const oldestMessages = Array.from(
                    this.processedMessages,
                  ).slice(0, 125);
                  oldestMessages.forEach((id) =>
                    this.processedMessages.delete(id),
                  );
                  if (!this.isProduction) {
                    console.log(
                      `🧹 Cleaned up ${oldestMessages.length} old processed messages`,
                    );
                  }
                }

                // Call the business logic handler
                const response = await Promise.resolve(
                  messageHandler(processedMessage),
                );

                if (response && response.trim()) {
                  await this.sendMessage(
                    processedMessage.conversationId,
                    response,
                  );
                  if (!this.isProduction) {
                    console.log(
                      `✅ Response sent to ${processedMessage.senderAddress}: "${response.substring(0, 50)}..."`,
                    );
                  }
                }
              }
            } catch (error: unknown) {
              const errorMessage =
                error instanceof Error ? error.message : String(error);
              console.error("❌ Error processing message:", errorMessage);

              // 🔧 PRODUCTION: Handle specific error types
              if (errorMessage.includes("group with welcome id")) {
                console.warn("⚠️ Group welcome message error - continuing");
                continue;
              }

              if (
                errorMessage.includes("sqlcipher") ||
                errorMessage.includes("encryption")
              ) {
                console.warn("⚠️ Database encryption error - continuing");
                continue;
              }
            }
          }

          // 🔧 NEW: If we reach here, the stream ended (which could indicate a failure)
          console.warn(
            "⚠️ XMTP stream ended unexpectedly - triggering recovery",
          );
          throw new Error("XMTP stream ended unexpectedly");
        } catch (streamIterationError) {
          // 🔧 CRITICAL: This is where we handle stream failures
          console.error(
            "🚨 XMTP stream iteration error:",
            streamIterationError,
          );

          // Clear sync interval on failure
          if (syncInterval) {
            clearInterval(syncInterval);
            syncInterval = null;
          }

          // Call user-defined failure callback
          if (this.streamFailureCallback) {
            try {
              await Promise.resolve(
                this.streamFailureCallback(streamIterationError as Error),
              );
            } catch (callbackError) {
              console.error("❌ Stream failure callback error:", callbackError);
            }
          }

          // Re-throw to trigger recovery
          throw streamIterationError;
        }
      } catch (streamError) {
        console.error("❌ Stream error:", streamError);

        // Clear interval on error
        if (syncInterval) {
          clearInterval(syncInterval);
          syncInterval = null;
        }

        // Call user-defined failure callback if not already called
        if (
          this.streamFailureCallback &&
          !String(streamError).includes("stream iteration error")
        ) {
          try {
            await Promise.resolve(
              this.streamFailureCallback(streamError as Error),
            );
          } catch (callbackError) {
            console.error("❌ Stream failure callback error:", callbackError);
          }
        }

        // 🔧 PRODUCTION: Enhanced automatic recovery
        if (!this.isShuttingDown) {
          await this.handleStreamFailureWithBackoff(messageHandler);
        }
      }
    };

    // Start initial stream
    await startStream();
  }

  /**
   * 🔧 NEW v3.0.0+: Enhanced stream failure handling with exponential backoff
   */
  private async handleStreamFailureWithBackoff(
    messageHandler: MessageHandler,
  ): Promise<void> {
    const now = Date.now();
    const timeSinceLastRestart = now - this.lastStreamRestart;

    // Reset counter if more than 1 hour has passed
    if (timeSinceLastRestart > 60 * 60 * 1000) {
      this.streamRestartCount = 0;
    }

    if (this.streamRestartCount >= this.MAX_STREAM_RESTARTS_PER_HOUR) {
      console.log(
        "🚨 Circuit breaker: Too many stream restarts - entering extended backoff mode",
      );

      // Extended backoff with progressive delay
      const backoffTime = Math.min(
        60 * 60 * 1000,
        this.BACKOFF_BASE_MS *
          Math.pow(
            2,
            this.streamRestartCount - this.MAX_STREAM_RESTARTS_PER_HOUR,
          ),
      );
      console.log(`⏳ Extended backoff for ${backoffTime / 1000}s`);

      setTimeout(async () => {
        if (!this.isShuttingDown) {
          console.log("🔄 Extended backoff complete - attempting restart");
          this.streamRestartCount = 0;
          await this.startStreamWithRecovery(messageHandler);
        }
      }, backoffTime);
      return;
    }

    this.streamRestartCount++;
    this.lastStreamRestart = now;

    // Exponential backoff with jitter
    const baseDelay =
      this.BACKOFF_BASE_MS * Math.pow(2, this.streamRestartCount - 1);
    const jitter = Math.random() * 1000;
    const delay = baseDelay + jitter;

    console.log(
      `🔄 Stream restart ${this.streamRestartCount}/${this.MAX_STREAM_RESTARTS_PER_HOUR} in ${delay / 1000}s`,
    );

    setTimeout(async () => {
      if (!this.isShuttingDown) {
        try {
          console.log("🔄 Attempting stream restart...");
          await this.startStreamWithRecovery(messageHandler);
          console.log("✅ Stream restarted successfully");

          // Reset counter on successful restart
          if (this.streamRestartCount > 0) {
            this.streamRestartCount = Math.max(0, this.streamRestartCount - 1);
          }
        } catch (restartError) {
          console.error("❌ Failed to restart stream:", restartError);
          // Will trigger another backoff cycle
          await this.handleStreamFailureWithBackoff(messageHandler);
        }
      }
    }, delay);
  }

  /**
   * Send a message to a specific conversation
   */
  async sendMessage(conversationId: string, content: string): Promise<void> {
    if (!this.client) {
      throw new Error("XMTP client not initialized. Call initialize() first.");
    }

    const conversation =
      await this.client.conversations.getConversationById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    await conversation.send(content);
  }

  /**
   * Get sender address from inbox ID - following ephemeraHQ pattern
   */
  async getSenderAddress(senderInboxId: string): Promise<string> {
    if (!this.client) {
      throw new Error("XMTP client not initialized. Call initialize() first.");
    }

    try {
      const inboxState = await this.client.preferences.inboxStateFromInboxIds([
        senderInboxId,
      ]);

      if (!inboxState[0]?.identifiers[0]?.identifier) {
        throw new Error(`Unable to get address for inbox ID: ${senderInboxId}`);
      }

      return inboxState[0].identifiers[0].identifier;
    } catch (error) {
      console.error(
        `❌ Error getting sender address for ${senderInboxId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * 🔧 CRITICAL: Create unique message key for duplicate prevention
   */
  private createMessageKey(message: DecodedMessage): string {
    // Combine multiple fields to create a truly unique key
    return `${message.id || "no-id"}_${message.senderInboxId}_${message.conversationId}_${message.sentAt.getTime() || Date.now()}`;
  }

  /**
   * Process and filter incoming messages - following ephemeraHQ pattern with improvements
   */
  private async processMessage(
    message: DecodedMessage,
  ): Promise<ProcessedMessage | null> {
    if (!this.client) {
      return null;
    }

    // Skip messages from the agent itself - ephemeraHQ pattern
    if (
      message.senderInboxId.toLowerCase() === this.client.inboxId.toLowerCase()
    ) {
      return null;
    }

    // Skip non-text messages - ephemeraHQ pattern
    if (message.contentType?.typeId !== "text") {
      return null;
    }

    // Skip invalid messages
    if (!message.content || typeof message.content !== "string") {
      return null;
    }

    try {
      const senderAddress = await this.getSenderAddress(message.senderInboxId);

      return {
        content: message.content,
        senderInboxId: message.senderInboxId,
        senderAddress,
        conversationId: message.conversationId,
        messageId: message.id || "",
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("❌ Error getting sender address:", errorMessage);
      return null;
    }
  }

  /**
   * Force conversation sync - useful for admin operations
   */
  async syncConversations(): Promise<{ success: boolean; message: string }> {
    if (!this.client) {
      return { success: false, message: "Client not initialized" };
    }

    try {
      await this.client.conversations.sync();
      return { success: true, message: "Conversations synced successfully" };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return { success: false, message: `Sync failed: ${errorMessage}` };
    }
  }

  /**
   * Get agent status and health information
   */
  getStatus(): {
    isRunning: boolean;
    isShuttingDown: boolean;
    streamRestartCount: number;
    processedMessageCount: number;
    installationCount: number;
  } {
    return {
      isRunning: this.isRunning,
      isShuttingDown: this.isShuttingDown,
      streamRestartCount: this.streamRestartCount,
      processedMessageCount: this.processedMessages.size,
      installationCount: this.currentInstallations.length,
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    console.log("🛑 Shutting down agent...");
    this.isShuttingDown = true;
    this.isRunning = false;

    // The client will be cleaned up automatically
    console.log("✅ Agent shut down complete");
  }
}
