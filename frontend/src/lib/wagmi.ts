import { farcasterFrame as miniAppConnector } from "@farcaster/frame-wagmi-connector";
import {
  cookieStorage,
  createConfig,
  createStorage,
  http,
} from "wagmi";
import { 
  base, 
  baseSepolia, 
  mainnet, 
  polygon, 
  optimism, 
  arbitrum,
  sepolia,
  bsc,
  linea,
  celo,
  mantle
} from 'wagmi/chains';
import { coinbaseWallet } from 'wagmi/connectors';
import { injected } from 'wagmi/connectors';

// Define World Chain since it's required by Daimo but might not be in wagmi/chains yet
const worldchain = {
  id: 480,
  name: 'World Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://worldchain-mainnet.g.alchemy.com/public'] },
    public: { http: ['https://worldchain-mainnet.g.alchemy.com/public'] },
  },
  blockExplorers: {
    default: { name: 'Worldscan', url: 'https://worldscan.org' },
  },
};

// Create wagmi config with ALL chains that Daimo Pay supports to avoid conflicts
export const wagmiConfig = createConfig({
  chains: [
    // Primary chains for our app
    base, 
    baseSepolia, 
    mainnet,
    // Additional chains required by Daimo Pay
    polygon,
    optimism, 
    arbitrum,
    sepolia,
    bsc,
    linea,
    celo,
    mantle,
    worldchain
  ],
  connectors: [
    // Farcaster Frame connector for mini-app contexts
    miniAppConnector(),
    // Coinbase Wallet connector with smart wallet support
    coinbaseWallet({
      appName: "XMTP Mini App",
      preference: "all", // Support both EOA and Smart Wallets
    }),
    // Injected connector for browser wallets (MetaMask, etc.)
    injected({
      shimDisconnect: true,
    }),
  ],
  storage: createStorage({
    storage: cookieStorage,
    key: "xmtp-wagmi-storage",
  }),
  ssr: true,
  transports: {
    [base.id]: http("https://base.llamarpc.com"),
    [baseSepolia.id]: http("https://base-sepolia.llamarpc.com"),
    [mainnet.id]: http("https://mainnet.llamarpc.com"),
    [polygon.id]: http("https://polygon.llamarpc.com"),
    [optimism.id]: http("https://optimism.llamarpc.com"),
    [arbitrum.id]: http("https://arbitrum.llamarpc.com"),
    [sepolia.id]: http("https://sepolia.llamarpc.com"),
    [bsc.id]: http("https://bsc.llamarpc.com"),
    [linea.id]: http("https://linea.llamarpc.com"),
    [celo.id]: http("https://celo.llamarpc.com"),
    [mantle.id]: http("https://mantle.publicnode.com"),
    [worldchain.id]: http("https://worldchain-mainnet.g.alchemy.com/public"),
  },
});

export default wagmiConfig; 