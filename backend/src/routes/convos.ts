import { ReclaimClient } from "@reclaimprotocol/zk-fetch";
import express from "express";
import { env } from "../config/env.js";

const router = express.Router();

// Initialize Reclaim client
const reclaimClient = new ReclaimClient(
  env.RECLAIM_APP_ID,
  env.RECLAIM_APP_SECRET
);

router.get("/lookup/:username", async (req, res) => {
  const { username } = req.params;
  let xmtpId: string | null = null;
  let profile: any = null;
  let zkProof = null;
  let zkProofMultiple: any[] = [];
  let html: string = "";

  try {
    const url = `https://${username}.convos.org`;
    console.log("\n=== CONVOS.ORG LOOKUP START ===");
    console.log(`🔍 Looking up profile for ${username} at ${url}`);

    // First try with zkfetch to get ZK-proof
    try {
      console.log("\n📡 Attempting zkfetch...");
      console.log("🔧 Reclaim Config:", {
        appId: env.RECLAIM_APP_ID.slice(0, 10) + "...",
        hasSecret: !!env.RECLAIM_APP_SECRET,
        url: url
      });
      
      // First attempt: Decentralized zkfetch with multiple attestors
      let response;
      let isDecentralized = false;
      
      try {
        console.log("🏗️ Attempting decentralized zkfetch with multiple attestors...");
        response = await reclaimClient.zkFetch(
          url,
          {
            method: "GET",
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; zkfetch/1.0)'
            }
          },
          {
            responseMatches: [
              {
                type: "regex",
                value: `"xmtpId":"[a-zA-Z0-9]+",.*"username":"${username}"`,
              },
            ],
          },
          true, // isDecentralised: Enable multiple witness attestors
        );
        isDecentralized = true;
        console.log("✅ Decentralized zkfetch successful");
      } catch (decentralizedError: unknown) {
        console.log("⚠️ Decentralized zkfetch failed, trying single attestor fallback...");
        console.log("Error:", decentralizedError instanceof Error ? decentralizedError.message : String(decentralizedError));
        
        // Fallback: Single attestor zkfetch
        try {
          console.log("🔄 Attempting single attestor zkfetch...");
          response = await reclaimClient.zkFetch(
            url,
            {
              method: "GET",
              headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; zkfetch/1.0)'
              }
            },
            {
              responseMatches: [
                {
                  type: "regex",
                  value: `"xmtpId":"[a-zA-Z0-9]+",.*"username":"${username}"`,
                },
              ],
            },
            false, // isDecentralised: Single attestor mode
          );
          isDecentralized = false;
          console.log("✅ Single attestor zkfetch successful");
        } catch (singleAttestorError: unknown) {
          console.log("❌ Single attestor zkfetch also failed");
          console.log("Error:", singleAttestorError instanceof Error ? singleAttestorError.message : String(singleAttestorError));
          throw singleAttestorError; // Rethrow to trigger the outer catch
        }
      }

      console.log("📊 Response type:", Array.isArray(response) ? 'array' : typeof response);
      console.log("📊 Response length:", Array.isArray(response) ? response.length : 'N/A');
      console.log("📊 Attestor mode:", isDecentralized ? 'decentralized' : 'single');

      // Handle multiple proofs from decentralized attestors or single proof
      const proofs = Array.isArray(response) ? response : [response];
      console.log(`🏗️ Processing ${proofs.length} proofs from attestors`);

      // Find first valid proof structure
      const validProof = proofs.find(proof => 
        proof &&
        proof.claimData &&
        proof.signatures?.length &&
        proof.witnesses?.length
      );

      if (validProof) {
        console.log("✅ Valid proof structure found from attestors");
        zkProof = {
          ...validProof,
          attestorCount: proofs.length, // Track number of attestors
          isDecentralized: isDecentralized, // Track the mode used
        };
        
        // Store all proofs for frontend multi-proof handling
        zkProofMultiple = proofs.filter(proof => 
          proof &&
          proof.claimData &&
          proof.signatures?.length &&
          proof.witnesses?.length
        );
      } else {
        console.log("❌ No valid proof structure found in any attestor response");
        console.log("🔍 Proof structures:", proofs.map(p => ({
          hasClaimData: !!p?.claimData,
          hasSignatures: !!p?.signatures?.length,
          hasWitnesses: !!p?.witnesses?.length
        })));
        // If we can't get a valid proof structure, this should be considered a failure
        throw new Error("No valid ZK proof structure found");
      }

      // Get HTML content for parsing
      console.log("\n🌐 Fetching HTML content...");
      const fetchResponse = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; dstealth/1.0)'
        }
      });
      html = await fetchResponse.text();
      console.log("✅ HTML content fetched, length:", html.length);
    } catch (zkError: unknown) {
      // Enhanced error logging for debugging
      console.log("\n❌ ZK Proof generation completely failed:");
      console.log("Error type:", zkError instanceof Error ? zkError.constructor.name : typeof zkError);
      console.log("Error message:", zkError instanceof Error ? zkError.message : String(zkError));
      if (zkError instanceof Error && zkError.stack) {
        console.log("Error stack:", zkError.stack.split('\n').slice(0, 5).join('\n'));
      }
      
      // Check if it's a specific AttestorError
      const errorMessage = zkError instanceof Error ? zkError.message : String(zkError);
      const errorName = zkError instanceof Error ? zkError.constructor.name : '';
      if (errorMessage.includes('AttestorError') || errorName === 'AttestorError') {
        console.log("🔍 AttestorError detected - this may be due to:");
        console.log("  - Network connectivity issues");
        console.log("  - Reclaim service temporary unavailability");
        console.log("  - Invalid response matching criteria");
        console.log("  - Attestor consensus failure");
      }
      
      // ZK proof is mandatory - fail the lookup if we can't generate any proof
      console.log("💥 LOOKUP FAILED: ZK proof generation is mandatory but failed on both decentralized and single attestor modes");
      res.status(500).json({
        error: "ZK proof generation failed",
        details: "Unable to generate cryptographic proof for this profile",
        zkProofRequired: true,
        attestorError: errorMessage.includes('AttestorError') || errorName === 'AttestorError'
      });
      return;
    }

    // Look for the __NEXT_DATA__ script tag
    console.log("\n🔎 Looking for Next.js data script tag...");
    const nextDataMatch = html.match(
      /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
    );

    if (nextDataMatch) {
      console.log("✅ Found Next.js data script tag");
      try {
        const nextData = JSON.parse(nextDataMatch[1]);
        // Look through the props for profile data
        const props = nextData?.props?.pageProps;
        if (props?.profile?.xmtpId) {
          xmtpId = props.profile.xmtpId;
          profile = props.profile;
          console.log("✅ Found XMTP ID in Next.js data:", xmtpId);
          console.log("✅ Found profile:", profile);
        } else {
          console.log("❌ No XMTP ID found in profile data");
          console.log("Props structure:", JSON.stringify(props, null, 2));
        }
      } catch (e) {
        console.log("❌ Failed to parse Next.js data:", e);
      }
    } else {
      console.log("❌ No Next.js data script tag found");
    }

    if (xmtpId) {
      console.log("\n✅ Successfully found XMTP ID:", xmtpId);
      console.log("=== CONVOS.ORG LOOKUP END ===\n");
      res.json({
        success: true,
        xmtpId,
        username,
        url: `https://${username}.convos.org`,
        profile: {
          name: profile.name,
          username: profile.username,
          description: profile.description,
          avatar: profile.avatar,
          address: profile.turnkeyAddress,
        },
        proof: zkProof,
        proofs: zkProofMultiple, // Include all proofs for frontend
      });
    } else {
      console.log("\n❌ No XMTP ID found");
      console.log("=== CONVOS.ORG LOOKUP END ===\n");
      res.status(404).json({
        success: false,
        error: "XMTP ID not found",
      });
    }
  } catch (error) {
    console.error("\n❌ Error in convos lookup:", error);
    console.log("=== CONVOS.ORG LOOKUP END WITH ERROR ===\n");
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
