import { ReclaimClient } from "@reclaimprotocol/zk-fetch";
import { Router } from "express";
import { env } from "../config/env.js";
import { agentDb } from "../lib/agent-database.js";

// Import Redis for ZK receipt storage
import { Redis } from "@upstash/redis";

const router = Router();

// Initialize Redis client for ZK receipt storage
let redis: Redis | null = null;
try {
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    redis = new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
} catch (error) {
  console.warn('⚠️ Failed to initialize Redis for ZK receipts:', error);
}

// Initialize Reclaim client with better error handling
const reclaimClient = new ReclaimClient(
  env.RECLAIM_APP_ID,
  env.RECLAIM_APP_SECRET
);

// Store claimed fkey.ids in memory (should be moved to a database in production)
const claimedFkeys = new Map<string, string>(); // fkeyId -> owner address

interface WalletMapping {
  fkeyId: string;
  wallets: {
    ethereum?: string;       // Primary Ethereum address
    coinbase?: string;       // Coinbase wallet address  
    farcaster?: {           // Farcaster wallet from FID
      address: string;
      fid: number;
      username?: string;
    };
    base?: string;          // Base.eth ENS address
    stealth?: string[];     // Multiple stealth addresses
  };
  metadata: {
    createdAt: number;
    updatedAt: number;
    verified: boolean;
    primaryWallet: string;  // Which wallet is primary
  };
}

// Store wallet mappings (should be moved to database in production)
const walletMappings = new Map<string, WalletMapping>(); // fkeyId -> WalletMapping

