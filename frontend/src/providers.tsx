'use client';

// Initialize navigator.wallets IMMEDIATELY at module level with comprehensive checks
if (typeof window !== 'undefined') {
  // Multiple initialization attempts to ensure compatibility
  const initializeWallets = () => {
    try {
      // Ensure navigator exists
      if (!window.navigator) {
        (window as any).navigator = {};
      }
      
      // Check if wallets already exists and is properly set
      if (!window.navigator.wallets || !Array.isArray(window.navigator.wallets)) {
        // Method 1: Try Object.defineProperty
        try {
          Object.defineProperty(window.navigator, 'wallets', {
            value: [],
            writable: true,
            configurable: true,
            enumerable: false
          });
        } catch (defineError) {
          // Method 2: Direct assignment
          try {
            (window.navigator as any).wallets = [];
          } catch (assignError) {
            // Method 3: Force delete and reassign
            try {
              delete (window.navigator as any).wallets;
              (window.navigator as any).wallets = [];
            } catch (forceError) {
              console.warn('Failed to initialize navigator.wallets:', forceError);
            }
          }
        }
      }
      
      // Final verification
      if (Array.isArray(window.navigator.wallets)) {
        console.log('✅ navigator.wallets successfully initialized');
        return true;
      } else {
        console.warn('⚠️ navigator.wallets is not an array after initialization');
        return false;
      }
    } catch (error) {
      console.error('❌ Error initializing navigator.wallets:', error);
      return false;
    }
  };

  // Try multiple times if needed
  let attempts = 0;
  const maxAttempts = 3;
  
  while (attempts < maxAttempts && !Array.isArray(window.navigator?.wallets)) {
    attempts++;
    console.log(`Attempting to initialize navigator.wallets (attempt ${attempts}/${maxAttempts})`);
    if (initializeWallets()) {
      break;
    }
    // Brief delay between attempts
    if (attempts < maxAttempts) {
      setTimeout(() => {}, 10);
    }
  }
}

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

// Extend Navigator type to include wallets
declare global {
  interface Navigator {
    wallets?: any[];
  }
}

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

// Error boundary component for DaimoPay
function DaimoPayErrorBoundary({ children }: { children: ReactNode }) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const handleError = (error: ErrorEvent) => {
      if (error.message?.includes('navigator.wallets') || 
          error.message?.includes('DaimoPay') ||
          error.message?.includes('wallet-standard')) {
        console.warn('DaimoPay error caught:', error.message);
        setHasError(true);
      }
    };

    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    console.warn('DaimoPay error boundary activated - rendering without DaimoPay');
    return <>{children}</>;
  }

  return <>{children}</>;
}

// Safe DaimoPay Provider wrapper
function SafeDaimoPayProvider({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <>{children}</>;
  }

  try {
    // Final check before rendering DaimoPayProvider
    if (typeof window !== 'undefined' && 
        window.navigator && 
        Array.isArray(window.navigator.wallets)) {
      return (
        <DaimoPayErrorBoundary>
          <DaimoPayProvider>
            {children}
          </DaimoPayProvider>
        </DaimoPayErrorBoundary>
      );
    } else {
      console.warn('navigator.wallets not properly initialized, rendering without DaimoPayProvider');
      return <>{children}</>;
    }
  } catch (error) {
    console.error('Error in SafeDaimoPayProvider:', error);
    return <>{children}</>;
  }
}

// Create a client-only wrapper to prevent hydration issues
function ClientProviders({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null; // Prevent hydration issues
  }

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <SafeDaimoPayProvider>
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
        </SafeDaimoPayProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

// Export with dynamic loading to ensure client-side only
export const Providers = dynamic(() => Promise.resolve(ClientProviders), {
  ssr: false,
}); 