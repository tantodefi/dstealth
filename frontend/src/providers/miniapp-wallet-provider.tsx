"use client";

import React, { useEffect, useState, type ReactNode } from "react";
import { DaimoPayProvider } from "@daimo/pay";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cookieStorage,
  cookieToInitialState,
  WagmiProvider,
  type Config,
} from "wagmi";
// OnchainKit imports
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { MiniKitProvider } from '@coinbase/onchainkit/minikit';
import { base } from 'wagmi/chains';
import { env } from "@/lib/env";
// Use our reliable wagmi config
import { wagmiConfig } from "@/lib/wagmi";

// Function to clear wagmi cookies
export function clearWagmiCookies() {
  try {
    // Clear wagmi-related cookies
    document.cookie = "wagmi.cache=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    document.cookie = "wagmi.store=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    document.cookie = "wagmi.connected=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    document.cookie = "wagmi.wallet=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    
    // Clear any cookies that start with "wagmi"
    document.cookie.split(";").forEach(cookie => {
      const eqPos = cookie.indexOf("=");
      const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
      if (name.startsWith("wagmi")) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
      }
    });
  } catch (error) {
    console.warn("Failed to clear wagmi cookies:", error);
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

export default function MiniAppWalletProvider({
  children,
  cookies,
}: {
  children: React.ReactNode;
  cookies: string | null;
}) {
  const initialState = cookieToInitialState(wagmiConfig, cookies);
  
  return (
    <WagmiProvider config={wagmiConfig} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        <OnchainKitProvider
          apiKey={env.NEXT_PUBLIC_ONCHAINKIT_API_KEY || ""}
          chain={base}
          config={{
            appearance: {
              mode: 'dark',
              theme: 'default'
            }
          }}
        >
          <MiniKitProvider
            apiKey={env.NEXT_PUBLIC_ONCHAINKIT_API_KEY || ""}
            chain={base}
          >
            <DaimoPayProvider>
              {children}
            </DaimoPayProvider>
          </MiniKitProvider>
        </OnchainKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

