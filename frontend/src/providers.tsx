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

// import { DaimoPayProvider, getDefaultConfig } from '@daimo/pay';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import { WagmiProvider, createConfig, http } from 'wagmi';
// import { OnchainKitProvider } from '@coinbase/onchainkit';
import { coinbaseWallet } from 'wagmi/connectors';
import { base } from 'wagmi/chains';
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

// Simple wagmi config without DaimoPay for now
const wagmiConfig = createConfig({
  chains: [base],
    connectors: [
      coinbaseWallet({
        appName: 'XMTP Mini App',
      }),
    ],
  transports: {
    [base.id]: http(),
  },
});

// Temporarily disabled DaimoPay config
// const wagmiConfig = createConfig(
//   getDefaultConfig({
//     appName: 'XMTP Mini App',
//     // Add any additional configuration here
//     connectors: [
//       coinbaseWallet({
//         appName: 'XMTP Mini App',
//       }),
//     ],
//   })
// );

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
  const [daimoPayEnabled, setDaimoPayEnabled] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    // Try to initialize DaimoPay in the background, but don't block the app
    const tryInitializeDaimoPay = async () => {
      try {
        // Give a short delay for navigator.wallets to be ready
        await new Promise(resolve => setTimeout(resolve, 100));
        
        if (initializeNavigatorWallets()) {
          setDaimoPayEnabled(true);
          console.log('DaimoPay enabled successfully');
        } else {
          console.log('DaimoPay initialization failed - continuing without it');
        }
      } catch (error) {
        console.log('DaimoPay initialization error - continuing without it:', error);
      }
    };
    
    tryInitializeDaimoPay();
  }, []);

  if (!mounted) {
    return <>{children}</>;
  }

  // Temporarily disabled DaimoPayProvider due to Solana dependencies
  return <>{children}</>;

  // Always render children, optionally with DaimoPayProvider
  // if (daimoPayEnabled) {
  //   try {
  //     return (
  //       <DaimoPayErrorBoundary>
  //         <DaimoPayProvider>
  //           {children}
  //         </DaimoPayProvider>
  //       </DaimoPayErrorBoundary>
  //     );
  //   } catch (error) {
  //     console.error('Error rendering DaimoPayProvider:', error);
  //   }
  // }
  
  // Default: render without DaimoPayProvider (this should always work)
  // return <>{children}</>;
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
          {/* <OnchainKitProvider 
            chain={wagmiConfig.chains[0]}
            apiKey={env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}
            config={{
              appearance: {
                mode: 'dark',
                theme: 'default'
              }
            }}> */}
            <ErudaProvider>
              <FrameProvider>
                <XMTPProvider>
                  {children}
                </XMTPProvider>
              </FrameProvider>
            </ErudaProvider>
          {/* </OnchainKitProvider> */}
        </SafeDaimoPayProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

// Export with dynamic loading to ensure client-side only
export const Providers = dynamic(() => Promise.resolve(ClientProviders), {
  ssr: false,
}); 