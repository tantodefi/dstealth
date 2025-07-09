#!/usr/bin/env tsx

/**
 * Payment Link Security Analyzer
 *
 * Analyzes all payment links created to identify security issues:
 * - Links created with stale fkey.id data (security vulnerability)
 * - Links created with fresh data verification (secure)
 * - Failed link attempts and reasons
 */
import * as fs from "fs";
import * as path from "path";

interface PaymentLinkAnalysis {
  messageId: string;
  conversationId: string;
  timestamp: string;
  requestAmount: string;
  status: "successful" | "failed" | "error";
  daimoLink?: string;
  stealthAddress?: string;
  fkeyId?: string;
  hasFreshDataVerification: boolean;
  hasLiveDataIndicator: boolean;
  securityStatus: "secure" | "potentially_stale" | "failed" | "error";
  securityIssues: string[];
  fullContent: string;
}

class PaymentLinkAnalyzer {
  // 🔍 Extract payment amount from user message
  private extractPaymentAmount(content: string): string | null {
    const patterns = [
      /create.*payment.*link.*for.*\$(\d+(?:\.\d{2})?)/i,
      /payment.*link.*for.*\$(\d+(?:\.\d{2})?)/i,
      /\$(\d+(?:\.\d{2})?).*payment/i,
      /\$(\d+(?:\.\d{2})?)(?:\s|$)/,
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  // 🔍 Analyze agent response for payment link creation
  private analyzeAgentResponse(content: string): {
    status: "successful" | "failed" | "error";
    daimoLink?: string;
    stealthAddress?: string;
    fkeyId?: string;
    hasFreshDataVerification: boolean;
    hasLiveDataIndicator: boolean;
    securityIssues: string[];
  } {
    const result = {
      status: "error" as const,
      hasFreshDataVerification: false,
      hasLiveDataIndicator: false,
      securityIssues: [] as string[],
    };

    // Check for successful payment link
    const daimoMatch = content.match(
      /(https:\/\/pay\.daimo\.com\/checkout\?id=[^\s\n\)]+)/,
    );
    if (daimoMatch) {
      result.status = "successful";
      result.daimoLink = daimoMatch[1];
    }

    // Check for failure
    else if (
      content.includes("Payment Link Creation Failed") ||
      content.includes("❌")
    ) {
      result.status = "failed";
    }

    // Extract stealth address
    const stealthMatch =
      content.match(/(?:Stealth Address|Live Stealth Address)[^`]*`([^`]+)`/) ||
      content.match(/🥷.*?([0-9x][0-9a-fA-F]{3,})/);
    if (stealthMatch) {
      result.stealthAddress = stealthMatch[1];
    }

    // Extract fkey.id
    const fkeyMatch = content.match(/([a-z0-9._-]+\.fkey\.id)/i);
    if (fkeyMatch) {
      result.fkeyId = fkeyMatch[1];
    }

    // 🔥 CRITICAL: Check for fresh data verification indicators
    result.hasFreshDataVerification =
      content.includes("Fresh Data") || content.includes("fresh data");
    result.hasLiveDataIndicator =
      content.includes("Live Stealth Address") || content.includes("Live Data");

    // Security issue analysis
    if (result.status === "successful") {
      if (!result.hasFreshDataVerification && !result.hasLiveDataIndicator) {
        result.securityIssues.push(
          "Payment link created without fresh fkey.id verification",
        );
      }

      if (content.includes("0x706AfBE28b1e1CB40cd552Fa53A380f658e38332")) {
        result.securityIssues.push("Uses hardcoded fallback address");
      }

      if (content.includes("localhost")) {
        result.securityIssues.push("Contains localhost URL in production");
      }
    }

    return result;
  }

  // 📊 Analyze conversation data for payment links
  analyzeConversationData(conversationData: any): PaymentLinkAnalysis[] {
    const paymentLinks: PaymentLinkAnalysis[] = [];
    const messages = conversationData.messages || [];

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];

      // Skip non-user messages for payment requests
      if (message.isAgent) continue;

      const paymentAmount = this.extractPaymentAmount(message.content);
      if (!paymentAmount) continue;

      // Find the next agent response
      let agentResponse = null;
      for (let j = i + 1; j < messages.length && j < i + 3; j++) {
        if (messages[j].isAgent) {
          agentResponse = messages[j];
          break;
        }
      }

      if (!agentResponse) continue;

      const analysis = this.analyzeAgentResponse(agentResponse.content);

      const securityStatus =
        analysis.status === "successful"
          ? analysis.securityIssues.length > 0
            ? "potentially_stale"
            : "secure"
          : analysis.status;

      paymentLinks.push({
        messageId: `${message.timestamp}-${i}`,
        conversationId: conversationData.conversationId,
        timestamp: message.timestamp,
        requestAmount: paymentAmount,
        status: analysis.status,
        daimoLink: analysis.daimoLink,
        stealthAddress: analysis.stealthAddress,
        fkeyId: analysis.fkeyId,
        hasFreshDataVerification: analysis.hasFreshDataVerification,
        hasLiveDataIndicator: analysis.hasLiveDataIndicator,
        securityStatus,
        securityIssues: analysis.securityIssues,
        fullContent: agentResponse.content.substring(0, 500), // Truncate for readability
      });
    }

    return paymentLinks;
  }

  // 📋 Generate comprehensive payment link report
  async generatePaymentLinkReport(): Promise<void> {
    console.log("🔍 Payment Link Security Analysis");
    console.log("=================================\n");

    // Read the conversation data
    const dataPath = ".data/local-extract/local-conversations-2025-07-03.json";

    if (!fs.existsSync(dataPath)) {
      console.error(
        "❌ Conversation data not found. Run yarn extract:local first.",
      );
      return;
    }

    const conversationData = JSON.parse(fs.readFileSync(dataPath, "utf8"));

    console.log("📊 Analyzing payment links from conversations...");

    const allPaymentLinks: PaymentLinkAnalysis[] = [];

    // Analyze each conversation
    for (const conversation of conversationData.conversations) {
      const links = this.analyzeConversationData(conversation);
      allPaymentLinks.push(...links);
    }

    console.log(`📋 Found ${allPaymentLinks.length} payment link attempts\n`);

    // Categorize links
    const successful = allPaymentLinks.filter(
      (link) => link.status === "successful",
    );
    const failed = allPaymentLinks.filter((link) => link.status === "failed");
    const secureLinks = successful.filter(
      (link) => link.securityStatus === "secure",
    );
    const staleLinks = successful.filter(
      (link) => link.securityStatus === "potentially_stale",
    );

    // Generate summary
    console.log("📊 PAYMENT LINK SUMMARY:");
    console.log("========================");
    console.log(`Total Attempts: ${allPaymentLinks.length}`);
    console.log(`✅ Successful: ${successful.length}`);
    console.log(`❌ Failed: ${failed.length}`);
    console.log(`🔒 Secure (Fresh Data): ${secureLinks.length}`);
    console.log(`⚠️  Potentially Stale: ${staleLinks.length}`);
    console.log("");

    // Security analysis
    if (staleLinks.length > 0) {
      console.log("🚨 SECURITY ISSUES FOUND:");
      console.log("=========================");
      staleLinks.forEach((link, index) => {
        console.log(
          `${index + 1}. Amount: $${link.requestAmount} | Time: ${link.timestamp}`,
        );
        console.log(`   Daimo Link: ${link.daimoLink || "N/A"}`);
        console.log(`   Issues: ${link.securityIssues.join(", ")}`);
        console.log(`   Conversation: ${link.conversationId.slice(0, 8)}...`);
        console.log("");
      });
    } else {
      console.log("✅ No security issues found in successful payment links!");
    }

    // Save detailed report
    const outputDir = ".data/payment-analysis";
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().split("T")[0];
    const reportPath = path.join(
      outputDir,
      `payment-link-analysis-${timestamp}.json`,
    );

    const report = {
      analyzedAt: new Date().toISOString(),
      summary: {
        totalAttempts: allPaymentLinks.length,
        successful: successful.length,
        failed: failed.length,
        secureLinks: secureLinks.length,
        staleLinks: staleLinks.length,
        securityIssuesFound: staleLinks.length > 0,
      },
      links: allPaymentLinks,
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    // Generate human-readable report
    const readablePath = path.join(
      outputDir,
      `payment-security-report-${timestamp}.txt`,
    );
    const readableReport = this.generateReadableReport(report);
    fs.writeFileSync(readablePath, readableReport);

    console.log("📁 REPORTS SAVED:");
    console.log(`   JSON: ${reportPath}`);
    console.log(`   Summary: ${readablePath}`);

    if (staleLinks.length > 0) {
      console.log("\n⚠️  RECOMMENDATION: Check stale payment links manually");
      console.log(
        "   These links may have been created with outdated fkey.id data",
      );
    }
  }

  // 📝 Generate human-readable report
  private generateReadableReport(report: any): string {
    const lines = [];

    lines.push("🔐 PAYMENT LINK SECURITY ANALYSIS");
    lines.push("".padEnd(50, "="));
    lines.push("");

    lines.push("📊 SUMMARY:");
    lines.push(`   Analyzed: ${report.analyzedAt}`);
    lines.push(`   Total Payment Attempts: ${report.summary.totalAttempts}`);
    lines.push(`   ✅ Successful Links: ${report.summary.successful}`);
    lines.push(`   ❌ Failed Attempts: ${report.summary.failed}`);
    lines.push(
      `   🔒 Secure Links (Fresh Data): ${report.summary.secureLinks}`,
    );
    lines.push(`   ⚠️  Potentially Stale Links: ${report.summary.staleLinks}`);
    lines.push(
      `   🚨 Security Issues Found: ${report.summary.securityIssuesFound ? "YES" : "NO"}`,
    );
    lines.push("");

    if (report.summary.secureLinks > 0) {
      lines.push("✅ SECURE PAYMENT LINKS:");
      lines.push("".padEnd(30, "-"));
      const secureLinks = report.links.filter(
        (l: any) => l.securityStatus === "secure",
      );
      secureLinks.forEach((link: any, i: number) => {
        lines.push(`${i + 1}. $${link.requestAmount} | ${link.timestamp}`);
        lines.push(`   ✅ Fresh data verification confirmed`);
        lines.push(`   🔗 ${link.daimoLink}`);
        lines.push("");
      });
    }

    if (report.summary.staleLinks > 0) {
      lines.push("⚠️  POTENTIALLY STALE PAYMENT LINKS:");
      lines.push("".padEnd(40, "-"));
      const staleLinks = report.links.filter(
        (l: any) => l.securityStatus === "potentially_stale",
      );
      staleLinks.forEach((link: any, i: number) => {
        lines.push(`${i + 1}. $${link.requestAmount} | ${link.timestamp}`);
        lines.push(`   Issues: ${link.securityIssues.join(", ")}`);
        lines.push(`   🔗 ${link.daimoLink}`);
        lines.push(`   🏠 Stealth: ${link.stealthAddress}`);
        lines.push(`   📧 Fkey: ${link.fkeyId}`);
        lines.push("");
      });
    }

    if (report.summary.failed > 0) {
      lines.push("❌ FAILED PAYMENT ATTEMPTS:");
      lines.push("".padEnd(30, "-"));
      const failedLinks = report.links.filter(
        (l: any) => l.status === "failed",
      );
      lines.push(`   Count: ${failedLinks.length}`);
      lines.push(`   Common Issues: API errors, missing fkey.id setup`);
      lines.push("");
    }

    return lines.join("\n");
  }
}

// 🚀 Main execution
async function main() {
  const analyzer = new PaymentLinkAnalyzer();

  try {
    await analyzer.generatePaymentLinkReport();
  } catch (error) {
    console.error("❌ Analysis failed:", error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
