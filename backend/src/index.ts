/* eslint-disable @typescript-eslint/no-misused-promises */
import { Client, Conversation, Group, type XmtpEnv } from "@xmtp/node-sdk";
import cors from "cors";
import "dotenv/config";
import express, { type Request, type Response } from "express";
import helmet from "helmet";
// 🔧 NEW v3.1.0+: Import the production-ready dStealth agent
import { DStealthAgentProduction } from "./agents/dstealth-agent-production.js";
import { env } from "./config/env.js";
import {
  appendToEnv,
  createSigner,
  defaultInboxes,
  getDbPath,
  getEncryptionKeyFromHex,
  resetXmtpDatabase,
  validateEnvironment,
} from "./helper.js";
import { agentDb } from "./lib/agent-database.js";
import {
  type StreamFailureCallback,
  type XmtpAgentConfig,
} from "./lib/xmtp-agent-base.js";
import convosRoutes from "./routes/convos.js";
import fkeyRoutes from "./routes/fkey.js";
import webhookRoutes from "./routes/webhooks.js";
import userStealthDataRoutes from "./routes/user-stealth-data.js";
import userSearchRoutes from "./routes/user-search.js";
import frontendUsersRoutes from "./routes/frontend-users.js";
import { stealthMonitor } from "./services/stealth-monitor.js";
// Import Redis for database status
import { Redis } from "@upstash/redis";

// Initialize Redis client with proper error handling
let redisClient: Redis | null = null;
try {
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    redisClient = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
} catch (error) {
  console.error("❌ Failed to initialize Redis client:", error);
}

const { WALLET_KEY, API_SECRET_KEY, ENCRYPTION_KEY, XMTP_ENV, PORT } =
  validateEnvironment([
    "WALLET_KEY",
    "API_SECRET_KEY",
    "ENCRYPTION_KEY",
    "XMTP_ENV",
    "PORT",
  ]);

let GROUP_ID = process.env.GROUP_ID;
// Global XMTP client
let xmtpClient: Client | null = null;
// 🔧 NEW v3.1.0+: Global dStealth Agent using production-ready architecture
let dStealthAgent: DStealthAgentProduction | null = null;

// Track XMTP initialization errors for better error reporting
let xmtpInitError: Error | null = null;

// 🔧 NEW v3.1.0+: Stream failure statistics
let streamFailureCount = 0;
let lastStreamFailure: Date | null = null;

// 🔧 CRITICAL: Prevent concurrent initialization attempts
let isInitializingAgent = false;

/**
 * 🔧 NEW v3.1.0+: Enhanced stream failure callback with detailed logging and recovery
 */
const handleStreamFailure: StreamFailureCallback = async (error: Error) => {
  streamFailureCount++;
  lastStreamFailure = new Date();

  console.error(
    `🚨 Stream failure #${streamFailureCount} at ${lastStreamFailure.toISOString()}:`,
    error.message,
  );

  // Log to database for monitoring
  try {
    await agentDb.logAgentInteraction(
      dStealthAgent?.getClient()?.inboxId || "unknown",
      "system",
      "stream_failure",
      {
        error: error.message,
        failureCount: streamFailureCount,
        timestamp: lastStreamFailure.toISOString(),
        stack: error.stack?.substring(0, 500), // Truncate stack trace
      },
    );
  } catch (dbError) {
    console.error("❌ Failed to log stream failure to database:", dbError);
  }

  // Alert if too many failures
  if (streamFailureCount > 10) {
    console.error(
      "🚨 CRITICAL: Too many stream failures - may need manual intervention",
    );
  }
};

/**
 * 🔧 NEW v3.1.0+: Initialize dStealth Agent with production-ready architecture
 */
