import { ReclaimClient } from "@reclaimprotocol/zk-fetch";
import { Router } from "express";
import { env } from "../config/env.js";

const router = Router();

// Initialize Reclaim client with required parameters
const reclaimClient = new ReclaimClient(
  process.env.RECLAIM_APP_ID || "default",
  process.env.RECLAIM_APP_SECRET || "default",
);

// Store claimed fkey.ids in memory (should be moved to a database in production)
const claimedFkeys = new Map<string, string>(); // fkeyId -> owner address

router.get("/lookup/:username", async (req, res) => {
  const { username } = req.params;
  const url = `https://${username}.fkey.id`;

  console.log("\n=== FKEY.ID LOOKUP START ===");
  console.log(`🔍 Looking up profile for ${username} at ${url}`);

  try {
    let html;
    let zkProof = null;

    // First try with zkfetch
    try {
      console.log("\n📡 Attempting zkfetch...");
      const response = await reclaimClient.zkFetch(
        url,
        {
          method: "GET",
        },
        {
          responseMatches: [
            {
              type: "regex",
              value: "0x[a-fA-F0-9]{40}",
            },
          ],
        },
      );
      console.log("✅ zkfetch successful");
      console.log("Response:", response);

      // Validate proof structure
      if (
        response &&
        response.claimData &&
        response.signatures.length &&
        response.witnesses.length
      ) {
        console.log("✅ Valid proof structure found");
        zkProof = response;
      } else {
        console.log("❌ Invalid proof structure:", {
          hasClaimData: !!response?.claimData,
          signatureCount: response?.signatures.length,
          witnessCount: response?.witnesses.length,
        });
        zkProof = null;
      }

      // Get the HTML from the response
      console.log("\n🌐 Fetching HTML content...");
      const fetchResponse = await fetch(url);
      html = await fetchResponse.text();
      console.log("✅ HTML content fetched, length:", html.length);
    } catch (zkError) {
      // Fallback to regular fetch if zkfetch fails
      console.log("\n⚠️ zkfetch failed:", zkError);
      console.log("↪️ Falling back to regular fetch...");
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      html = await response.text();
      console.log("✅ Regular fetch successful, HTML length:", html.length);
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

    // If no address found, try other script tags
    if (!address) {
      console.log("\n2️⃣ Searching other script tags...");
      const scriptTags = html.match(/<script[^>]*>([\s\S]*?)<\/script>/g) || [];
      console.log(`Found ${scriptTags.length} script tags`);

      for (let i = 0; i < scriptTags.length; i++) {
        const scriptTag = scriptTags[i];
        console.log(`\n📜 Checking script tag ${i + 1}/${scriptTags.length}`);

        // Log a preview of the script content
        const preview =
          scriptTag.slice(0, 200) + (scriptTag.length > 200 ? "..." : "");
        console.log("Script preview:", preview);

        // Look for address in various formats
        const addressMatches =
          scriptTag.match(
            /(?:"address"|address:|address=)"?(0x[a-fA-F0-9]{40})"?/i,
          ) || scriptTag.match(/0x[a-fA-F0-9]{40}/i);

        if (addressMatches) {
          address = addressMatches[1] || addressMatches[0];
          address = address.toLowerCase();
          console.log("✅ Found address in script tag:", address);
          console.log(
            "Match context:",
            scriptTag.slice(
              Math.max(0, scriptTag.indexOf(address) - 50),
              Math.min(scriptTag.length, scriptTag.indexOf(address) + 50),
            ),
          );
          break;
        }
      }

      if (!address) {
        console.log("❌ No address found in script tags");
      }
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
    console.log("=== FKEY.ID LOOKUP END ===\n");
    return res.json({
      isRegistered: true,
      address: address,
      proof: zkProof, // Include the proof in the response
    });
  } catch (error) {
    console.error("\n❌ Error looking up profile:", error);
    console.log("=== FKEY.ID LOOKUP END WITH ERROR ===\n");
    return res.json({
      isRegistered: false,
      error: "Failed to lookup profile",
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
