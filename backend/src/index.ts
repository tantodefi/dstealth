/* eslint-disable @typescript-eslint/no-misused-promises */
import {
  Client,
  Conversation,
  Group,
  type XmtpEnv,
} from "@xmtp/node-sdk";
import cors from "cors";
import "dotenv/config";
import express, { type Request, type Response } from "express";
import helmet from "helmet";
import {
  appendToEnv,
  createSigner,
  defaultInboxes,
  getDbPath,
  getEncryptionKeyFromHex,
  resetXmtpDatabase,
  validateEnvironment,
} from "./helper.js";
import { env } from './config/env.js';
import fkeyRoutes from './routes/fkey.js';
import convosRoutes from './routes/convos.js';
import webhookRoutes from './routes/webhooks.js';
import { DStealthAgent } from './agents/dstealth-agent.js';
import { agentDb } from './lib/agent-database.js';
import { stealthMonitor } from './services/stealth-monitor.js';

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
let xmtpClient: Client;
// Global dStealth Agent (combines X402 and dStealth functionality)
let dStealthAgent: DStealthAgent;

// Track XMTP initialization errors for better error reporting
let xmtpInitError: Error | null = null;

// Initialize XMTP client with retry logic
const initializeXmtpClient = async (retryCount = 0, maxRetries = 3) => {
  try {
    // Create wallet signer and encryption key
    const signer = createSigner(WALLET_KEY);
    const dbEncryptionKey = getEncryptionKeyFromHex(ENCRYPTION_KEY);
    const dbPath = getDbPath(XMTP_ENV);
    
    console.log(`🔄 Initializing XMTP client... (attempt ${retryCount + 1}/${maxRetries + 1})`);
    console.log("📁 Database path:", dbPath);
    console.log("🌍 Environment:", XMTP_ENV);
    
    // Create installation A (receiver) client
    xmtpClient = await Client.create(signer, {
      dbEncryptionKey,
      env: XMTP_ENV as XmtpEnv,
      dbPath,
    });

    console.log("✅ XMTP Client initialized with inbox ID:", xmtpClient.inboxId);
    
    // Initialize dStealth Agent
    await initializeDStealthAgent();
    
    // Only try to setup group functionality if not in Vercel (to avoid memory issues)
    // Vercel has VERCEL=1, Render has RENDER environment variable
    const isVercel = process.env.VERCEL === '1' || process.env.VERCEL === 'true' || process.env.VERCEL_ENV;
    const isRender = process.env.RENDER === 'true' || process.env.RENDER_SERVICE_ID;
    
    console.log(`🔧 Platform: ${isVercel ? 'Vercel' : isRender ? 'Render' : 'Local'}`);
    console.log(`🔧 Is Vercel: ${isVercel}`);
    console.log(`🔧 Is Render: ${isRender}`);
    
    if (!isVercel) {
      try {
        await xmtpClient.conversations.sync();
        
        let conversation: Conversation | undefined;
        console.log("GROUP_ID", GROUP_ID);
        
        if (GROUP_ID) {
          conversation = await xmtpClient.conversations.getConversationById(GROUP_ID);
          // If group doesn't exist, create a new one
          if (!conversation) {
            console.log("Group not found, creating new group");
            conversation = await xmtpClient.conversations.newGroup(defaultInboxes, {
              groupName: "XMTP Debugger Group"
            });
            GROUP_ID = conversation.id;
            appendToEnv("GROUP_ID", GROUP_ID);
          }
        } else {
          conversation = await xmtpClient.conversations.newGroup(defaultInboxes, {
            groupName: "XMTP Debugger Group"
          });
          console.log("New group created:", conversation.id);
          GROUP_ID = conversation.id;
          appendToEnv("GROUP_ID", GROUP_ID);
        }

        // Check if conversation is a Group before using Group-specific methods
        if (conversation instanceof Group) {
          const isAdmin = conversation.isSuperAdmin(xmtpClient.inboxId);
          await conversation.sync();
          console.log("Client is admin of the group:", isAdmin);
          
          // Send test message
          const message = await conversation.send("Test message");
          console.log("Message sent:", message);
        } else {
          console.warn("Conversation is not a Group - skipping group setup");
        }
      } catch (groupError) {
        console.warn("Failed to setup group chat - continuing without group functionality:", groupError);
      }
    } else {
      console.log("🚀 Running in Vercel - skipping group setup to avoid memory constraints");
    }

    // The client is initialized, even if group setup failed
    return;
  } catch (error) {
    console.error(`❌ Failed to initialize XMTP client (attempt ${retryCount + 1}):`, error);
    xmtpInitError = error instanceof Error ? error : new Error(String(error));
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isInboxLogFull = errorMessage.includes("inbox log is full");
    
    // Platform detection
    const isVercel = process.env.VERCEL === '1' || process.env.VERCEL === 'true' || process.env.VERCEL_ENV;
    const isRender = process.env.RENDER === 'true' || process.env.RENDER_SERVICE_ID;
    
    console.log(`🔧 Platform: ${isVercel ? 'Vercel' : isRender ? 'Render' : 'Local'}`);
    
    // Retry logic for "inbox log is full" error
    if (isInboxLogFull && retryCount < maxRetries) {
      const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 30000); // Exponential backoff, max 30s
      console.log(`🔄 "Inbox log is full" error detected. Retrying in ${retryDelay}ms...`);
      
      // On final retry, reset the database to clear corruption
      if (retryCount === maxRetries - 1) {
        console.log(`🗑️ Final retry - attempting database reset to clear corruption...`);
        const resetSuccess = resetXmtpDatabase(XMTP_ENV);
        if (resetSuccess) {
          console.log(`✅ Database reset successful, proceeding with final retry`);
        } else {
          console.log(`❌ Database reset failed, proceeding with final retry anyway`);
        }
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      
      // Recursive retry
      return initializeXmtpClient(retryCount + 1, maxRetries);
    }
    
    if (isVercel) {
      console.warn("⚠️ XMTP client initialization failed in Vercel - API will work but XMTP features will be disabled");
      xmtpClient = null as any; // Set to null so we can check for it in routes
      return; // Don't throw, let the server start
    } else if (isRender) {
      console.warn("⚠️ XMTP initialization failed, but server continues:", errorMessage);
      xmtpClient = null as any; // Allow server to start without XMTP
      return; // Don't throw, let the server start
    }
    
    throw error; // Re-throw for local development
  }
};