router.get("/lookup/:username", async (req, res) => {
  const { username } = req.params;
  const { userAddress, source } = req.query; // Add query parameters for ZK receipt storage
  const userAddressStr = typeof userAddress === 'string' ? userAddress : '';
  const url = `https://${username}.fkey.id`;

  console.log("\n=== FKEY.ID LOOKUP START ===");
  console.log(`🔍 Looking up profile for ${username} at ${url}`);
  console.log(`📍 Request source: ${source || 'unknown'}, User address: ${userAddressStr || 'unknown'}`);

  try {
    let html;
    let zkProof = null;
    let zkProofMultiple: any[] = []; // New variable to store multiple proofs

    // First try with zkfetch
    try {
      console.log("\n📡 Attempting zkfetch...");
      console.log("🔧 Reclaim Config:", {
        appId: env.RECLAIM_APP_ID.slice(0, 10) + "...",
        hasSecret: !!env.RECLAIM_APP_SECRET,
        url: url
      });
      
      // Use single attestor for fkey.id lookup (more reliable)
      let response;
      let isDecentralized = false;
      
      try {
        console.log("🔄 Using single attestor zkfetch for fkey.id (more reliable)...");
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
                value: "0x[a-fA-F0-9]{40}",
              },
            ],
          },
          false, // isDecentralised: Single attestor mode for fkey.id
        );
        isDecentralized = false;
        console.log("✅ Single attestor zkfetch successful for fkey.id");
      } catch (singleAttestorError: unknown) {
        console.log("❌ Single attestor zkfetch failed for fkey.id");
        console.log("Error:", singleAttestorError instanceof Error ? singleAttestorError.message : String(singleAttestorError));
        throw singleAttestorError; // Rethrow to trigger the outer catch
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

      // Get the HTML from the response
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

    console.log("\n🔎 Starting address search in HTML...");

    let address = null;

    // First try to find address in Next.js hydration data
    console.log("\n1️⃣ Checking Next.js data script tag...");
    const nextDataMatch = html.match(
      /<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s,
    );
    if (nextDataMatch) {
      console.log("Found Next.js data script tag");
      try {
        const nextData = JSON.parse(nextDataMatch[1]);
        console.log("Next.js data parsed successfully");
        // Look through the props for address
        const props = nextData?.props?.pageProps;
        if (props?.address) {
          address = props.address.toLowerCase();
          console.log("✅ Found address in Next.js data:", address);
        } else {
          console.log("❌ No address found in Next.js data props");
        }
      } catch (e) {
        console.log("❌ Failed to parse Next.js data:", e);
      }
    } else {
      console.log("❌ No Next.js data script tag found");
    }

    // If still no address, try the main HTML content
    if (!address) {
      console.log("\n3️⃣ Searching main HTML content...");
      const patterns = [
        /(0x[a-fA-F0-9]{40})/i,
        /data-address="(0x[a-fA-F0-9]{40})"/i,
        /href="[^"]*?(0x[a-fA-F0-9]{40})[^"]*?"/i,
        /content="[^"]*?(0x[a-fA-F0-9]{40})[^"]*?"/i,
        /value="(0x[a-fA-F0-9]{40})"/i,
      ];

      for (const pattern of patterns) {
        console.log("Trying pattern:", pattern);
        const match = html.match(pattern);
        if (match && match[1]) {
          address = match[1].toLowerCase();
          console.log("✅ Found address in HTML content:", address);
          console.log(
            "Match context:",
            html.slice(
              Math.max(0, html.indexOf(match[1]) - 50),
              Math.min(html.length, html.indexOf(match[1]) + 50),
            ),
          );
          break;
        }
      }

      if (!address) {
        console.log("❌ No address found in main HTML content");
      }
    }

    if (!address) {
      console.log("\n❌ No Ethereum address found anywhere in the content");
      return res.json({
        isRegistered: false,
        error: "No Ethereum address found",
      });
    }

    console.log("\n✅ Successfully found address:", address);
    
    // 🔧 ENHANCED: Save ZK receipt for agent lookups and frontend fkey.id setting actions
    const sourceStr = typeof source === 'string' ? source : '';
    const isAgentLookup = sourceStr && !sourceStr.startsWith('frontend');
    const isFrontendSetting = sourceStr && sourceStr.includes('frontend-settings');
    
    if (zkProof && redis && (isAgentLookup || isFrontendSetting)) {
      const receiptType = isFrontendSetting ? 'frontend fkey.id setting' : 'agent fkey.id lookup';
      
      try {
        console.log(`\n🧾 Saving ZK receipt for ${receiptType}...`);
        
        // Use userAddress from query param or fallback to resolved address
        const effectiveUserAddress = userAddressStr || address;
        const zkReceiptKey = `zk_receipt:fkey_${isFrontendSetting ? 'setup' : 'lookup'}_${username}:${effectiveUserAddress.toLowerCase()}:${Date.now()}`;
        
        const zkReceiptData = {
          fkeyId: username,
          stealthAddress: address,
          userAddress: effectiveUserAddress,
          zkProof: zkProof,
          timestamp: Date.now(),
          status: 'proof_generated',
          source: sourceStr || 'api_lookup',
          metadata: {
            transactionType: isFrontendSetting ? "fkey.id Setup" : "fkey.id Lookup",
            privacyFeature: "stealth-address",
            zkProofAvailable: true,
            lookupUrl: url,
            attestorCount: zkProof.attestorCount || 1,
            isDecentralized: zkProof.isDecentralized || false,
            requestSource: sourceStr || 'api_lookup',
            actionType: isFrontendSetting ? 'user_setup' : 'agent_lookup'
          }
        };
        
        // Store in Redis for frontend access (expires in 7 days - local-first system)
        await redis.set(zkReceiptKey, JSON.stringify(zkReceiptData), { ex: 86400 * 7 });
        console.log(`✅ ZK receipt saved for ${receiptType}: ${zkReceiptKey}`);
      } catch (receiptError) {
        console.warn(`⚠️ Failed to save ZK receipt for ${receiptType}:`, receiptError);
        // Don't fail the lookup if receipt storage fails
      }
    } else if (sourceStr && sourceStr.startsWith('frontend') && !sourceStr.includes('settings')) {
      console.log("\n🔍 Frontend lookup detected - ZK receipt will be saved only when address is used for payments");
    }
    
    console.log("=== FKEY.ID LOOKUP END ===\n");
    return res.json({
      isRegistered: true,
      address: address,
      proof: zkProof, // Include the proof for verification
      proofs: zkProofMultiple, // Include multiple proofs for verification
    });
  } catch (error: unknown) {
    console.error("\n❌ Error looking up profile:", error);
    console.log("=== FKEY.ID LOOKUP END WITH ERROR ===\n");
    return res.json({
      isRegistered: false,
      error: "Failed to lookup profile",
    });
  }
});

