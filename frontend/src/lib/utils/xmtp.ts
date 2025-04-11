import type { Signer as BrowserSigner } from "@xmtp/browser-sdk";
import { toBytes, type WalletClient } from "viem";

/**
 * Creates a browser signer for XMTP from the user connected wallet
 * @param address - The address of the user
 * @param walletClient - The wallet client
 * @returns The browser signer
 */
export const createBrowserSigner = (
  address: `0x${string}`,
  walletClient: WalletClient
): BrowserSigner => {
  return {
    type: "EOA",
    getIdentifier: () => ({
      identifier: address.toLowerCase(),
      identifierKind: "Ethereum",
    }),
    signMessage: async (message: string) => {
      const signature = await walletClient.signMessage({
        account: address,
        message,
      });
      return toBytes(signature);
    },
  };
};
