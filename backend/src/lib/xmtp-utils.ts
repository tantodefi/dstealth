import type { Signer as NodeSigner } from "@xmtp/node-sdk";
import { fromString, toString } from "uint8arrays";
import {
  createWalletClient,
  Hex,
  http,
  toBytes,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";

interface User {
  key: `0x${string}`;
  account: ReturnType<typeof privateKeyToAccount>;
  wallet: ReturnType<typeof createWalletClient>;
}

/**
 * Creates a user for XMTP
 * @param key - The private key of the user
 * @returns The user
 */
export const createUser = (key: Hex): User => {
  const accountKey = key;
  const account = privateKeyToAccount(accountKey);
  return {
    key: accountKey,
    account,
    wallet: createWalletClient({
      account,
      chain: mainnet,
      transport: http(),
    }),
  };
};

/**
 * Creates a node signer for XMTP from a private key
 * @param privateKey - The private key of the user
 * @returns The node signer
 */
export const createNodeSigner = (key: string): NodeSigner => {
  const privateKey = key.startsWith("0x") ? (key as Hex) : (`0x${key}` as Hex);
  const user = createUser(privateKey);
  console.log("Creating node signer for user", user.account.address);
  return {
    type: "EOA",
    getIdentifier: () => ({
      identifier: user.account.address.toLowerCase(),
      identifierKind: 0, // 0 = Ethereum, 1 = Passkey
    }),
    signMessage: async (message: string) => {
      const signature = await user.wallet.signMessage({
        account: user.account,
        message,
      });
      return toBytes(signature);
    },
  };
};

/**
 * Generate a random encryption key
 * @returns The encryption key
 */
export const generateEncryptionKeyHex = () => {
  /* Generate a random encryption key */
  const uint8Array = crypto.getRandomValues(new Uint8Array(32));
  /* Convert the encryption key to a hex string */
  return toString(uint8Array, "hex");
};

/**
 * Get the encryption key from a hex string
 * @param hex - The hex string
 * @returns The encryption key
 */
export const getEncryptionKeyFromHex = (hex: string) => {
  /* Convert the hex string to an encryption key */
  return fromString(hex, "hex");
};
