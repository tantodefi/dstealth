"use client";

// Simple navigator.wallets polyfill
if (typeof window !== 'undefined') {
  try {
    if (!window.navigator.wallets) {
      (window.navigator as any).wallets = [];
    }
  } catch {
    // Silent fail - not critical for app functionality
  }
}

// import { DaimoPayProvider, getDefaultConfig } from "@daimo/pay";
import { farcasterFrame as miniAppConnector } from "@farcaster/frame-wagmi-connector";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cookieStorage,
  cookieToInitialState,
  createConfig,
  createStorage,
  http,
  WagmiProvider,
  type Config,
} from "wagmi";
import { useEffect, useState, type ReactNode } from "react";
// OnchainKit imports
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { base } from 'wagmi/chains';
import { env } from "@/lib/env";

// Extend Navigator type to include wallets
declare global {
  interface Navigator {
    wallets?: any[];
  }
}

// Generate QueryClient instance for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

// Import our enhanced wagmi config
import { wagmiConfig } from "@/lib/wagmi";

// Simple DaimoPay Provider wrapper - just render children for now
function SafeDaimoPayProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

// Function to clear wagmi cookies
export const clearWagmiCookies = () => {
  // wagmi uses these cookie keys
  const wagmiCookieKeys = [
    "wagmi.connected",
    "wagmi.wallet",
    "wagmi.store",
    "wagmi.network",
  ];

  // Clear each wagmi cookie by setting expiration to past date
  wagmiCookieKeys.forEach((key) => {
    document.cookie = `${key}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
  });
};

export default function MiniAppWalletProvider({
  children,
  cookies,
}: {
  children: React.ReactNode;
  cookies: string | null;
}) {
  const initialState = cookieToInitialState(wagmiConfig as Config, cookies);
  return (
    <WagmiProvider config={wagmiConfig} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        <OnchainKitProvider
          apiKey={env.NEXT_PUBLIC_ONCHAINKIT_API_KEY || ""}
          chain={base}
          schemaId="0x72c5e5b2e6b5c6bb6b15e3f5e0b9f5e3b5f5b5f5b5f5b5f5b5f5b5f5b5f5b5f5"
        >
          <SafeDaimoPayProvider>{children}</SafeDaimoPayProvider>
        </OnchainKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
