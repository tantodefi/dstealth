import { farcasterFrame as miniAppConnector } from "@farcaster/frame-wagmi-connector";
import {
  cookieStorage,
  createConfig,
  createStorage,
  http,
} from "wagmi";
import { base, baseSepolia, mainnet } from 'wagmi/chains';

// Create wagmi config with proper chain support for XMTP and X402 Protocol
export const wagmiConfig = createConfig({
  chains: [base, baseSepolia, mainnet],
  connectors: [miniAppConnector()],
  storage: createStorage({
    storage: cookieStorage,
    key: "xmtp-wagmi-storage",
  }),
  ssr: true,
  transports: {
    [base.id]: http("https://base.llamarpc.com"),
    [baseSepolia.id]: http("https://base-sepolia.llamarpc.com"),
    [mainnet.id]: http("https://mainnet.llamarpc.com"),
  },
});

export default wagmiConfig; 