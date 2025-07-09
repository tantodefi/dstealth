#!/usr/bin/env tsx

/**
 * Get Agent Address for ENS Setup
 * This script calculates the Ethereum address from the WALLET_KEY
 * for setting up ENS records in production
 */
import { privateKeyToAccount } from "viem/accounts";
import { validateEnvironment } from "../src/helper.js";

function getAgentAddressFromPrivateKey(privateKey: string): string {
  // Ensure key has 0x prefix
  const sanitizedKey = privateKey.startsWith("0x")
    ? privateKey
    : `0x${privateKey}`;

  // Create account from private key
  const account = privateKeyToAccount(sanitizedKey as `0x${string}`);

  return account.address.toLowerCase();
}

async function main() {
  try {
    console.log("🔍 Getting Agent Address for ENS Setup...\n");

    // Load environment variables
    const { WALLET_KEY, XMTP_ENV } = validateEnvironment([
      "WALLET_KEY",
      "XMTP_ENV",
    ]);

    // Calculate address
    const agentAddress = getAgentAddressFromPrivateKey(WALLET_KEY);

    console.log("📋 **AGENT ADDRESS INFORMATION**");
    console.log("=====================================");
    console.log(`🌍 Environment: ${XMTP_ENV}`);
    console.log(`📧 Agent Address: ${agentAddress}`);
    console.log("=====================================\n");

    console.log("🎯 **For ENS Setup:**");
    console.log(`Set ENS record to: ${agentAddress}`);
    console.log("Example: dstealth.eth → " + agentAddress + "\n");

    console.log("💡 **Additional Info:**");
    console.log(
      "- This address is derived from WALLET_KEY environment variable",
    );
    console.log("- Same address is used for XMTP agent messaging");
    console.log("- Address is deterministic from the private key");
    console.log(
      "- Use this exact address for ENS A record or address record\n",
    );
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
