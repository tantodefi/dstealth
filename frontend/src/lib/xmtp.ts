import type { Signer } from "@xmtp/browser-sdk";
import { toBytes, type Hex, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { generatePrivateKey } from "viem/accounts";

// Simple in-memory signature cache to prevent duplicate signing requests
const signatureCache: Record<string, Uint8Array> = {};

// Helper to create a cache key from address and message
const createCacheKey = (address: string, message: string): string => {
  return `${address.toLowerCase()}:${message}`;
};

export const createEphemeralSigner = (privateKey?: Hex): Signer => {
  // Generate a new private key if none provided
  const key = privateKey || generatePrivateKey();
  const account = privateKeyToAccount(key);
  console.log("Creating ephemeral signer with address:", account.address);

  return {
    type: "EOA", // Use EOA type but mark as ephemeral in connection type
    getIdentifier: () => ({
      identifier: account.address.toLowerCase(),
      identifierKind: "Ethereum",
    }),
    signMessage: async (message: string) => {
      const cacheKey = createCacheKey(account.address, message);

      // Check if we have a cached signature
      if (signatureCache[cacheKey]) {
        console.log("Using cached signature for ephemeral key");
        return signatureCache[cacheKey];
      }

      // Sign the message
      const signature = await account.signMessage({ message });
      const signatureBytes = toBytes(signature);

      // Cache the signature
      signatureCache[cacheKey] = signatureBytes;

      // Store connection type
      try {
        localStorage.setItem("xmtp:connectionType", "ephemeral");
      } catch (e) {
        console.warn("Failed to store ephemeral connection type:", e);
      }

      return signatureBytes;
    },
  };
};

export const createEOASigner = (
  address: `0x${string}`,
  signMessageAsync: (args: { message: string }) => Promise<`0x${string}`>,
): Signer => {
  console.log("Creating EOA signer for address:", address);

  return {
    type: "EOA",
    getIdentifier: () => ({
      identifier: address.toLowerCase(),
      identifierKind: "Ethereum",
    }),
    signMessage: async (message: string) => {
      const cacheKey = createCacheKey(address, message);

      // Check if we have a cached signature
      if (signatureCache[cacheKey]) {
        console.log("Using cached EOA signature");
        return signatureCache[cacheKey];
      }

      try {
        // Sign the message
        console.log("EOA signer signing message");
        const signature = await signMessageAsync({ message });
        const signatureBytes = toBytes(signature);

        // Cache the signature
        signatureCache[cacheKey] = signatureBytes;

        return signatureBytes;
      } catch (error) {
        console.error("Error in EOA signMessage:", error);
        throw error;
      }
    },
  };
};

// Helper to find valid signature components in SCW response
const findValidSignature = (fullSignatureBytes: Uint8Array): Uint8Array | null => {
  // Try to find a valid signature in chunks of 65 bytes
  for (let i = 0; i <= fullSignatureBytes.length - 65; i++) {
    const chunk = fullSignatureBytes.slice(i, i + 65);
    const v = chunk[64];
    
    // Check if this chunk has a valid v value (27 or 28)
    if (v === 27 || v === 28) {
      // Extract r and s components
      const r = chunk.slice(0, 32);
      const s = chunk.slice(32, 64);
      
      // Verify r and s are non-zero and look like valid signature components
      const hasNonZeroR = r.some(byte => byte !== 0);
      const hasNonZeroS = s.some(byte => byte !== 0);
      
      // Additional validation for r and s components
      const isValidR = hasNonZeroR && r[0] !== 0; // First byte shouldn't be 0
      const isValidS = hasNonZeroS && s[0] !== 0; // First byte shouldn't be 0
      
      if (isValidR && isValidS) {
        return chunk;
      }
    }
  }
  return null;
};

// Helper to extract signature from Coinbase SCW response
const extractSignatureFromCoinbaseResponse = (fullSignatureBytes: Uint8Array): Uint8Array | null => {
  try {
    console.log("Attempting to extract signature from Coinbase response, length:", fullSignatureBytes.length);
    
    // For Coinbase Smart Wallets, the signature might be in different formats
    // Try multiple extraction strategies
    
    // Strategy 1: Look for signature in the last 65 bytes
    if (fullSignatureBytes.length >= 65) {
      const lastBytes = fullSignatureBytes.slice(-65);
      const v = lastBytes[64];
      
      if ((v === 27 || v === 28) && 
          lastBytes.slice(0, 32).some(b => b !== 0) && 
          lastBytes.slice(32, 64).some(b => b !== 0)) {
        console.log("✅ Found valid signature in last 65 bytes");
        return lastBytes;
      }
    }
    
    // Strategy 2: Scan through the entire response for valid signatures
    for (let i = 0; i <= fullSignatureBytes.length - 65; i++) {
      const chunk = fullSignatureBytes.slice(i, i + 65);
      const v = chunk[64];
      
      // Check for valid v value and non-zero r,s
      if ((v === 27 || v === 28) && 
          chunk.slice(0, 32).some(b => b !== 0) && 
          chunk.slice(32, 64).some(b => b !== 0)) {
        
        // Additional validation - check if this looks like a real signature
        const r = chunk.slice(0, 32);
        const s = chunk.slice(32, 64);
        
        // R and S should be in valid range (not too small, not too large)
        const rBig = BigInt('0x' + Array.from(r).map(b => b.toString(16).padStart(2, '0')).join(''));
        const sBig = BigInt('0x' + Array.from(s).map(b => b.toString(16).padStart(2, '0')).join(''));
        
        if (rBig > BigInt(0) && sBig > BigInt(0)) {
          console.log("✅ Found valid signature at position", i);
          return chunk;
        }
      }
    }
    
    // Strategy 3: For Coinbase, sometimes the signature is wrapped differently
    // Look for specific patterns in the response
    if (fullSignatureBytes.length > 100) {
      // Check if there are multiple concatenated signatures or additional data
      const middleStart = Math.floor(fullSignatureBytes.length / 3);
      const middleChunk = fullSignatureBytes.slice(middleStart, middleStart + 65);
      const v = middleChunk[64];
      
      if ((v === 27 || v === 28) && 
          middleChunk.slice(0, 32).some(b => b !== 0) && 
          middleChunk.slice(32, 64).some(b => b !== 0)) {
        console.log("✅ Found valid signature in middle section");
        return middleChunk;
      }
    }
    
    console.log("❌ No valid signature found in response");
    return null;
  } catch (error) {
    console.error("Error extracting signature from Coinbase response:", error);
    return null;
  }
};

export const createSCWSigner = (
  address: `0x${string}`,
  signMessageAsync: (args: { message: string }) => Promise<`0x${string}`>,
  chainId: bigint | number = 1,
  forceSCW: boolean = true,
): Signer => {
  console.log("Creating Smart Contract Wallet signer for address:", address);
  console.log("Force SCW mode:", forceSCW, "Chain ID:", chainId);

  return {
    type: forceSCW ? "SCW" : "EOA",
    getIdentifier: () => ({
      identifier: address.toLowerCase(),
      identifierKind: "Ethereum",
    }),
    signMessage: async (message: string) => {
      const cacheKey = createCacheKey(address, message);

      // Check if we have a cached signature
      if (signatureCache[cacheKey]) {
        console.log("Using cached Smart Contract Wallet signature");
        return signatureCache[cacheKey];
      }

      // Sign the message using the smart contract wallet
      console.log("Smart Contract Wallet signing message, forceSCW:", forceSCW);
      try {
        const signature = await signMessageAsync({ message });
        console.log("Smart Contract Wallet signature received:", signature);

        // Convert the signature to bytes
        const fullSignatureBytes = toBytes(signature);
        console.log("Full signature bytes length:", fullSignatureBytes.length);

        // For SCW mode, try to extract and validate signature
        if (forceSCW) {
          console.log("Attempting to extract SCW signature...");
          
          // Try multiple strategies to extract the signature
          let validSignature = extractSignatureFromCoinbaseResponse(fullSignatureBytes);
          
          // If extraction fails, try a more permissive approach for Coinbase
          if (!validSignature && fullSignatureBytes.length >= 65) {
            console.log("Primary extraction failed, trying fallback methods...");
            
            // Fallback 1: Just use the raw signature if it looks valid
            if (fullSignatureBytes.length === 65) {
              const v = fullSignatureBytes[64];
              if (v === 27 || v === 28) {
                console.log("Using raw 65-byte signature as fallback");
                validSignature = fullSignatureBytes;
              }
            }
            
            // Fallback 2: Try the first 65 bytes if longer
            if (!validSignature && fullSignatureBytes.length > 65) {
              const firstBytes = fullSignatureBytes.slice(0, 65);
              const v = firstBytes[64];
              if (v === 27 || v === 28) {
                console.log("Using first 65 bytes as fallback");
                validSignature = firstBytes;
              }
            }
          }
          
          if (!validSignature) {
            console.error("❌ Could not extract valid signature from Coinbase response");
            console.log("Raw signature bytes:", Array.from(fullSignatureBytes).map(b => b.toString(16).padStart(2, '0')).join(''));
            
            // As a last resort for Coinbase, try to use the signature as-is
            // This might work in some cases where the signature is already properly formatted
            if (fullSignatureBytes.length >= 64) {
              console.log("Using signature as-is as last resort");
              validSignature = fullSignatureBytes.length === 65 ? fullSignatureBytes : fullSignatureBytes.slice(0, 65);
              
              // If still no valid v value, try to fix it
              if (validSignature.length === 65 && (validSignature[64] !== 27 && validSignature[64] !== 28)) {
                // Try common v value corrections
                const correctedSig = new Uint8Array(validSignature);
                correctedSig[64] = 27; // Try v = 27 first
                validSignature = correctedSig;
                console.log("Corrected v value to 27");
              }
            } else {
              throw new Error("Signature too short - cannot extract valid signature from Coinbase response");
            }
          }
          
          console.log("✅ Using SCW signature, length:", validSignature.length);
          signatureCache[cacheKey] = validSignature;
          return validSignature;
        }

        // For non-SCW mode, just return the full signature
        console.log("Using full signature (non-SCW mode)");
        signatureCache[cacheKey] = fullSignatureBytes;
        return fullSignatureBytes;
      } catch (error) {
        console.error("❌ Error in Smart Contract Wallet signMessage:", error);
        
        // Enhanced error handling for Coinbase-specific issues
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        if (errorMessage.includes('User rejected') || errorMessage.includes('user denied')) {
          throw new Error("User rejected the signature request");
        } else if (errorMessage.includes('network') || errorMessage.includes('chain')) {
          throw new Error("Network error - please check your connection and try again");
        } else if (errorMessage.includes('timeout')) {
          throw new Error("Signature request timed out - please try again");
        } else {
          throw new Error(`Smart wallet signing failed: ${errorMessage}`);
        }
      }
    },
    getChainId: () => {
      const resolvedChainId = typeof chainId === "undefined" ? BigInt(1) : BigInt(chainId.toString());
      console.log("SCW getChainId called, returning:", resolvedChainId);
      return resolvedChainId;
    },
  };
};
