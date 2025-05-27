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
    // The signature is in the last 65 bytes of the response
    // Look for signature pattern in the last part of the response
    const signatureLength = 65;
    const responseLength = fullSignatureBytes.length;
    
    // Start from the end and look for signature pattern
    for (let i = responseLength - signatureLength; i >= 0; i--) {
      const potentialSig = fullSignatureBytes.slice(i, i + signatureLength);
      const v = potentialSig[64];
      
      // Check for valid v value and signature pattern
      if ((v === 27 || v === 28) && 
          // Check for non-zero values in r and s
          potentialSig.slice(0, 32).some(b => b !== 0) && 
          potentialSig.slice(32, 64).some(b => b !== 0)) {
        return potentialSig;
      }
    }
    
    // If no valid signature found in the response
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
  console.log("Force SCW mode:", forceSCW);

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
      console.log("Smart Contract Wallet signing message");
      try {
        const signature = await signMessageAsync({ message });
        console.log("Smart Contract Wallet signature received:", signature);

        // Convert the signature to bytes
        const fullSignatureBytes = toBytes(signature);
        console.log("Full signature bytes length:", fullSignatureBytes.length);

        // For SCW mode, try to extract signature
        if (forceSCW) {
          const validSignature = extractSignatureFromCoinbaseResponse(fullSignatureBytes);
          if (!validSignature) {
            throw new Error("Could not extract valid signature from Coinbase response");
          }
          console.log("Extracted valid SCW signature, length:", validSignature.length);
          signatureCache[cacheKey] = validSignature;
          return validSignature;
        }

        // For non-SCW mode, just return the full signature
        console.log("Using full signature (non-SCW mode)");
        signatureCache[cacheKey] = fullSignatureBytes;
        return fullSignatureBytes;
      } catch (error) {
        console.error("Error in Smart Contract Wallet signMessage:", error);
        throw error;
      }
    },
    getChainId: () => {
      console.log("SCW getChainId called, value:", chainId);
      return typeof chainId === "undefined"
        ? BigInt(1)
        : BigInt(chainId.toString());
    },
  };
};
