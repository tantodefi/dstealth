'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { base } from 'wagmi/chains';
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { coinbaseWallet } from 'wagmi/connectors';
import { ErudaProvider } from '@/providers/eruda';
import { FrameProvider } from '@/context/frame-context';
import { XMTPProvider } from '@/context/xmtp-context';
import { env } from '@/lib/env';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 10000,
    },
  },
});

const wagmiConfig = createConfig({
  chains: [base],
  connectors: [
    coinbaseWallet({
      appName: 'XMTP Mini App',
    }),
  ],
  ssr: true,
  transports: {
    [base.id]: http(),
  },
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <OnchainKitProvider 
          chain={base}
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
      </QueryClientProvider>
    </WagmiProvider>
  );
} 