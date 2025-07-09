#!/usr/bin/env tsx
import "dotenv/config";
import { Client, IdentifierKind, type XmtpEnv } from "@xmtp/node-sdk";
import {
  createSigner,
  getEncryptionKeyFromHex,
  validateEnvironment,
} from "../src/helper.js";

async function main() {
  console.log("🔍 PRODUCTION BACKEND WALLET KEY DEBUG...\n");

  try {
    // Get local environment variables
    const { XMTP_ENV, WALLET_KEY, ENCRYPTION_KEY } = validateEnvironment([
      "XMTP_ENV",
      "WALLET_KEY",
      "ENCRYPTION_KEY",
    ]);

    console.log("📋 **LOCAL ENVIRONMENT CHECK**");
    console.log("🌍 XMTP_ENV:", XMTP_ENV);
    console.log(
      "🔑 Local WALLET_KEY (first 10 chars):",
      WALLET_KEY.substring(0, 10) + "...",
    );

    const localSigner = createSigner(WALLET_KEY);
    const localIdentifier = localSigner.getIdentifier();
    const localAddress =
      typeof localIdentifier === "object" && "identifier" in localIdentifier
        ? localIdentifier.identifier
        : (await localIdentifier).identifier;

    console.log("📧 Local address from WALLET_KEY:", localAddress);
    console.log("✅ Local environment verified\n");

    // Check production backend
    console.log("📋 **PRODUCTION BACKEND CHECK**");
    const prodBackendUrl = "https://xmtp-mini-app-examples.onrender.com";
    console.log("🌐 Production backend URL:", prodBackendUrl);

    console.log("🔄 Fetching production agent info...");
    const response = await fetch(`${prodBackendUrl}/api/agent/info`);

    if (!response.ok) {
      throw new Error(
        `Backend returned ${response.status}: ${response.statusText}`,
      );
    }

    const data = (await response.json()) as any;

    if (data.success && data.agent) {
      console.log("📧 Production agent address:", data.agent.address);
      console.log("📬 Production inbox ID:", data.agent.inboxId);
      console.log("📊 Production status:", data.agent.status);

      const addressMatch =
        localAddress.toLowerCase() === data.agent.address.toLowerCase();
      console.log("\n🔍 **ANALYSIS**");
      console.log("Address Match:", addressMatch ? "YES ✅" : "NO ❌");

      if (!addressMatch) {
        console.log("\n🚨 **CONFIRMED: DIFFERENT WALLET KEYS!**");
        console.log("Local WALLET_KEY generates:", localAddress);
        console.log("Production backend uses:", data.agent.address);
        console.log("\n🛠️ **SOLUTION REQUIRED:**");
        console.log("1. Check Render dashboard environment variables");
        console.log("2. Update WALLET_KEY in Render to match local");
        console.log("3. Update ENCRYPTION_KEY in Render to match local");
        console.log("4. Redeploy the Render service");
        console.log("\n💡 **VERIFICATION:**");
        console.log(
          "After updating Render env vars, the production agent should have address:",
          localAddress,
        );
      } else {
        console.log("\n✅ **ADDRESSES MATCH!**");
        console.log("The wallet keys are identical - issue must be elsewhere");
      }
    } else {
      console.error("❌ Failed to get production agent info:", data);
    }

    // Test with local backend if different
    console.log("\n📋 **LOCAL BACKEND CHECK**");
    const localBackendUrl = "http://localhost:5001";

    try {
      console.log("🔄 Fetching local agent info...");
      const localResponse = await fetch(`${localBackendUrl}/api/agent/info`);

      if (localResponse.ok) {
        const localData = (await localResponse.json()) as any;
        if (localData.success && localData.agent) {
          console.log(
            "📧 Local backend agent address:",
            localData.agent.address,
          );
          console.log("📬 Local backend inbox ID:", localData.agent.inboxId);

          const localMatch =
            localAddress.toLowerCase() ===
            localData.agent.address.toLowerCase();
          console.log(
            "🔍 Local backend match:",
            localMatch ? "YES ✅" : "NO ❌",
          );
        }
      } else {
        console.log(
          "⚠️ Local backend not running (this is normal if not started)",
        );
      }
    } catch (localError) {
      console.log(
        "⚠️ Local backend not accessible (this is normal if not started)",
      );
    }
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

main().catch(console.error);
