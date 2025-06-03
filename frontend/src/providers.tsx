'use client';

// More robust navigator.wallets initialization
let walletInitialized = false;

function initializeNavigatorWallets() {
  if (typeof window === 'undefined' || walletInitialized) {
    return walletInitialized;
  }

  try {
    // Ensure navigator exists
    if (!window.navigator) {
      (window as any).navigator = {};
    }

    // Multiple initialization strategies
    const strategies = [
      // Strategy 1: Object.defineProperty with getter
      () => {
        Object.defineProperty(window.navigator, 'wallets', {
          get: () => [],
          configurable: true,
          enumerable: false
        });
      },
      // Strategy 2: Direct assignment
      () => {
        (window.navigator as any).wallets = [];
      },
      // Strategy 3: Force override
      () => {
        delete (window.navigator as any).wallets;
        (window.navigator as any).wallets = [];
      }
    ];

    for (const strategy of strategies) {
      try {
        strategy();
        if (Array.isArray(window.navigator.wallets)) {
          walletInitialized = true;
          console.log('✅ navigator.wallets initialized successfully');
          return true;
        }
      } catch (e) {
        // Continue to next strategy
      }
    }

    console.warn('⚠️ All navigator.wallets initialization strategies failed');
    return false;
  } catch (error) {
    console.error('❌ Fatal error initializing navigator.wallets:', error);
    return false;
  }
}

// Initialize immediately at module level
if (typeof window !== 'undefined') {
  // Wait for next tick to ensure DOM is ready
  setTimeout(() => {
    initializeNavigatorWallets();
  }, 0);
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

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (event.reason?.message?.includes('navigator.wallets') ||
          event.reason?.message?.includes('DaimoPay')) {
        console.warn('DaimoPay promise rejection caught:', event.reason);
        setHasError(true);
        event.preventDefault(); // Prevent unhandled rejection error
      }
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
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
  const [ready, setReady] = useState(false);
  const [daimoPayEnabled, setDaimoPayEnabled] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    // Give time for navigator.wallets to be ready, but don't block the app
    const checkReady = () => {
      if (initializeNavigatorWallets()) {
        setDaimoPayEnabled(true);
        setReady(true);
      } else {
        // Even if DaimoPay fails, we should still render the app
        setDaimoPayEnabled(false);
        setReady(true);
      }
    };
    
    // Give it a chance to initialize, but don't wait too long
    const timeoutId = setTimeout(() => {
      if (!ready) {
        console.warn('DaimoPay initialization timeout - proceeding without it');
        setDaimoPayEnabled(false);
        setReady(true);
      }
    }, 500); // Maximum wait time of 500ms
    
    setTimeout(checkReady, 50);
    
    return () => clearTimeout(timeoutId);
  }, [ready]);

  if (!mounted || !ready) {
    return <>{children}</>;
  }

  // Always render children, with or without DaimoPayProvider
  if (daimoPayEnabled) {
    try {
      // Verify one more time before rendering DaimoPayProvider
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
      }
    } catch (error) {
      console.error('Error in SafeDaimoPayProvider:', error);
    }
  }
  
  // Fallback: render without DaimoPayProvider
  console.log('Rendering without DaimoPayProvider');
  return <>{children}</>;
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