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
      {/* Mobile viewport container with proper height constraints */}
      <div className="max-w-md mx-auto bg-gray-900 text-white min-h-screen flex flex-col">
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
            
            {/* Main content area with scroll */}
            <main className="flex-grow overflow-y-auto min-h-0">
              <div className="p-4">
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
            
            {/* Footer - always visible at bottom */}
            <footer className="flex-shrink-0 text-center p-4 border-t border-gray-800 bg-gray-900">
              <p className="text-xs text-gray-400 mb-3">
                Built with ❤️ on XMTP
              </p>
              <button 
                onClick={() => setIsFaqOpen(true)} 
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors duration-200 border border-blue-500 shadow-lg"
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