router.post("/map-wallets/:fkeyId", async (req, res) => {
  try {
    const { fkeyId } = req.params;
    const { wallets, primaryWallet } = req.body;

    console.log(`🔗 Mapping multiple wallets for ${fkeyId}`);
    console.log("Wallets to map:", wallets);

    // Validate at least one wallet is provided
    if (!wallets || Object.keys(wallets).length === 0) {
      return res.status(400).json({
        success: false,
        error: "At least one wallet address must be provided"
      });
    }

    // Validate primary wallet is specified
    if (!primaryWallet || !wallets[primaryWallet]) {
      return res.status(400).json({
        success: false,
        error: "Primary wallet must be specified and exist in wallet list"
      });
    }

    // Check if fkey.id exists by fetching its current data
    const url = `https://${fkeyId}.fkey.id`;
    let existingAddress: string | null = null;
    
    try {
      const response = await fetch(url);
      const html = await response.text();
      existingAddress = findAddressInJson(html);
    } catch (error) {
      return res.status(404).json({
        success: false,
        error: `${fkeyId}.fkey.id does not exist or is not accessible`
      });
    }

    if (!existingAddress) {
      return res.status(404).json({
        success: false,
        error: `No Ethereum address found for ${fkeyId}.fkey.id`
      });
    }

    // Verify the primary wallet matches the existing address (for security)
    const primaryAddress = wallets[primaryWallet];
    if (primaryAddress.toLowerCase() !== existingAddress.toLowerCase()) {
      return res.status(403).json({
        success: false,
        error: "Primary wallet must match the current fkey.id owner for security"
      });
    }

    // Create or update wallet mapping
    const mapping: WalletMapping = {
      fkeyId,
      wallets,
      metadata: {
        createdAt: walletMappings.has(fkeyId) ? walletMappings.get(fkeyId)!.metadata.createdAt : Date.now(),
        updatedAt: Date.now(),
        verified: true, // Verified since primary wallet matches
        primaryWallet
      }
    };

    walletMappings.set(fkeyId, mapping);

    console.log(`✅ Successfully mapped ${Object.keys(wallets).length} wallets for ${fkeyId}`);

    return res.json({
      success: true,
      mapping,
      message: `Successfully mapped ${Object.keys(wallets).length} wallets to ${fkeyId}.fkey.id`
    });

  } catch (error: unknown) {
    console.error("❌ Error mapping wallets:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    });
  }
});

// Get wallet mappings for a fkey.id  
router.get("/wallets/:fkeyId", async (req, res) => {
  try {
    const { fkeyId } = req.params;
    const mapping = walletMappings.get(fkeyId);

    if (!mapping) {
      return res.status(404).json({
        success: false,
        error: `No wallet mappings found for ${fkeyId}.fkey.id`
      });
    }

    return res.json({
      success: true,
      mapping,
      totalWallets: Object.keys(mapping.wallets).length
    });

  } catch (error: unknown) {
    console.error("❌ Error retrieving wallet mappings:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    });
  }
});

// Smart search for @mentions - finds fkey.id from various sources
router.post("/search/mention", async (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        error: "Search query is required"
      });
    }

    console.log(`🔍 Smart search for mention: ${query}`);

    const results: any[] = [];
    
    // Handle @dstealth specifically
    if (query.toLowerCase().includes('@dstealth')) {
      results.push({
        type: 'dstealth',
        fkeyId: 'dstealth',
        frameUrl: 'https://app.fluidkey.com/?ref=62YNSG',
        metadata: {
          name: 'dStealth',
          description: 'Private payments & content creation',
          verified: true
        }
      });
    }

    // Handle @.base.eth pattern
    const baseEthMatch = query.match(/@([a-zA-Z0-9-_]+)\.base\.eth/i);
    if (baseEthMatch) {
      const baseName = baseEthMatch[1];
      console.log(`🔍 Found Base.eth mention: ${baseName}.base.eth`);
      
      // Try to resolve Base.eth to fkey.id
      try {
        // Check if this Base.eth name has a mapped fkey.id
        for (const [fkeyId, mapping] of walletMappings.entries()) {
          if (mapping.wallets.base?.toLowerCase() === `${baseName}.base.eth`.toLowerCase()) {
            results.push({
              type: 'base.eth',
              baseName: `${baseName}.base.eth`,
              fkeyId: fkeyId,
              frameUrl: `https://app.fluidkey.com/${fkeyId}`,
              metadata: {
                name: fkeyId,
                description: `Base.eth user with fkey.id: ${fkeyId}`,
                verified: mapping.metadata.verified,
                wallets: Object.keys(mapping.wallets).length
              }
            });
            break;
          }
        }
        
        // If no mapping found, still return the Base.eth info
        if (results.length === 0 || !results.some(r => r.baseName === `${baseName}.base.eth`)) {
          results.push({
            type: 'base.eth',
            baseName: `${baseName}.base.eth`,
            fkeyId: null,
            frameUrl: null,
            metadata: {
              name: `${baseName}.base.eth`,
              description: 'Base.eth name - fkey.id not mapped yet',
              verified: false
            }
          });
        }
      } catch (error) {
        console.log(`⚠️ Error resolving Base.eth: ${error}`);
      }
    }

    // Handle regular @username pattern - check if it's a known fkey.id
    const usernameMatch = query.match(/@([a-zA-Z0-9-_]+)/);
    if (usernameMatch && !query.includes('.base.eth') && !query.includes('dstealth')) {
      const username = usernameMatch[1];
      console.log(`🔍 Checking if @${username} is a fkey.id`);
      
      try {
        // Check if this username.fkey.id exists
        const url = `https://${username}.fkey.id`;
        const response = await fetch(url);
        
        if (response.ok) {
          const html = await response.text();
          const address = findAddressInJson(html);
          
          if (address) {
            const mapping = walletMappings.get(username);
            results.push({
              type: 'fkey.id',
              fkeyId: username,
              frameUrl: `https://app.fluidkey.com/${username}`,
              metadata: {
                name: `${username}.fkey.id`,
                description: `fkey.id user: ${username}`,
                address: address,
                verified: true,
                hasWalletMapping: !!mapping,
                wallets: mapping ? Object.keys(mapping.wallets).length : 1
              }
            });
          }
        }
      } catch (error) {
        console.log(`⚠️ Error checking fkey.id for @${username}:`, error);
      }
    }

    console.log(`✅ Smart search found ${results.length} result(s)`);

    return res.json({
      success: true,
      query,
      results,
      totalResults: results.length,
      generatedFrameUrls: results.filter(r => r.frameUrl).length
    });

  } catch (error: unknown) {
    console.error("❌ Error in smart mention search:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    });
  }
});

// Helper function to recursively search for Ethereum address in JSON object
function findAddressInJson(obj: any): string | null {
  if (!obj) return null;

  // If it's a string, check if it's an address
  if (typeof obj === "string") {
    const match = obj.match(/^(0x[a-fA-F0-9]{40})$/i);
    if (match) return match[1];
    return null;
  }

  // If it's an array, search each element
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const result = findAddressInJson(item);
      if (result) return result;
    }
    return null;
  }

  // If it's an object, search each value
  if (typeof obj === "object") {
    for (const key of Object.keys(obj)) {
      // Prioritize fields that likely contain addresses
      if (
        key.toLowerCase().includes("address") ||
        key.toLowerCase().includes("wallet") ||
        key.toLowerCase().includes("ethereum")
      ) {
        const result = findAddressInJson(obj[key]);
        if (result) return result;
      }
    }
    // Then check all other fields
    for (const key of Object.keys(obj)) {
      const result = findAddressInJson(obj[key]);
      if (result) return result;
    }
  }

  return null;
}

export default router;
