#!/usr/bin/env tsx

/**
 * Local Conversation Extractor
 *
 * Extracts and analyzes local XMTP conversations to identify real users vs test interactions
 */
import * as fs from "fs";
import * as path from "path";
import {
  Client,
  Dm,
  Group,
  type Conversation,
  type DecodedMessage,
} from "@xmtp/node-sdk";
import { createSigner, getEncryptionKeyFromHex } from "../src/helper";
import { agentDb } from "../src/lib/agent-database";

interface UserAnalysis {
  inboxId: string;
  conversationType: "dm" | "group";
  messageCount: number;
  firstMessage: Date;
  lastMessage: Date;
  hasPaymentRequests: boolean;
  hasFkeySetup: boolean;
  isTestUser: boolean;
  conversationSummary: string[];
}

interface ConversationExtract {
  conversationId: string;
  type: "dm" | "group";
  participantCount: number;
  totalMessages: number;
  agentMessages: number;
  userMessages: number;
  timespan: string;
  interactions: string[];
  paymentLinks: number;
  fkeySetups: number;
  isTestConversation: boolean;
  messages: Array<{
    timestamp: string;
    sender: string;
    isAgent: boolean;
    content: string;
    type: string;
  }>;
}

class LocalConversationExtractor {
  private client: Client | null = null;
  private agentInboxId: string | null = null;

  async initialize() {
    console.log("🔧 Initializing local XMTP client...");

    if (!process.env.WALLET_KEY || !process.env.ENCRYPTION_KEY) {
      throw new Error(
        "Missing WALLET_KEY or ENCRYPTION_KEY environment variables",
      );
    }

    const signer = createSigner(process.env.WALLET_KEY as `0x${string}`);
    const encryptionKey = getEncryptionKeyFromHex(process.env.ENCRYPTION_KEY);

    // Use local/dev environment
    const env = process.env.XMTP_ENV || "dev";
    console.log(`📊 Environment: ${env}`);

    this.client = await Client.create(signer, {
      dbEncryptionKey: encryptionKey,
      env: env as any,
    });

    this.agentInboxId = this.client.inboxId;
    console.log(`✅ Client initialized - Agent Inbox ID: ${this.agentInboxId}`);
  }

  // 🔍 Analyze if a conversation appears to be a test vs real user
  private analyzeIfTestUser(
    messages: DecodedMessage[],
    participants: string[],
  ): boolean {
    const messageContents = messages.map((m) =>
      ((m.content as string) || "").toLowerCase(),
    );

    // Test patterns
    const testPatterns = [
      /test/i,
      /debug/i,
      /hello.*world/i,
      /^gm$/i,
      /^hi$/i,
      /check/i,
    ];

    // Look for obvious test patterns
    const testMessages = messageContents.filter((content) =>
      testPatterns.some((pattern) => pattern.test(content)),
    );

    // Real user indicators
    const realUserPatterns = [
      /fkey\.id$/,
      /\$\d+/,
      /payment.*link/i,
      /stealth.*address/i,
      /fluidkey/i,
    ];

    const realUserMessages = messageContents.filter((content) =>
      realUserPatterns.some((pattern) => pattern.test(content)),
    );

    // Consider it real if has fkey/payment interactions
    if (realUserMessages.length > 0) return false;

    // Consider it a test if:
    // - More than 50% of messages match test patterns
    // - Very short conversation (< 3 messages) with test patterns
    // - Single word messages only
    const testRatio = testMessages.length / Math.max(messages.length, 1);
    const hasOnlyShortMessages = messageContents.every(
      (content) => content.length < 10,
    );
    const isVeryShort = messages.length < 3;

    return (
      testRatio > 0.5 ||
      (isVeryShort && testRatio > 0) ||
      (hasOnlyShortMessages && messages.length < 5)
    );
  }

