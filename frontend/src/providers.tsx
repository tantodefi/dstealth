'use client';

import { DaimoPayProvider, getDefaultConfig } from '@daimo/pay';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import { WagmiProvider, createConfig } from 'wagmi';
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { coinbaseWallet } from 'wagmi/connectors';
import { ErudaProvider } from '@/providers/eruda';
import { FrameProvider } from '@/context/frame-context';
import { XMTPProvider } from '@/context/xmtp-context';
import { env } from '@/lib/env';
import dynamic from 'next/dynamic';

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 10000,
    },
  },
});

// Use Daimo Pay's default config which includes all required chains
const wagmiConfig = createConfig(
  getDefaultConfig({
    appName: 'XMTP Mini App',
    // Add any additional configuration here
    connectors: [
      coinbaseWallet({
        appName: 'XMTP Mini App',
      }),
    ],
  })
);

// Initialize navigator.wallets once on client side
const initializeNavigatorWallets = () => {
  if (typeof window === 'undefined') return;
  
  try {
    // Check if we're in a Chrome extension context
    if (window.location.protocol === 'chrome-extension:') {
      return;
    }

    // Ensure navigator.wallets exists and is an array
    if (!window.navigator.wallets || !Array.isArray(window.navigator.wallets)) {
      Object.defineProperty(window.navigator, 'wallets', {
        value: [],
        writable: true,
        configurable: true,
        enumerable: true
      });
    }
  } catch (error) {
    // Fallback: try direct assignment
    try {
      if (window.navigator) {
        window.navigator.wallets = [];
      }
    } catch (fallbackError) {
      // Silent fail - not critical
    }
  }
};

// Create a client-only wrapper to prevent hydration issues
function ClientProviders({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    initializeNavigatorWallets();
    setMounted(true);
  }, []);

  // Return children immediately to prevent hydration mismatch
  // The wallet initialization will happen after mount
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <DaimoPayProvider>
          <OnchainKitProvider 
            chain={wagmiConfig.chains[0]}
            apiKey={env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}
            config={{
              appearance: {
                mode: 'dark',
                theme: 'default'
              }
            }}>
            <ErudaProvider>
              <FrameProvider>
                <XMTPProvider>
                  {children}
                </XMTPProvider>
              </FrameProvider>
            </ErudaProvider>
          </OnchainKitProvider>
        </DaimoPayProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

// Use dynamic import to ensure this only runs on client
const DynamicClientProviders = dynamic(() => Promise.resolve(ClientProviders), {
  ssr: false,
  loading: () => <div>Loading...</div>
});

export function Providers({ children }: { children: ReactNode }) {
  return <DynamicClientProviders>{children}</DynamicClientProviders>;
} 