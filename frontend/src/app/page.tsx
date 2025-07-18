"use client";

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { SafeAreaContainer } from "@/components/SafeAreaContainer";
import { Header } from "@/components/Header";
import WalletConnection from "@/examples/WalletConnection";
import MainInterface from "@/components/MainInterface";
import FAQ from '@/components/FAQ';
import { useXMTP } from "@/context/xmtp-context";
import { useFrame } from "@/context/frame-context";
import { useMiniKit } from '@coinbase/onchainkit/minikit';

export default function Home() {
  const { isConnected } = useAccount();
  const { client, connectionType, initialize } = useXMTP();
  const { 
    clientFid, 
    isInFarcasterContext, 
    isInCoinbaseWalletContext, 
    isBrowserContext,
    isSDKLoaded,
    isLoading: frameLoading 
  } = useFrame();
  const [showLoader, setShowLoader] = useState(true);
  const [isFaqOpen, setIsFaqOpen] = useState(false);
  const [showEarningsChart, setShowEarningsChart] = useState(false);
  const [autoConnectionAttempted, setAutoConnectionAttempted] = useState(false);
  const { setFrameReady, isFrameReady } = useMiniKit();

  // Determine if user is fully connected (wallet + XMTP)
  const isFullyConnected = Boolean(
    client && (
      // Traditional wallet connection
      (isConnected && connectionType) ||
      // Ephemeral connection (doesn't need wagmi wallet)
      (connectionType === "ephemeral" || connectionType === "Ephemeral Wallet")
    )
  );

  useEffect(() => {
    // Show loader for 2 seconds on initial load
    const timer = setTimeout(() => {
      setShowLoader(false);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  // The setFrameReady() function is called when your mini-app is ready to be shown
  useEffect(() => {
    if (!isFrameReady) {
      setFrameReady();
    }
  }, [setFrameReady, isFrameReady]);

  // Auto-connection logic based on detected context
  useEffect(() => {
    // Don't proceed if we're still loading or already attempted connection
    if (frameLoading || autoConnectionAttempted || !isSDKLoaded || client) {
      return;
    }

    console.log("🎯 Context Detection:", {
      clientFid,
      isInFarcasterContext,
      isInCoinbaseWalletContext,
      isBrowserContext,
      isConnected,
      connectionType,
    });

    // Auto-connect for Coinbase Wallet context - skip wallet connection, go straight to ephemeral XMTP
    if (isInCoinbaseWalletContext && !client) {
      console.log("🔗 Coinbase Wallet context detected - using ephemeral XMTP directly");
      setAutoConnectionAttempted(true);
      
      // Use ephemeral XMTP directly for Coinbase Wallet context
      console.log("🚀 Initializing ephemeral XMTP for Coinbase Wallet context");
      initialize({
        connectionType: "ephemeral",
        env: process.env.NEXT_PUBLIC_XMTP_ENV as any,
      }).then(() => {
        console.log("✅ Coinbase Wallet ephemeral XMTP connection successful");
      }).catch((error) => {
        console.error("❌ Coinbase Wallet ephemeral XMTP failed:", error);
        // Continue anyway - don't block the app
        console.log("⚠️ Continuing despite XMTP failure");
      });
    }
    
    // Auto-prompt for Farcaster context (handled by WalletConnection component)
    else if (isInFarcasterContext && !isConnected && !client) {
      console.log("🔗 Farcaster context detected - wallet connection will be auto-prompted");
      setAutoConnectionAttempted(true);
    }
    
    // Browser context - no auto-connection, show options
    else if (isBrowserContext) {
      console.log("🌐 Browser context detected - showing connection options");
      setAutoConnectionAttempted(true);
    }
  }, [
    frameLoading,
    autoConnectionAttempted,
    isSDKLoaded,
    client,
    clientFid,
    isInFarcasterContext,
    isInCoinbaseWalletContext,
    isBrowserContext,
    isConnected,
    connectionType,
    initialize,
  ]);

  // Note: Ephemeral XMTP initialization for Coinbase Wallet is now handled in the main auto-connection effect above

  return (
    <SafeAreaContainer>
      {/* Mobile viewport container with proper height constraints and smooth scrolling */}
      <div className="max-w-md mx-auto bg-gray-900 text-white h-screen flex flex-col mobile-scroll hide-scrollbar">
        {showLoader ? (
          /* Loader - inside mini app viewport */
          <div className="flex flex-col items-center justify-center h-screen">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-blue-200 border-solid rounded-full animate-spin border-t-blue-600"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-blue-400 text-xs font-medium">⚡</span>
              </div>
            </div>
            <p className="text-white mt-4 text-sm">Loading Dstealth...</p>
          </div>
        ) : (
          <>
            {/* Header with 'myf key' title, earnings, settings */}
            <Header 
              isConnected={isFullyConnected}
              onShowEarningsChart={() => setShowEarningsChart(true)}
            />
            
            {/* Welcome message and wallet connection info - hide when fully connected */}
            {!isFullyConnected && (
              <div className="flex-shrink-0">
                <WalletConnection />
              </div>
            )}
            
            {/* Main content area with proper height and overflow for scrolling */}
            <main className="flex-1 overflow-y-auto mobile-scroll hide-scrollbar">
              <div className="p-4 pb-24 min-h-full"> {/* Extra bottom padding for scroll space */}
                {!isFullyConnected ? (
                  <div className="text-center py-8">
                    <h1 className="text-xl font-bold text-white mb-2">
                      {isInCoinbaseWalletContext 
                        ? "Welcome to Dstealth (Coinbase Wallet)"
                        : isInFarcasterContext 
                          ? "Welcome to Dstealth (Farcaster Frame)"
                          : "Welcome to Dstealth"}
                    </h1>
                    <p className="text-gray-300 text-sm">
                      {isInCoinbaseWalletContext
                        ? (!client 
                            ? "Setting up ephemeral XMTP connection..."
                            : "Privacy-first connection ready!")
                        : isInFarcasterContext
                          ? "Please connect your wallet to continue"
                          : connectionType === "ephemeral" || connectionType === "Ephemeral Wallet" 
                            ? "Setting up your ephemeral connection..." 
                            : "Choose your connection method"}
                    </p>
                    {clientFid && (
                      <p className="text-gray-400 text-xs mt-2">
                        Client FID: {clientFid}
                      </p>
                    )}
                  </div>
                ) : (
                  <MainInterface 
                    showEarningsChart={showEarningsChart}
                    onCloseEarningsChart={() => setShowEarningsChart(false)}
                  />
                )}
              </div>
            </main>
            
            {/* Footer - fixed at bottom with backdrop */}
            <footer className="flex-shrink-0 text-center p-4 border-t border-gray-800 bg-gray-900/95 backdrop-blur-sm sticky bottom-0">
              <button 
                onClick={() => setIsFaqOpen(true)} 
                className="text-white text-sm font-medium tracking-wider hover:text-gray-300 transition-colors duration-200"
              >
                FAQ
              </button>
            </footer>
          </>
        )}
      </div>
      
      <FAQ isOpen={isFaqOpen} onClose={() => setIsFaqOpen(false)} />
    </SafeAreaContainer>
  );
}