  // 📊 Extract conversation data
  private extractConversationData(
    conversation: Conversation,
    messages: DecodedMessage[],
    participants: string[],
  ): ConversationExtract {
    const agentMessages = messages.filter(
      (m) => m.senderInboxId.toLowerCase() === this.agentInboxId?.toLowerCase(),
    );
    const userMessages = messages.filter(
      (m) => m.senderInboxId.toLowerCase() !== this.agentInboxId?.toLowerCase(),
    );

    // Analyze interactions
    const interactions: string[] = [];
    let paymentLinks = 0;
    let fkeySetups = 0;

    messages.forEach((message) => {
      const content = (message.content as string) || "";

      if (content.includes("payment") || content.includes("$")) {
        interactions.push("Payment discussion");
        if (content.includes("pay.daimo.com")) {
          paymentLinks++;
        }
      }

      if (content.includes("fkey.id") || content.includes("fluidkey")) {
        interactions.push("Fkey setup");
        fkeySetups++;
      }

      if (content.startsWith("/")) {
        interactions.push(`Command: ${content.split(" ")[0]}`);
      }
    });

    const isTest = this.analyzeIfTestUser(messages, participants);
    const firstMessage = messages.length > 0 ? messages[0].sentAt : new Date();
    const lastMessage =
      messages.length > 0 ? messages[messages.length - 1].sentAt : new Date();

    const timespan =
      messages.length > 1
        ? `${((lastMessage.getTime() - firstMessage.getTime()) / (1000 * 60)).toFixed(0)} minutes`
        : "0 minutes";

    return {
      conversationId: conversation.id,
      type: conversation instanceof Group ? "group" : "dm",
      participantCount: participants.length,
      totalMessages: messages.length,
      agentMessages: agentMessages.length,
      userMessages: userMessages.length,
      timespan,
      interactions: [...new Set(interactions)], // Remove duplicates
      paymentLinks,
      fkeySetups,
      isTestConversation: isTest,
      messages: messages.map((m) => ({
        timestamp: m.sentAt.toISOString(),
        sender: m.senderInboxId.slice(0, 8) + "...",
        isAgent:
          m.senderInboxId.toLowerCase() === this.agentInboxId?.toLowerCase(),
        content: ((m.content as string) || "").substring(0, 200), // Truncate long messages
        type: m.contentType?.typeId || "unknown",
      })),
    };
  }

  // 📋 Generate comprehensive report
  async extractAndAnalyze(): Promise<void> {
    if (!this.client) throw new Error("Client not initialized");

    console.log("📊 Extracting local conversations...");

    // Sync conversations
    await this.client.conversations.sync();
    const conversations = await this.client.conversations.list();

    console.log(`📋 Found ${conversations.length} local conversations`);

    const extracts: ConversationExtract[] = [];
    let realUserConversations = 0;
    let testConversations = 0;

    for (let i = 0; i < conversations.length; i++) {
      const conversation = conversations[i];
      console.log(
        `📊 Processing ${i + 1}/${conversations.length}: ${conversation.id.slice(0, 8)}...`,
      );

      try {
        await conversation.sync();
        const messages = await conversation.messages();

        let participants: string[] = [];
        try {
          const members = await conversation.members();
          participants = members.map((m) => m.inboxId);
        } catch (memberError) {
          console.warn(`⚠️ Could not get members for ${conversation.id}`);
          participants = []; // Will be detected as test
        }

        const extract = this.extractConversationData(
          conversation,
          messages,
          participants,
        );
        extracts.push(extract);

        if (extract.isTestConversation) {
          testConversations++;
        } else {
          realUserConversations++;
        }
      } catch (error) {
        console.error(
          `❌ Failed to process conversation ${conversation.id}:`,
          error,
        );
      }
    }

    // Generate report
    const report = {
      extractedAt: new Date().toISOString(),
      environment: process.env.XMTP_ENV || "dev",
      agentInboxId: this.agentInboxId,
      summary: {
        totalConversations: conversations.length,
        realUserConversations,
        testConversations,
        totalMessages: extracts.reduce((sum, e) => sum + e.totalMessages, 0),
        totalPaymentLinks: extracts.reduce((sum, e) => sum + e.paymentLinks, 0),
        totalFkeySetups: extracts.reduce((sum, e) => sum + e.fkeySetups, 0),
      },
      conversations: extracts,
    };

    // Save detailed report
    const outputDir = ".data/local-extract";
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().split("T")[0];
    const reportPath = path.join(
      outputDir,
      `local-conversations-${timestamp}.json`,
    );
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    // Generate human-readable summary
    const summaryPath = path.join(
      outputDir,
      `conversation-summary-${timestamp}.txt`,
    );
    const summary = this.generateReadableSummary(report);
    fs.writeFileSync(summaryPath, summary);

    console.log("\n📊 EXTRACTION COMPLETE:");
    console.log("=======================");
    console.log(`📁 Detailed Report: ${reportPath}`);
    console.log(`📝 Summary: ${summaryPath}`);
    console.log(`👥 Real Users: ${realUserConversations}`);
    console.log(`🧪 Test Conversations: ${testConversations}`);
    console.log(`💬 Total Messages: ${report.summary.totalMessages}`);
    console.log(`💰 Payment Links: ${report.summary.totalPaymentLinks}`);
    console.log(`🔑 Fkey Setups: ${report.summary.totalFkeySetups}`);
  }

