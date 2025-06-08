"use client";

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { SafeAreaContainer } from "@/components/SafeAreaContainer";
import { Header } from "@/components/Header";
import WalletConnection from "@/examples/WalletConnection";
import MainInterface from "@/components/MainInterface";
import FAQ from '@/components/FAQ';
import { useXMTP } from "@/context/xmtp-context";

export default function Home() {
  const { isConnected } = useAccount();
  const { client, connectionType } = useXMTP();
  const [showLoader, setShowLoader] = useState(true);
  const [isFaqOpen, setIsFaqOpen] = useState(false);
  const [showEarningsChart, setShowEarningsChart] = useState(false);

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

  return (
    <SafeAreaContainer>
      {/* Mobile viewport container with proper height constraints and smooth scrolling */}
      <div className="max-w-md mx-auto bg-gray-900 text-white min-h-screen flex flex-col mobile-scroll hide-scrollbar">
        {showLoader ? (
          /* Loader - inside mini app viewport */
          <div className="flex flex-col items-center justify-center h-screen">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-blue-200 border-solid rounded-full animate-spin border-t-blue-600"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-blue-400 text-xs font-medium">⚡</span>
              </div>
            </div>
            <p className="text-white mt-4 text-sm">Loading myf⚡key...</p>
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
            
            {/* Main content area with smooth scrolling - no explicit height constraints */}
            <main className="flex-grow mobile-scroll hide-scrollbar">
              <div className="p-4 pb-24"> {/* Extra bottom padding for scroll space */}
                {!isFullyConnected ? (
                  <div className="text-center py-8">
                    <h1 className="text-xl font-bold text-white mb-2">Welcome to myf⚡key</h1>
                    <p className="text-gray-300 text-sm">
                      {connectionType === "ephemeral" || connectionType === "Ephemeral Wallet" 
                        ? "Setting up your ephemeral connection..." 
                        : "Connect your wallet to access the app"}
                    </p>
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
