"use client";

// IMMEDIATE aggressive polyfill before any imports
(function() {
  if (typeof window !== 'undefined' && typeof window.navigator !== 'undefined') {
    // Force initialize navigator.wallets immediately
    if (!window.navigator.wallets) {
      try {
        Object.defineProperty(window.navigator, 'wallets', {
          value: [],
          writable: true,
          configurable: true,
          enumerable: true
        });
        console.log('🔧 navigator.wallets initialized immediately');
      } catch (e) {
        // Fallback: direct assignment
        (window.navigator as any).wallets = [];
        console.log('🔧 navigator.wallets fallback initialization');
      }
    } else if (!Array.isArray(window.navigator.wallets)) {
      // Exists but not an array, force it to be an array
      try {
        (window.navigator as any).wallets = [];
        console.log('🔧 navigator.wallets forced to array');
      } catch (e) {
        console.warn('🔧 navigator.wallets override failed, but continuing');
      }
    }
  }
})();

// Additional backup polyfill with enhanced safety
if (typeof window !== 'undefined') {
  // Enhanced polyfill with multiple fallback strategies
  const ensureNavigatorWallets = () => {
    try {
      // Strategy 1: Check if it exists and is an array
      if (window.navigator.wallets && Array.isArray(window.navigator.wallets)) {
        return; // Already good
      }

      // Strategy 2: Property descriptor check and replace
      const descriptor = Object.getOwnPropertyDescriptor(window.navigator, 'wallets');
      
      if (!window.navigator.wallets || descriptor?.configurable !== false) {
        // Can safely set/replace the property
        Object.defineProperty(window.navigator, 'wallets', {
          value: [],
          writable: true,
          configurable: true,
          enumerable: true
        });
        console.log('🛡️ navigator.wallets set via defineProperty');
      } else {
        // Strategy 3: Direct assignment (risky but might work)
        (window.navigator as any).wallets = [];
        console.log('🛡️ navigator.wallets set via direct assignment');
      }
    } catch (error) {
      // Strategy 4: Complete fallback - create a proxy
      console.warn('🛡️ All navigator.wallets strategies failed, creating proxy:', error);
      try {
        // Create a getter that always returns an empty array
        if (Object.defineProperty) {
          Object.defineProperty(window.navigator, 'wallets', {
            get: () => [],
            configurable: true,
            enumerable: true
          });
          console.log('🛡️ navigator.wallets proxy created');
        }
      } catch {
        console.error('🛡️ Complete navigator.wallets initialization failure');
      }
    }
  };

  // Run immediately
  ensureNavigatorWallets();
  
  // Also run after a small delay in case something overwrites it
  setTimeout(ensureNavigatorWallets, 50);
}

import { DaimoPayProvider, getDefaultConfig } from "@daimo/pay";
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
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { MiniKitProvider } from '@coinbase/onchainkit/minikit';
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

// Safe DaimoPay Provider wrapper
function SafeDaimoPayProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Comprehensive initialization and verification
    const initializeProvider = () => {
      try {
        // Force re-check navigator.wallets before proceeding
        if (typeof window !== 'undefined') {
          // Final safety check and force initialization if needed
          if (!window.navigator.wallets) {
            console.log('🚨 navigator.wallets missing, force creating...');
            try {
              Object.defineProperty(window.navigator, 'wallets', {
                value: [],
                writable: true,
                configurable: true,
                enumerable: true
              });
            } catch {
              (window.navigator as any).wallets = [];
            }
          } else if (!Array.isArray(window.navigator.wallets)) {
            console.log('🚨 navigator.wallets not an array, force converting...');
            try {
              (window.navigator as any).wallets = [];
            } catch {
              console.warn('🚨 Could not convert navigator.wallets to array');
            }
          }
          
          // Verify it's working
          if (Array.isArray(window.navigator.wallets)) {
            console.log('✅ DaimoPayProvider: navigator.wallets verified as array with length:', window.navigator.wallets.length);
          } else {
            console.warn('⚠️ DaimoPayProvider: navigator.wallets verification failed, but continuing');
          }
        }
        
        setIsReady(true);
      } catch (err) {
        console.error('❌ DaimoPayProvider: Initialization failed:', err);
        setError(err instanceof Error ? err.message : 'Initialization failed');
        // Still try to render children even if checks fail
        setIsReady(true);
      }
    };

    // Small delay to ensure DOM and polyfills are ready
    const timer = setTimeout(initializeProvider, 150); // Increased delay
    return () => clearTimeout(timer);
  }, []);

  if (!isReady) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="text-sm text-gray-400">Initializing payment provider...</div>
      </div>
    );
  }

  if (error) {
    console.warn('⚠️ DaimoPayProvider initialization error (continuing anyway):', error);
  }

  // Final navigator.wallets check before rendering DaimoPayProvider
  try {
    if (typeof window !== 'undefined') {
      if (!window.navigator.wallets || !Array.isArray(window.navigator.wallets)) {
        console.error('🛑 CRITICAL: navigator.wallets still not ready, skipping DaimoPayProvider');
        return (
          <div className="border border-red-500 bg-red-500/10 p-4 rounded-lg">
            <div className="text-red-400 text-sm font-medium mb-2">
              Payment Provider Unavailable
            </div>
            <div className="text-red-300 text-xs">
              navigator.wallets initialization failed. DaimoPay features are disabled.
            </div>
            <div className="mt-3">
              {children}
            </div>
          </div>
        );
      }
    }

    return (
      <DaimoPayProvider>
        {children}
      </DaimoPayProvider>
    );
  } catch (err) {
    console.error('❌ DaimoPayProvider render error:', err);
    return (
      <div className="border border-yellow-500 bg-yellow-500/10 p-4 rounded-lg">
        <div className="text-yellow-400 text-sm font-medium mb-2">
          Payment Provider Error
        </div>
        <div className="text-yellow-300 text-xs">
          DaimoPay functionality may be limited. Error: {err instanceof Error ? err.message : 'Unknown error'}
        </div>
        <div className="mt-3">
          {children}
        </div>
      </div>
    );
  }
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

// Create wagmi config with Daimo Pay defaults
export const wagmiConfig = createConfig(
  getDefaultConfig({
    appName: 'XMTP Mini App',
    // Add the miniapp connector to the default config
  connectors: [miniAppConnector()],
    // Keep the cookie storage for SSR compatibility
  storage: createStorage({
    storage: cookieStorage,
  }),
  })
);

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
          chain={wagmiConfig.chains[0]}
          apiKey={env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}
          config={{
            appearance: {
              mode: 'dark',
              theme: 'default'
            }
          }}>
          <MiniKitProvider
            apiKey={env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}
            chain={base}
          >
            <SafeDaimoPayProvider>{children}</SafeDaimoPayProvider>
          </MiniKitProvider>
        </OnchainKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
