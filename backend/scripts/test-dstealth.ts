#!/usr/bin/env tsx
import "dotenv/config";
import type { XmtpEnv } from "@xmtp/node-sdk";
import { DStealthAgentProduction } from "../src/agents/dstealth-agent-production.js";
import { env } from "../src/config/env.js";
import { getDbPath } from "../src/helper.js";
import { agentDb } from "../src/lib/agent-database.js";
import type { XmtpAgentConfig } from "../src/lib/xmtp-agent-base.js";

async function main() {
  console.log("🧪 Testing Production dStealth Agent...");

  try {
    // Test database connection
    console.log("🔍 Testing database connection...");
    const dbConnected = await agentDb.testConnection();

    if (dbConnected) {
      console.log("✅ Database connection successful");
    } else {
      console.log("❌ Database connection failed");
      return;
    }

    // Test agent initialization
    console.log("🤖 Testing Production agent initialization...");

    const config: XmtpAgentConfig = {
      walletKey: env.WALLET_KEY,
      encryptionKey: env.ENCRYPTION_KEY,
      env: env.XMTP_ENV,
      dbPath: getDbPath(env.XMTP_ENV),
      maxInstallations: 5,
    };

    const agent = await DStealthAgentProduction.createAndStart(config);

    console.log("✅ Production Agent initialized successfully!");

    const contactInfo = agent.getContactInfo();
    console.log(`📬 Inbox ID: ${contactInfo.inboxId}`);
    console.log(`🔑 Address: ${contactInfo.address}`);

    const agentStatus = agent.getStatus();
    console.log(`📊 Agent Status: ${agentStatus.isRunning ? "Running" : "Stopped"}`);
    console.log(`💬 Messages Processed: ${agentStatus.processedMessages}`);
    console.log(`🔄 Stream Restarts: ${agentStatus.streamRestartCount}`);
    console.log(`🔧 Installations: ${agentStatus.installationCount}`);

    // Test user data storage
    const testData = {
      userId: "test-user-123",
      fkeyId: "testuser",
      stealthAddress: "0x1234567890123456789012345678901234567890",
      zkProof: { test: "proof-data" },
      lastUpdated: Date.now(),
      requestedBy: contactInfo.inboxId || "test-system",
      network: "base",
      metadata: {},
      miniAppRegistered: false,
      setupStatus: "complete" as const
    };

    await agentDb.storeUserStealthData(testData);
    console.log("✅ Test data stored successfully");

    // Test data retrieval
    const retrievedData = await agentDb.getStealthDataByUser("test-user-123");
    console.log("📥 Retrieved data:", retrievedData ? "✅ Success" : "❌ Failed");

    console.log("\n🎯 Test completed successfully!");
    
    // Note: Agent doesn't have a shutdown method, it will terminate naturally
    console.log("📋 Agent will continue running - use Ctrl+C to stop");
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

main().catch(console.error);