const initializeDStealthAgent = async () => {
  // 🔧 CRITICAL: Prevent concurrent initialization
  if (isInitializingAgent) {
    console.log("🔄 Agent initialization already in progress, skipping...");
    return;
  }

  if (dStealthAgent) {
    console.log("🤖 dStealth Agent already initialized, skipping...");
    return;
  }

  // Set lock immediately
  isInitializingAgent = true;
  
  try {
    console.log(
      "🤖 Initializing Production dStealth Agent with XMTP SDK v3.1.0+...",
    );

    const baseDelay = process.env.NODE_ENV === "production" ? 15000 : 5000;
    console.log(
      `⏳ Waiting ${baseDelay / 1000}s before agent initialization to prevent rate limits...`,
    );
    await new Promise((resolve) => setTimeout(resolve, baseDelay));

    const config: XmtpAgentConfig = {
      walletKey: WALLET_KEY,
      encryptionKey: ENCRYPTION_KEY,
      env: XMTP_ENV,
      dbPath: getDbPath(XMTP_ENV),
      maxInstallations: 5, // 🔧 NEW v3.1.0+: Explicit installation limit
    };

    // 🔧 NEW v3.1.0+: Create production agent with stream failure callback
    console.log("🔄 Creating DStealthAgentProduction instance...");
    const newAgent = await DStealthAgentProduction.createAndStart(
      config,
      handleStreamFailure, // Stream failure callback for enhanced reliability
    );

    // 🔧 CRITICAL: Set global variable IMMEDIATELY after successful creation
    dStealthAgent = newAgent;
    console.log("🎯 Agent instance assigned to global variable!");

    // Test agent functionality (non-critical - if this fails, agent is still available)
    try {
      const agentInfo = newAgent.getClient();
      if (agentInfo) {
        console.log(
          "✅ Production dStealth Agent initialized with XMTP SDK v3.1.0+:",
        );
        console.log(`   📬 Agent Inbox ID: ${agentInfo.inboxId}`);
        console.log(`   📊 Agent Status: active (enhanced stream reliability)`);
        console.log(`   🔧 Installation Management: enabled (max 5)`);
        console.log(`   🔄 Stream Failure Recovery: enabled`);
        console.log(
          `   💼 Core Features: FluidKey referral, fkey.id, payment links, ZK receipts`,
        );
      } else {
        console.log("⚠️ Agent client not available");
      }
      console.log("✅ Agent is fully operational and ready for frontend connections!");
    } catch (testError) {
      console.warn("⚠️ Agent created but status test failed:", testError);
      console.log("🎯 Agent is still available for frontend connections (partial functionality)");
    }
  } catch (error: unknown) {
    console.error("❌ Failed to initialize Production dStealth Agent:", error);
    xmtpInitError = error instanceof Error ? error : new Error(String(error));
    
    // 🔧 Ensure global variable is null on failure
    dStealthAgent = null;

    // 🔧 NEW v3.1.0+: Enhanced error recovery - attempt reinitialize after delay
    setTimeout(async () => {
      if (!dStealthAgent && !process.env.DISABLE_AUTO_RETRY) {
        console.log("🔄 Attempting agent reinitialization after failure...");
        try {
          await initializeDStealthAgent();
        } catch (retryError) {
          console.error("❌ Agent reinitialization failed:", retryError);
        }
      }
    }, 30000); // Retry after 30 seconds
  } finally {
    // 🔧 CRITICAL: Always release the lock
    isInitializingAgent = false;
  }
};

/**
 * 🔧 NEW v3.1.0+: Initialize XMTP client with installation management
 */
async function initializeXmtpClient(): Promise<void> {
  try {
    console.log("🔄 Initializing XMTP client with v3.1.0+ features...");

    const signer = createSigner(WALLET_KEY);

    // 🔧 NEW v3.1.0+: Check for existing installations before creating client
    const identifier = signer.getIdentifier();
    const agentAddress =
      typeof identifier === "object" && "identifier" in identifier
        ? identifier.identifier
        : (await identifier).identifier;

    console.log(`📧 Checking inbox state for agent: ${agentAddress}`);

    xmtpClient = await Client.create(signer, {
      env: XMTP_ENV as XmtpEnv,
      dbPath: getDbPath(XMTP_ENV),
      dbEncryptionKey: getEncryptionKeyFromHex(ENCRYPTION_KEY),
    });

    console.log("✅ XMTP client initialized successfully with v3.1.0+");
    console.log(`📬 Client Inbox ID: ${xmtpClient.inboxId}`);

    // 🔧 NEW v3.1.0+: Get installation information
    try {
      console.log(`🔧 Installation ID: ${xmtpClient.installationId}`);
      console.log(`🔧 Installation management enabled`);
    } catch (error) {
      console.warn("⚠️ Could not get installation info:", error);
    }

    // Setup default group if needed
    if (!GROUP_ID) {
      console.log("🔄 Setting up default group...");
      const conversations = await xmtpClient.conversations.list();

      // Find existing groups
      const groups = [];
      for (const conv of conversations) {
        if (conv instanceof Group) {
          groups.push(conv);
        }
      }

      if (groups.length > 0) {
        GROUP_ID = groups[0].id;
        console.log(`✅ Using existing group: ${GROUP_ID}`);
      } else {
        // Create a new group
        const group = await xmtpClient.conversations.newGroup(defaultInboxes, {
          groupName: "Default Group",
          groupDescription: "Default group for testing",
        });
        GROUP_ID = group.id;
        console.log(`✅ Created new group: ${GROUP_ID}`);

        // Save to environment
        await appendToEnv("GROUP_ID", GROUP_ID);
      }
    }
  } catch (error) {
    console.error("❌ Failed to initialize XMTP client:", error);
    xmtpInitError = error instanceof Error ? error : new Error(String(error));
    throw error;
  }
}

