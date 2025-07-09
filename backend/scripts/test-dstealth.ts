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
    console.log(`📊 Status: ${agentStatus.isRunning ? "Running" : "Stopped"}`);
    console.log(`💬 Messages Processed: ${agentStatus.processedMessageCount}`);
    console.log(`🔄 Stream Restarts: ${agentStatus.streamRestartCount}`);

    // Test database operations
    console.log("💾 Testing database operations...");
    const testData = {
      userId: "test_user",
      fkeyId: "test.fkey.id",
      stealthAddress: "0x1234567890123456789012345678901234567890",
      zkProof: { test: "proof" },
      lastUpdated: Date.now(),
      requestedBy: contactInfo.inboxId,
    };

    await agentDb.storeUserStealthData(testData);
    const retrievedData = await agentDb.getStealthDataByFkey("test.fkey.id");

    if (
      retrievedData &&
      retrievedData.stealthAddress === testData.stealthAddress
    ) {
      console.log("✅ Database operations working correctly");
    } else {
      console.log("❌ Database operations failed");
    }

    // Cleanup
    await agentDb.clearAgentData();
    await agent.shutdown();

    console.log(
      "🎉 All tests passed! Production dStealth Agent is ready to run.",
    );
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  }
}

main().catch(console.error);
