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
    setMounted(true);

    // Add a safety timeout
    const timeoutId = setTimeout(() => {
      setShowLoader(false);
    }, 5000); // Reduced to 5 seconds for better UX

    return () => clearTimeout(timeoutId);
  }, []);

  // Update loader state based on initializing
  useEffect(() => {
    setShowLoader(initializing);
  }, [initializing]);

  // Show loader while not mounted
  if (!mounted) {
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
          <FullPageLoader />
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