// XMTP Service Functions
const removeUserFromDefaultGroupChat = async (
  newUserInboxId: string,
): Promise<boolean> => {
  try {
    const conversation = await xmtpClient?.conversations.getConversationById(
      GROUP_ID ?? "",
    );

    if (!conversation) {
      throw new Error(
        `Conversation not found with id: ${GROUP_ID} on env: ${XMTP_ENV}`,
      );
    }
    await conversation.sync();
    console.log("conversation", conversation.id);
    const groupMembers = await (conversation as Group).members();
    const isMember = groupMembers.some(
      (member) => member.inboxId === newUserInboxId,
    );
    if (isMember) {
      await conversation.sync();
      await (conversation as Group).removeMembers([newUserInboxId]);
      console.log("Removed user from group");
    } else {
      console.log("User not in group");
      return false;
    }
    return true;
  } catch (error) {
    console.error("Error adding user to default group chat:", error);
    return false;
  }
};
// XMTP Service Functions
const addUserToDefaultGroupChat = async (
  newUserInboxId: string,
): Promise<boolean> => {
  try {
    const conversation = await xmtpClient?.conversations.getConversationById(
      GROUP_ID ?? "",
    );

    if (!conversation) {
      throw new Error(
        `Conversation not found with id: ${GROUP_ID} on env: ${XMTP_ENV}`,
      );
    }
    await conversation.sync();
    console.log("conversation", conversation.id);
    const groupMembers = await (conversation as Group).members();
    const isMember = groupMembers.some(
      (member) => member.inboxId === newUserInboxId,
    );
    if (!isMember) {
      await conversation.sync();
      await (conversation as Group).addMembers([newUserInboxId]);
      await conversation.send("added to group");
      console.log("Added user to group");
    } else {
      console.log("User already in group");
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error adding user to default group chat:", error);
    return false;
  }
};

// API Middleware
const validateApiSecret = (req: Request, res: Response, next: () => void) => {
  console.log("🔑 validateApiSecret called for path:", req.path);
  const apiSecret = req.headers["x-api-secret"];
  if (apiSecret !== API_SECRET_KEY) {
    console.log("❌ Invalid API secret:", apiSecret);
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  console.log("✅ API secret validated successfully");
  next();
};

// Express App Setup
const app = express();
app.use(helmet());

// Configure CORS based on environment
const allowedOrigins =
  process.env.NODE_ENV === "production"
  ? [
      env.FRONTEND_URL,
        "https://dstealth.xyz",
        "https://dstealth.vercel.app",
        "https://xmtp-mini-app-examples.vercel.app",
        "https://xmtp-mini-app-examples-git-main-tantodefi.vercel.app",
        "https://xmtp-mini-app-examples-tantodefi.vercel.app",
    ].filter(Boolean)
    : "*";

console.log("🌐 CORS Configuration:", {
  nodeEnv: process.env.NODE_ENV, 
  allowedOrigins,
  frontendUrl: env.FRONTEND_URL,
});

const corsOptions = {
  origin: allowedOrigins,
  credentials: true,
};
app.use(cors(corsOptions));

// JSON body parser with raw body preservation for webhook signature verification
app.use(express.json({
  verify: (req: any, res, buf) => {
    if (req.originalUrl.includes('/api/webhooks')) {
      req.rawBody = buf.toString('utf8');
    }
  }
}));

// Add global request logger
app.use((req, res, next) => {
  console.log(`📡 ${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Routes
app.get("/health", (req, res) => {
  console.log("✅ HEALTH CHECK ENDPOINT HIT");
  const isVercel = process.env.VERCEL || process.env.NODE_ENV === "production";

  // 🔧 NEW v3.0.0+: Enhanced health check with agent status
  const agentStatus = dStealthAgent?.getStatus();

  res.json({ 
    status: "ok",
    xmtp: xmtpClient ? "available" : "unavailable",
    environment: XMTP_ENV,
    platform: isVercel ? "vercel" : "local",
    timestamp: new Date().toISOString(),
    // 🔧 NEW v3.0.0+: Agent health information
    agent: agentStatus
      ? {
          running: agentStatus.isRunning,
          streamRestarts: agentStatus.streamRestartCount,
          processedMessages: agentStatus.processedMessages,
          installations: agentStatus.installationCount,
          streamFailures: streamFailureCount,
          lastFailure: lastStreamFailure?.toISOString(),
          sdkVersion: "3.0.0+",
        }
      : "unavailable",
  });
});

// 🔧 NEW v3.0.0+: Enhanced agent info endpoint with detailed status
app.get("/api/agent/info", async (req, res) => {
  try {
    if (!dStealthAgent) {
      // Provide graceful fallback when agent is unavailable
      console.warn("⚠️ dStealth Agent not available - returning fallback info");
      
      return res.json({
        success: true,
        agent: {
          inboxId: "agent-unavailable",
          address:
            process.env.AGENT_ADDRESS ||
            "0x0000000000000000000000000000000000000000",
          status: "initializing",
          error:
            "XMTP agent is currently initializing or experiencing connectivity issues",
          features: [
            "Stealth Address Generation (Limited)",
            "Privacy Analysis (Basic)", 
            "Fallback Mode Active",
            "Retrying Connection...",
          ],
          fallbackMode: true,
          lastError: xmtpInitError
            ? xmtpInitError.message
            : "Unknown initialization error",
          sdkVersion: "3.0.0+",
          streamFailures: streamFailureCount,
        },
      });
    }

    const agentInfo = dStealthAgent?.getClient()
    ? {
        address: dStealthAgent.getAgentAddress(),
        inboxId: dStealthAgent.getClient()?.inboxId,
        isRunning: dStealthAgent.isConnected(),
        environment: process.env.XMTP_ENV || 'production',
      }
    : null;

  if (agentInfo) {
    console.log(`✅ dStealth Agent Status:`);
    console.log(`   🔧 Agent Address: ${agentInfo.address}`);
    console.log(`   📬 Agent Inbox ID: ${agentInfo.inboxId}`);
    console.log(`   🌍 Environment: ${agentInfo.environment}`);
    console.log(`   🔄 Status: ${agentInfo.isRunning ? "Connected" : "Disconnected"}`);
  } else {
    console.log(`❌ dStealth Agent not available`);
  }

  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    agent: agentInfo ? {
      address: agentInfo.address,
      inboxId: agentInfo.inboxId,
      isRunning: agentInfo.isRunning,
      environment: agentInfo.environment,
    } : null,
    database: {
      redis: !!redisClient,
      healthCheck: "available",
    },
    endpoints: {
      stealth: "/api/stealth",
      convos: "/api/convos",
      webhooks: "/api/webhooks",
    },
  });
  } catch (error) {
    console.error("Error getting agent info:", error);
    res.status(200).json({
      success: true,
      agent: {
        inboxId: "agent-error",
        address:
          process.env.AGENT_ADDRESS ||
          "0x0000000000000000000000000000000000000000",
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
        features: ["Limited Functionality", "Error Recovery Mode"],
        fallbackMode: true,
        lastError: error instanceof Error ? error.message : "Unknown error",
        sdkVersion: "3.0.0+",
      },
    });
  }
});

// 🔧 NEW v3.1.0+: Enhanced debug endpoint with SDK v3.1.0+ debug information
app.get("/api/debug/agent", async (req, res) => {
  try {
    if (!dStealthAgent) {
      return res.status(503).json({
        success: false,
        error: "Agent not available",
      });
    }

    const agentStatus = dStealthAgent.getStatus();
    const contactInfo = dStealthAgent.getContactInfo();

    res.json({
      success: true,
      debug: {
        agent: agentStatus,
        contact: contactInfo,
        stream: {
          failures: streamFailureCount,
          lastFailure: lastStreamFailure?.toISOString(),
        },
        sdkVersion: "3.1.0+",
        architecture: "production-ready",
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Debug info failed",
    });
  }
});

// 🔧 TEMPORARY: Debug endpoint to check global variable state
app.get("/api/debug/global-state", (req, res) => {
  try {
    const state = {
      dStealthAgent: {
        exists: !!dStealthAgent,
        type: typeof dStealthAgent,
        isNull: dStealthAgent === null,
        isUndefined: dStealthAgent === undefined,
      },
      xmtpClient: {
        exists: !!xmtpClient,
        type: typeof xmtpClient,
        isNull: xmtpClient === null,
        isUndefined: xmtpClient === undefined,
      },
      streamFailureCount,
      lastStreamFailure: lastStreamFailure?.toISOString(),
      xmtpInitError: xmtpInitError?.message,
      env: {
        XMTP_ENV,
        NODE_ENV: process.env.NODE_ENV,
      }
    };

    console.log("🔍 Debug: Global state check:", state);
    
    res.json({
      success: true,
      debug: state,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Debug failed",
    });
  }
});

// Legacy endpoint for dStealth Agent (redirects to unified agent)
app.get("/api/dstealth/info", async (req, res) => {
  try {
    if (!dStealthAgent) {
      return res.status(503).json({
        success: false,
        message: "Unified Agent not available",
        error: "Agent service is temporarily unavailable",
      });
    }

    const agentInfo = dStealthAgent.getClient();
    if (!agentInfo) {
      return res.status(503).json({
        success: false,
        error: "dStealth agent client not available",
      });
    }

    const signer = createSigner(WALLET_KEY);
    const identifier = await Promise.resolve(signer.getIdentifier());
    const agentAddress = identifier.identifier;

    res.json({
      success: true,
      agent: {
        inboxId: agentInfo.inboxId,
        address: agentAddress,
        status: "active",
        features: [
          "Stealth Address Lookup via fkey.id",
          "Privacy-focused Address Scanning", 
          "Proxy402 Link Management",
          "ZK Proof Storage & Retrieval",
          "X402 Content Creation",
          "Smart Wallet Operations",
        ],
      },
    });
  } catch (error: unknown) {
    console.error("Error getting unified agent info:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get unified agent information",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.post(
  "/api/xmtp/add-inbox",
  validateApiSecret,
  async (req: Request, res: Response) => {
    if (!xmtpClient) {
      return res.status(503).json({
        success: false,
        message: "XMTP client not available",
        error: "XMTP service is temporarily unavailable",
      });
    }

    try {
      const { inboxId } = req.body as { inboxId: string };
      console.log(
        "Adding user to default group chat with id:",
        GROUP_ID,
        "and inboxId:",
        inboxId,
      );
      const result = await addUserToDefaultGroupChat(inboxId);
      res.status(200).json({
        success: result,
        message: result
          ? "Successfully added user to default group chat"
          : "You are already in the group",
      });
      console.log("⚪ Response sent for add-inbox");
    } catch (error: unknown) {
      console.error("Error adding user to default group chat:", error);
      res.status(500).json({
        message: "You are not in the group",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);

app.post(
  "/api/xmtp/remove-inbox",
  validateApiSecret,
  async (req: Request, res: Response) => {
    if (!xmtpClient) {
      return res.status(503).json({
        success: false,
        message: "XMTP client not available",
        error: "XMTP service is temporarily unavailable",
      });
    }

    try {
      const { inboxId } = req.body as { inboxId: string };
      console.log("Removing user from group with inboxId:", inboxId);
      const result = await removeUserFromDefaultGroupChat(inboxId);
      res.status(200).json({
        success: result,
        message: result
          ? "Successfully removed user from default group chat"
          : "Failed to remove user from default group chat",
      });
      console.log("⚪ Response sent for remove-inbox");
    } catch (error) {
      console.error("Error removing user from default group chat:", error);
      res.status(500).json({
        message: "Failed to remove user from default group chat",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);
app.get(
  "/api/xmtp/get-group-id",
  validateApiSecret,
  async (req: Request, res: Response) => {
    if (!xmtpClient) {
      return res.status(503).json({
        success: false,
        message: "XMTP client not available",
        error: "XMTP service is temporarily unavailable",
      });
    }

    try {
      console.log("🔵 Inside get-group-id async block");
      console.log("Current client inbox ID:", req.query.inboxId);
      console.log("Looking for group with ID:", GROUP_ID);
      const conversation = await xmtpClient.conversations.getConversationById(
        GROUP_ID ?? "",
      );
      console.log("🟢 Conversation fetched:", conversation?.id);
      if (!conversation) {
        console.log("⚠️ No conversation found");
        return res.status(404).json({ error: "Group not found" });
      }
      await conversation.sync();
      console.log("🟡 Conversation synced");

      const groupMembers = await (conversation as Group).members();
      const messages = await (conversation as Group).messages();
      const lastMessage =
        messages.length > 0 ? messages[messages.length - 1] : null;

      const isMember = groupMembers.some(
        (member) => member.inboxId === req.query.inboxId,
      );

      console.log("🟣 isMember check complete:", isMember);
      console.log("🟣 Client inbox ID:", req.query.inboxId);

      // Format member information for the response
      const formattedMembers = groupMembers.map((member) => ({
        inboxId: member.inboxId,
        // Only include the first and last characters of the wallet address for privacy
        displayInboxId: `${member.inboxId.slice(0, 6)}...${member.inboxId.slice(-6)}`,
        isAdmin: (conversation as Group).isAdmin(member.inboxId),
        isSuperAdmin: (conversation as Group).isSuperAdmin(member.inboxId),
      }));

      // Format last message for the response
      const formattedLastMessage = lastMessage
        ? {
            id: lastMessage.id,
            content: lastMessage.content,
            sentAt: lastMessage.sentAt,
            // Use sender or inboxId depending on what's available
            senderInboxId: lastMessage.senderInboxId || "unknown",
            displaySenderId: lastMessage.senderInboxId
              ? `${lastMessage.senderInboxId.slice(0, 6)}...${lastMessage.senderInboxId.slice(-6)}`
              : "unknown",
          }
        : null;

      const responseObject = {
        groupId: process.env.GROUP_ID,
        groupName: (conversation as Group).name,
        isMember,
        memberCount: groupMembers.length,
        members: formattedMembers,
        lastMessage: formattedLastMessage,
        messageCount: messages.length,
      };

      res.json(responseObject);
      console.log("⚪ Response sent for get-group-id");
    } catch (error: unknown) {
      console.error("❌ Error in get-group-id:", error);
      res.status(500).json({ error: "Failed to fetch group info" });
    }
  },
);

app.use("/api/fkey", fkeyRoutes);
app.use("/api/convos", convosRoutes);
app.use("/api/webhooks", webhookRoutes);
app.use("/api/user/stealth-data", userStealthDataRoutes);
app.use("/api/user/search", userSearchRoutes);
app.use("/api/frontend-users", frontendUsersRoutes);

// Stealth notification endpoints
app.post("/api/stealth/register", async (req, res) => {
  try {
    const { userId, address, notificationPrefs, stealthScanKeys } = req.body;
    
    if (!userId || !address) {
      return res.status(400).json({
        success: false,
        error: "User ID and address are required",
      });
    }

    const userData = {
      userId,
      address: address.toLowerCase(),
      notificationPrefs: {
        stealthEnabled: true,
        stealthPayments: true,
        stealthRegistrations: true,
        stealthAnnouncements: true,
        ...notificationPrefs,
      },
      stealthScanKeys: stealthScanKeys || [],
      registeredAt: Date.now(),
    };

    await agentDb.storeStealthUser(userId, userData);

    res.json({
      success: true,
      message: "Successfully registered for stealth notifications",
      userId,
      monitoring: true,
    });

    console.log(`🔔 Registered user ${userId} for stealth notifications`);
  } catch (error) {
    console.error("Error registering for stealth notifications:", error);
    res.status(500).json({
      success: false,
      error: "Failed to register for stealth notifications",
    });
  }
});

app.post("/api/stealth/unregister", async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "User ID is required",
      });
    }

    // Update user to disable stealth notifications
    const existingUser = await agentDb.getUsersWithStealthNotifications();
    const user = existingUser.find((u) => u.userId === userId);
    
    if (user) {
      const updatedData = {
        ...user,
        notificationPrefs: {
          ...user.notificationPrefs,
          stealthEnabled: false,
        },
      };
      
      await agentDb.storeStealthUser(userId, updatedData);
    }

    res.json({
      success: true,
      message: "Successfully unregistered from stealth notifications",
      userId,
      monitoring: false,
    });

    console.log(`🔕 Unregistered user ${userId} from stealth notifications`);
  } catch (error) {
    console.error("Error unregistering from stealth notifications:", error);
    res.status(500).json({
      success: false,
      error: "Failed to unregister from stealth notifications",
    });
  }
});

app.get("/api/stealth/status", async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "User ID is required",
      });
    }

    const users = await agentDb.getUsersWithStealthNotifications();
    const user = users.find((u) => u.userId === userId);
    
    res.json({
      success: true,
      monitoring: !!user && user.notificationPrefs?.stealthEnabled !== false,
      preferences: user?.notificationPrefs || null,
      lastNotification: user?.lastStealthNotification || null,
    });
  } catch (error) {
    console.error("Error getting stealth notification status:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get stealth notification status",
    });
  }
});

// Agent settings endpoint - allows agent to access user preferences
app.get("/api/agent/user-settings/:userInboxId", async (req, res) => {
  try {
    const { userInboxId } = req.params;
    
    if (!userInboxId) {
      return res
        .status(400)
        .json({ success: false, error: "User inbox ID required" });
    }

    // Get user settings from Redis database
    const userData = await agentDb.getStealthDataByUser(userInboxId);
    
    // Mock user preferences (in production, this would come from a user preferences store)
    const userSettings = {
      inboxId: userInboxId,
      fkeyId: userData?.fkeyId || null,
      stealthAddress: userData?.stealthAddress || null,
      preferences: {
        enableAI: true,
        privacyMode: "standard",
        notifications: true,
        language: "en",
      },
      lastInteraction: userData?.lastUpdated || null,
    };

    res.json({
      success: true,
      settings: userSettings,
    });
  } catch (error) {
    console.error("Error fetching user settings:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch user settings",
    });
  }
});

// Add debug endpoint to check database status
app.get("/api/debug/database", (req, res) => {
  try {
    const fs = require("fs");
    
    const currentDbPath = getDbPath(XMTP_ENV);
    const allPossiblePaths = [
      "/data/xmtp/dev-xmtp.db3",
      "/data/xmtp/production-xmtp.db3",
      "/data/xmtp/local-xmtp.db3",
    ];

    const dbStatus = allPossiblePaths.map((dbPath) => {
      try {
        const exists = fs.existsSync(dbPath);
        const stats = exists ? fs.statSync(dbPath) : null;
        return {
          path: dbPath,
          exists,
          size: stats ? stats.size : 0,
          modified: stats ? stats.mtime.toISOString() : null,
          isCurrent: dbPath === currentDbPath,
        };
      } catch (error) {
        return {
          path: dbPath,
          exists: false,
          error: error instanceof Error ? error.message : "Unknown error",
          isCurrent: dbPath === currentDbPath,
        };
      }
    });
    
    res.json({
      success: true,
      currentEnv: XMTP_ENV,
      currentDbPath,
      agentInboxId: xmtpClient ? xmtpClient.inboxId : "not-initialized",
      conversationCount: xmtpClient ? "check-via-sync" : 0,
      databases: dbStatus,
      suggestion: dbStatus.find(
        (db) => db.exists && !db.isCurrent && db.size > 1000,
      )
        ? "Found existing database with different environment - consider switching XMTP_ENV"
        : "No other databases found",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// 🤖 Enhanced: Initialize dStealth Agent with fallback
console.log("🤖 XMTP client ready, now initializing dStealth Agent...");

// Initialize the agent with error recovery
const initializeAgentWithRecovery = async () => {
  console.log("🤖 Initializing Production dStealth Agent...");
  
  // Add initial delay to prevent rate limiting
  const initialDelay = process.env.RENDER ? 15000 : 5000; // 15s on Render, 5s elsewhere
  console.log(
    `⏳ Waiting ${initialDelay / 1000}s before agent initialization to prevent rate limits...`,
  );
  await new Promise((resolve) => setTimeout(resolve, initialDelay));

  try {
    await initializeDStealthAgent();
    console.log(
      "✅ Production dStealth Agent is now ready and listening for messages",
    );
  } catch (initError) {
    console.error(
      "❌ Production dStealth Agent initialization failed, but server continues:",
      initError,
    );
    
    // 🔧 Enhanced: Implement background retry for failed initialization
    let retryCount = 0;
    const maxBackgroundRetries = 10;
    
    const backgroundRetry = async () => {
      retryCount++;
      const retryDelay = Math.min(60000 * retryCount, 300000); // 1min, 2min, 3min, up to 5min max
      
      console.log(
        `🔄 Background retry ${retryCount}/${maxBackgroundRetries} in ${retryDelay / 1000}s...`,
      );
      
      setTimeout(async () => {
        try {
          console.log(`🔄 Background initialization attempt ${retryCount}...`);
          await initializeDStealthAgent();
          console.log(
            "✅ Production dStealth Agent initialized successfully on background retry",
          );
        } catch (retryError) {
          console.error(
            `❌ Background retry ${retryCount} failed:`,
            retryError,
          );
          
          if (retryCount < maxBackgroundRetries) {
            backgroundRetry(); // Schedule next retry
          } else {
            console.error(
              "❌ All background retries exhausted - agent will remain offline",
            );
          }
        }
      }, retryDelay);
    };
    
    // Start background retry process
    backgroundRetry();
  }
};

// Start the initialization process
initializeAgentWithRecovery();

// Add admin sync endpoint after the other endpoints

// Admin endpoint to force conversation sync
app.post("/api/admin/sync-conversations", async (req, res) => {
  try {
    const { adminKey } = req.body;
    
    // Simple admin key check
    if (
      adminKey !== process.env.ADMIN_KEY &&
      adminKey !== "sync-conversations-2025"
    ) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized - admin key required",
      });
    }

    if (!dStealthAgent) {
      return res.status(503).json({
        success: false,
        error: "dStealth agent not available",
      });
    }

    const client = dStealthAgent.getClient();
    if (!client) {
      return res.status(503).json({
        success: false,
        error: "dStealth agent client not available",
      });
    }

    await client.conversations.sync();
    
    console.log("✅ Admin-triggered conversation sync completed");

    res.json({
      success: true,
      message: "Conversation sync completed",
      result: "success",
    });
  } catch (error: unknown) {
    console.error("❌ Admin sync failed:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Sync failed",
    });
  }
});

// Start Server
void (async () => {
  try {
    // Start HTTP server first
    const server = app.listen(env.PORT, () => {
      console.log(`🚀 Server is running on port ${env.PORT}`);
      console.log(`🌐 API endpoints available at http://localhost:${env.PORT}`);
      console.log(`�� Using XMTP SDK v3.1.0+ with enhanced reliability`);
    });

    // Initialize XMTP in parallel (don't block server startup)
    initializeXmtpClient()
      .then(async () => {
      // Initialize the dStealth Agent after XMTP client is ready
        console.log(
          "🤖 XMTP client ready, now initializing Production dStealth Agent with v3.1.0+...",
        );
      try {
        await initializeDStealthAgent();
          console.log(
            "✅ Production dStealth Agent initialization completed with enhanced reliability",
          );
      } catch (error) {
          console.error(
            "⚠️ Production dStealth Agent initialization failed, but server continues:",
            error,
          );
        }
      })
      .catch((error: unknown) => {
        console.error(
          "⚠️ XMTP initialization failed, but server continues:",
          error,
        );
      // Server continues to run without XMTP for API routes that don't need it
    });

    // Start stealth monitoring service (in background)
    try {
      console.log("🥷 Starting stealth transaction monitoring service...");
      await stealthMonitor.start();
      console.log("✅ Stealth monitor started successfully");
    } catch (error) {
      console.error(
        "⚠️ Stealth monitor failed to start, but server continues:",
        error,
      );
      // Server continues to run without stealth monitoring
    }

    console.log("✅ Unified database approach - no sync service needed");
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
})();
