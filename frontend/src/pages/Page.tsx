"use client";

import { useEffect, useState } from "react";
import { FullPageLoader } from "@/components/FullPageLoader";
import { Header } from "@/components/Header";
import { SafeAreaContainer } from "@/components/SafeAreaContainer";
import { useXMTP } from "@/context/xmtp-context";
import WalletConnection from "@/examples/WalletConnection";
import MainInterface from "@/components/MainInterface";

export default function ExamplePage() {
  const { client, initializing, disconnect } = useXMTP();
  const [isConnected, setIsConnected] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showLoader, setShowLoader] = useState(true);
  const [showEarningsChart, setShowEarningsChart] = useState(false);

  // Mark as mounted on client-side
  useEffect(() => {
    console.log("📱 Page: Mounting...");
    setMounted(true);

    // Add a safety timeout to ensure app always loads
    const timeoutId = setTimeout(() => {
      console.log("⏰ Page: Force hiding loader after timeout");
      setShowLoader(false);
    }, 3000); // Reduced to 3 seconds for better UX

    return () => {
      console.log("📱 Page: Unmounting...");
      clearTimeout(timeoutId);
    };
  }, []);

  // Update loader state based on initializing
  useEffect(() => {
    console.log("🔄 Page: XMTP initializing state changed:", initializing);
    
    // Only show loader if XMTP is actively initializing
    // If not initializing, hide loader immediately
    if (!initializing) {
      setShowLoader(false);
    }
  }, [initializing]);

  // Debug logging for client state
  useEffect(() => {
    console.log("🌐 Page: XMTP client state:", !!client);
  }, [client]);

  console.log("🎯 Page: Render state:", { 
    mounted, 
    showLoader, 
    initializing, 
    hasClient: !!client 
  });

  // Show loader while not mounted
  if (!mounted) {
    console.log("⏳ Page: Not mounted - showing loader");
    return (
      <SafeAreaContainer>
        <div className="flex flex-col w-full max-w-md mx-auto h-screen bg-black">
          <FullPageLoader />
        </div>
      </SafeAreaContainer>
    );
  }

  return (
    <SafeAreaContainer>
      <div className="flex flex-col w-full max-w-md mx-auto h-screen bg-black">
        <Header 
          isConnected={isConnected || !!client} 
          onShowEarningsChart={() => setShowEarningsChart(true)}
        />

        {showLoader ? (
          <>
            <FullPageLoader />
            <div className="text-white text-xs text-center mt-2">
              Loading... (XMTP: {initializing ? 'initializing' : 'ready'})
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-4 px-4 py-4 h-full overflow-auto">
            {!client ? (
              <WalletConnection />
            ) : (
              <MainInterface 
                showEarningsChart={showEarningsChart}
                onCloseEarningsChart={() => setShowEarningsChart(false)}
              />
            )}
          </div>
        )}
      </div>
    </SafeAreaContainer>
  );
}
