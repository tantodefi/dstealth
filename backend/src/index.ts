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
  validateEnvironment,
} from "./helper.js";
import { env } from './config/env.js';
import fkeyRoutes from './routes/fkey.js';
import convosRoutes from './routes/convos.js';

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

// Initialize XMTP client
const initializeXmtpClient = async () => {
  try {
    // Create wallet signer and encryption key
    const signer = createSigner(WALLET_KEY);
    const dbEncryptionKey = getEncryptionKeyFromHex(ENCRYPTION_KEY);
    const dbPath = getDbPath(XMTP_ENV);
    
    console.log("🔄 Initializing XMTP client...");
    console.log("📁 Database path:", dbPath);
    console.log("🌍 Environment:", XMTP_ENV);
    
    // Create installation A (receiver) client
    xmtpClient = await Client.create(signer, {
      dbEncryptionKey,
      env: XMTP_ENV as XmtpEnv,
      dbPath,
    });

    console.log("✅ XMTP Client initialized with inbox ID:", xmtpClient.inboxId);
    
    // Only try to setup group functionality if not in Vercel (to avoid memory issues)
    // Render has RENDER=true, Vercel has VERCEL=1/true
    const isVercel = process.env.VERCEL === '1' || process.env.VERCEL === 'true';
    const isRender = process.env.RENDER === 'true';
    
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
    console.error("Failed to initialize XMTP client:", error);
    
    // In Vercel, we might want to continue without XMTP for API routes that don't need it
    // Render has RENDER=true, Vercel has VERCEL=1/true  
    const isVercel = process.env.VERCEL === '1' || process.env.VERCEL === 'true';
    const isRender = process.env.RENDER === 'true';
    
    console.log(`🔧 Is Vercel: ${isVercel}`);
    console.log(`🔧 Is Render: ${isRender}`);
    
    if (isVercel) {
      console.warn("⚠️ XMTP client initialization failed in Vercel - API will work but XMTP features will be disabled");
      xmtpClient = null as any; // Set to null so we can check for it in routes
      return; // Don't throw, let the server start
    }
    
    throw error; // Re-throw for local development
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
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? env.FRONTEND_URL 
    : '*', // Allow all origins in development
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

// Start Server
void (async () => {
  try {
    await initializeXmtpClient();
    app.listen(env.PORT, () => {
      console.log(`Server is running on port ${env.PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
})();
