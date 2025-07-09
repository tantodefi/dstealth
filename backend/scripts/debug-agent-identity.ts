#!/usr/bin/env tsx
import "dotenv/config";
import { Client, type XmtpEnv } from "@xmtp/node-sdk";
import {
  createSigner,
  getEncryptionKeyFromHex,
  validateEnvironment,
} from "../src/helper.js";

async function main() {
  console.log("🔍 DEBUGGING AGENT IDENTITY MISMATCH...\n");

  try {
    // Get environment variables
    const { XMTP_ENV, WALLET_KEY, ENCRYPTION_KEY } = validateEnvironment([
      "XMTP_ENV",
      "WALLET_KEY",
      "ENCRYPTION_KEY",
    ]);

    console.log("📋 **LOCAL ENVIRONMENT**");
    console.log("🌍 XMTP_ENV:", XMTP_ENV);
    console.log(
      "🔑 WALLET_KEY (first 10 chars):",
      WALLET_KEY.substring(0, 10) + "...",
    );
    console.log(
      "🔐 ENCRYPTION_KEY (first 10 chars):",
      ENCRYPTION_KEY.substring(0, 10) + "...",
    );

    // Create signer and get address
    console.log("\n🔄 Creating local agent signer...");
    const agentSigner = createSigner(WALLET_KEY);
    const agentIdentifier = agentSigner.getIdentifier();
    const agentAddress =
      typeof agentIdentifier === "object" && "identifier" in agentIdentifier
        ? agentIdentifier.identifier
        : (await agentIdentifier).identifier;

    console.log("📧 Local Agent Address:", agentAddress);

    // Create XMTP client to get inbox ID
    console.log("🔄 Creating local XMTP client...");
    const agentEncryptionKey = getEncryptionKeyFromHex(ENCRYPTION_KEY);
    const localClient = await Client.create(agentSigner, {
      dbEncryptionKey: agentEncryptionKey,
      env: XMTP_ENV as XmtpEnv,
    });

    console.log("✅ Local client created");
    console.log("📬 Local Inbox ID:", localClient.inboxId);
    console.log("🏠 Local Installation ID:", localClient.installationId);

    // Get production agent info from API
    console.log("\n📋 **PRODUCTION AGENT (via API)**");
    const backendUrl = "https://xmtp-mini-app-examples.onrender.com";

    try {
      const response = await fetch(`${backendUrl}/api/agent/info`);
      const data = await response.json();

      if (data.success && data.agent) {
        console.log("📧 Production Agent Address:", data.agent.address);
        console.log("📬 Production Inbox ID:", data.agent.inboxId);
        console.log("📊 Production Status:", data.agent.status);
      } else {
        console.error("❌ Failed to get production agent info:", data);
      }
    } catch (apiError) {
      console.error("❌ Error fetching production agent info:", apiError);
    }

    // Compare and analyze
    console.log("\n🔍 **IDENTITY ANALYSIS**");

    // Check if addresses match
    const response = await fetch(`${backendUrl}/api/agent/info`);
    const prodData = await response.json();

    if (prodData.success && prodData.agent) {
      const prodAddress = prodData.agent.address;
      const prodInboxId = prodData.agent.inboxId;

      console.log(
        "🔍 Address Match:",
        agentAddress.toLowerCase() === prodAddress.toLowerCase()
          ? "✅ YES"
          : "❌ NO",
      );
      console.log(
        "🔍 Inbox ID Match:",
        localClient.inboxId === prodInboxId ? "✅ YES" : "❌ NO",
      );

      if (agentAddress.toLowerCase() !== prodAddress.toLowerCase()) {
        console.log("\n🚨 **WALLET KEY MISMATCH DETECTED!**");
        console.log("   Local uses different wallet key than production");
        console.log("   This explains the different inbox IDs");
      } else if (localClient.inboxId !== prodInboxId) {
        console.log("\n🚨 **INBOX ID MISMATCH WITH SAME ADDRESS!**");
        console.log("   This should not happen with the same wallet key");
        console.log("   Possible causes:");
        console.log("   - Different XMTP environment settings");
        console.log("   - Different encryption keys affecting database state");
        console.log("   - XMTP network inconsistency");
      } else {
        console.log("\n✅ **IDENTITIES MATCH PERFECTLY!**");
        console.log("   The agent identities are identical");
        console.log("   The conversation discovery issue must be elsewhere");
      }
    }

    // Check conversation counts
    console.log("\n📊 **CONVERSATION COMPARISON**");
    await localClient.conversations.sync();
    const localConversations = await localClient.conversations.list();
    console.log("📋 Local Conversations:", localConversations.length);

    if (localConversations.length > 0) {
      console.log("🔍 Local Conversation IDs (first 3):");
      localConversations.slice(0, 3).forEach((conv, i) => {
        console.log(`   ${i + 1}. ${conv.id}`);
      });
    }

    console.log("\n💡 **RECOMMENDED ACTIONS**");
    if (agentAddress.toLowerCase() !== prodData.agent.address.toLowerCase()) {
      console.log("1. 🔧 Update Render WALLET_KEY environment variable");
      console.log("2. 🔄 Redeploy the Render service");
      console.log("3. 🧪 Test again after deployment");
    } else {
      console.log("1. 🔄 The identities match - investigate conversation sync");
      console.log("2. 🕐 Wait for production agent to discover conversations");
      console.log("3. 📝 Check Render logs for conversation discovery");
    }
  } catch (error) {
    console.error("❌ Debug error:", error);
    process.exit(1);
  }
}

main().catch(console.error);