  // 📝 Generate human-readable summary
  private generateReadableSummary(report: any): string {
    const lines = [];

    lines.push("🤖 LOCAL XMTP CONVERSATION ANALYSIS");
    lines.push("".padEnd(50, "="));
    lines.push("");

    lines.push("📊 SUMMARY:");
    lines.push(`   Extracted: ${report.extractedAt}`);
    lines.push(`   Environment: ${report.environment}`);
    lines.push(`   Agent Inbox: ${report.agentInboxId}`);
    lines.push(`   Total Conversations: ${report.summary.totalConversations}`);
    lines.push(`   👥 Real Users: ${report.summary.realUserConversations}`);
    lines.push(`   🧪 Test Conversations: ${report.summary.testConversations}`);
    lines.push(`   💬 Total Messages: ${report.summary.totalMessages}`);
    lines.push(`   💰 Payment Links: ${report.summary.totalPaymentLinks}`);
    lines.push(`   🔑 Fkey Setups: ${report.summary.totalFkeySetups}`);
    lines.push("");

    // Real user conversations
    const realConvos = report.conversations.filter(
      (c: any) => !c.isTestConversation,
    );
    if (realConvos.length > 0) {
      lines.push("👥 REAL USER CONVERSATIONS:");
      lines.push("".padEnd(30, "-"));

      realConvos.forEach((conv: any) => {
        lines.push(
          `🔍 ${conv.conversationId.slice(0, 8)}... (${conv.type.toUpperCase()})`,
        );
        lines.push(
          `   Messages: ${conv.totalMessages} (${conv.userMessages} user, ${conv.agentMessages} agent)`,
        );
        lines.push(`   Duration: ${conv.timespan}`);
        lines.push(
          `   Interactions: ${conv.interactions.join(", ") || "Basic chat"}`,
        );
        if (conv.paymentLinks > 0)
          lines.push(`   💰 Payment Links: ${conv.paymentLinks}`);
        if (conv.fkeySetups > 0)
          lines.push(`   🔑 Fkey Setups: ${conv.fkeySetups}`);
        lines.push("");
      });
    }

    // Test conversations summary
    const testConvos = report.conversations.filter(
      (c: any) => c.isTestConversation,
    );
    if (testConvos.length > 0) {
      lines.push("🧪 TEST CONVERSATIONS:");
      lines.push("".padEnd(30, "-"));
      lines.push(`   Count: ${testConvos.length}`);
      lines.push(
        `   Total Messages: ${testConvos.reduce((sum: number, c: any) => sum + c.totalMessages, 0)}`,
      );
      lines.push("");
    }

    return lines.join("\n");
  }
}

// 🚀 Main execution
async function main() {
  console.log("📊 Local XMTP Conversation Extractor");
  console.log("====================================\n");

  const extractor = new LocalConversationExtractor();

  try {
    await extractor.initialize();
    await extractor.extractAndAnalyze();
  } catch (error) {
    console.error("❌ Extraction failed:", error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