// Initialize dStealth Agent
const initializeDStealthAgent = async () => {
  try {
    if (dStealthAgent) {
      console.log("🤖 dStealth Agent already initialized, skipping...");
      return;
    }

    console.log("🤖 Initializing dStealth Agent...");
    
    // Add delay to prevent "inbox log is full" error when initializing multiple XMTP clients
    console.log("⏳ Waiting 5 seconds before agent initialization to prevent conflicts...");
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    dStealthAgent = new DStealthAgent();
    await dStealthAgent.initialize();
    
    const agentInfo = dStealthAgent.getContactInfo();
    console.log("✅ dStealth Agent initialized:");
    console.log(`   📬 Agent Inbox ID: ${agentInfo.inboxId}`);
    console.log(`   🔑 Agent Address: ${agentInfo.address}`);
    console.log(`   📊 Agent Status: ${agentInfo.status}`);
    
  } catch (error) {
    console.error("❌ Failed to initialize dStealth Agent:", error);
    xmtpInitError = error instanceof Error ? error : new Error(String(error));
    // Don't throw - let the server continue without the agent
  }
};

// XMTP Service Functions
const removeUserFromDefaultGroupChat = async (
  newUserInboxId: string,
): Promise<boolean> => {
  try {
    const conversation = await xmtpClient.conversations.getConversationById(
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
    const conversation = await xmtpClient.conversations.getConversationById(
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
const allowedOrigins = process.env.NODE_ENV === 'production' 
  ? [
      env.FRONTEND_URL,
      'https://xmtp-mini-app-examples.vercel.app',
      'https://xmtp-mini-app-examples-git-main-tantodefi.vercel.app',
      'https://xmtp-mini-app-examples-tantodefi.vercel.app'
    ].filter(Boolean)
  : '*';

console.log('🌐 CORS Configuration:', { 
  nodeEnv: process.env.NODE_ENV, 
  allowedOrigins,
  frontendUrl: env.FRONTEND_URL 
});

const corsOptions = {
  origin: allowedOrigins,
  credentials: true
};
app.use(cors(corsOptions));
app.use(express.json());

// Add global request logger
app.use((req, res, next) => {
  console.log(`📝 ${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Routes
app.get("/health", (req, res) => {
  console.log("✅ HEALTH CHECK ENDPOINT HIT");
  const isVercel = process.env.VERCEL || process.env.NODE_ENV === 'production';
  res.json({ 
    status: "ok",
    xmtp: xmtpClient ? "available" : "unavailable",
    environment: XMTP_ENV,
    platform: isVercel ? "vercel" : "local",
    timestamp: new Date().toISOString()
  });
});

// Get dStealth Agent contact information
app.get("/api/agent/info", (req, res) => {
  try {
    if (!dStealthAgent) {
      // Provide graceful fallback when agent is unavailable
      console.warn("⚠️ dStealth Agent not available - returning fallback info");
      
      return res.json({
        success: true,
        agent: {
          inboxId: "agent-unavailable",
          address: process.env.AGENT_ADDRESS || "0x0000000000000000000000000000000000000000",
          status: "initializing",
          error: "XMTP agent is currently initializing or experiencing connectivity issues",
          features: [
            "X402 Content Creation (Limited)",
            "Basic API Access", 
            "Fallback Mode Active",
            "Retrying Connection..."
          ],
          fallbackMode: true,
          lastError: xmtpInitError ? xmtpInitError.message : "Unknown initialization error"
        }
      });
    }

    const agentInfo = dStealthAgent.getContactInfo();
    res.json({
      success: true,
      agent: {
        inboxId: agentInfo.inboxId,
        address: agentInfo.address,
        status: "active",
        features: [
          "X402 Content Creation",
          "Smart Wallet Operations", 
          "AI-Powered Responses",
          "dStealth Address Lookup",
          "Privacy-focused Scanning",
          "Proxy402 Link Management",
          "ZK Proof Storage"
        ],
        fallbackMode: false
      }
    });
  } catch (error) {
    console.error("Error getting agent info:", error);
    res.status(200).json({
      success: true,
      agent: {
        inboxId: "agent-error",
        address: process.env.AGENT_ADDRESS || "0x0000000000000000000000000000000000000000",
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
        features: [
          "Limited Functionality",
          "Error Recovery Mode"
        ],
        fallbackMode: true,
        lastError: error instanceof Error ? error.message : "Unknown error"
      }
    });
  }
});

// Legacy endpoint for dStealth Agent (redirects to unified agent)
app.get("/api/dstealth/info", (req, res) => {
  try {
    if (!dStealthAgent) {
      return res.status(503).json({
        success: false,
        message: "Unified Agent not available",
        error: "Agent service is temporarily unavailable"
      });
    }

    const agentInfo = dStealthAgent.getContactInfo();
    res.json({
      success: true,
      agent: {
        inboxId: agentInfo.inboxId,
        address: agentInfo.address,
        status: "active",
        features: [
          "Stealth Address Lookup via fkey.id",
          "Privacy-focused Address Scanning", 
          "Proxy402 Link Management",
          "ZK Proof Storage & Retrieval",
          "X402 Content Creation",
          "Smart Wallet Operations"
        ]
      }
    });
  } catch (error) {
    console.error("Error getting unified agent info:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get unified agent information",
      error: error instanceof Error ? error.message : "Unknown error"
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
        error: "XMTP service is temporarily unavailable"
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
    } catch (error) {
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
        error: "XMTP service is temporarily unavailable"
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
        error: "XMTP service is temporarily unavailable"
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

app.use('/api/fkey', fkeyRoutes);
app.use('/api/convos', convosRoutes);
app.use('/api/webhooks', webhookRoutes);

// Stealth notification endpoints
app.post("/api/stealth/register", async (req, res) => {
  try {
    const { userId, address, notificationPrefs, stealthScanKeys } = req.body;
    
    if (!userId || !address) {
      return res.status(400).json({
        success: false,
        error: 'User ID and address are required'
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
        ...notificationPrefs
      },
      stealthScanKeys: stealthScanKeys || [],
      registeredAt: Date.now()
    };

    await agentDb.storeStealthUser(userId, userData);

    res.json({
      success: true,
      message: 'Successfully registered for stealth notifications',
      userId,
      monitoring: true
    });

    console.log(`🔔 Registered user ${userId} for stealth notifications`);

  } catch (error) {
    console.error('Error registering for stealth notifications:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to register for stealth notifications'
    });
  }
});

app.post("/api/stealth/unregister", async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    // Update user to disable stealth notifications
    const existingUser = await agentDb.getUsersWithStealthNotifications();
    const user = existingUser.find(u => u.userId === userId);
    
    if (user) {
      const updatedData = {
        ...user,
        notificationPrefs: {
          ...user.notificationPrefs,
          stealthEnabled: false
        }
      };
      
      await agentDb.storeStealthUser(userId, updatedData);
    }

    res.json({
      success: true,
      message: 'Successfully unregistered from stealth notifications',
      userId,
      monitoring: false
    });

    console.log(`🔕 Unregistered user ${userId} from stealth notifications`);

  } catch (error) {
    console.error('Error unregistering from stealth notifications:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to unregister from stealth notifications'
    });
  }
});

app.get("/api/stealth/status", async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    const users = await agentDb.getUsersWithStealthNotifications();
    const user = users.find(u => u.userId === userId);
    
    res.json({
      success: true,
      monitoring: !!user && user.notificationPrefs?.stealthEnabled !== false,
      preferences: user?.notificationPrefs || null,
      lastNotification: user?.lastStealthNotification || null
    });

  } catch (error) {
    console.error('Error getting stealth notification status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get stealth notification status'
    });
  }
});

// Agent settings endpoint - allows agent to access user preferences
app.get("/api/agent/user-settings/:userInboxId", async (req, res) => {
  try {
    const { userInboxId } = req.params;
    
    if (!userInboxId) {
      return res.status(400).json({ success: false, error: 'User inbox ID required' });
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
        privacyMode: 'standard',
        notifications: true,
        language: 'en'
      },
      lastInteraction: userData?.lastUpdated || null
    };

    res.json({
      success: true,
      settings: userSettings
    });

  } catch (error) {
    console.error('Error fetching user settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user settings'
    });
  }
});

// Agent settings endpoint - allows agent to access user preferences
app.get("/api/agent/user-settings/:userInboxId", async (req, res) => {
  try {
    const { userInboxId } = req.params;
    
    if (!userInboxId) {
      return res.status(400).json({ success: false, error: 'User inbox ID required' });
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
        privacyMode: 'standard',
        notifications: true,
        language: 'en'
      },
      lastInteraction: userData?.lastUpdated || null
    };

    res.json({
      success: true,
      settings: userSettings
    });

  } catch (error) {
    console.error('Error fetching user settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user settings'
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
    });

    // Initialize XMTP in parallel (don't block server startup)
    initializeXmtpClient().catch((error) => {
      console.error("⚠️ XMTP initialization failed, but server continues:", error);
      // Server continues to run without XMTP for API routes that don't need it
    });

    // Start stealth monitoring service (in background)
    try {
      console.log("🥷 Starting stealth transaction monitoring service...");
      await stealthMonitor.start();
      console.log("✅ Stealth monitor started successfully");
    } catch (error) {
      console.error("⚠️ Stealth monitor failed to start, but server continues:", error);
      // Server continues to run without stealth monitoring
    }

  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
})();
