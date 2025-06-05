"use client";

import { useEffect, useState, useRef } from "react";
import { FullPageLoader } from "@/components/FullPageLoader";
import { Header } from "@/components/Header";
import { SafeAreaContainer } from "@/components/SafeAreaContainer";
import { useXMTP } from "@/context/xmtp-context";
import WalletConnection from "@/examples/WalletConnection";
import MainInterface from "@/components/MainInterface";

export default function Home() {
  const { client, initializing, disconnect, isInFarcasterContext } = useXMTP();
  const [mounted, setMounted] = useState(false);
  const [showLoader, setShowLoader] = useState(true);
  const [showEarningsChart, setShowEarningsChart] = useState(false);
  
  // Use refs to prevent unnecessary re-renders and state loops
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const loaderTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const forceLoaderHiddenRef = useRef(false);

  // Mark as mounted on client-side
  useEffect(() => {
    console.log("📱 Page: Mounting...");
    setMounted(true);
    forceLoaderHiddenRef.current = false;

    // Add a safety timeout to ensure app always loads (increased to 10 seconds)
    timeoutRef.current = setTimeout(() => {
      console.log("⏰ Page: Force hiding loader after timeout");
      forceLoaderHiddenRef.current = true;
      setShowLoader(false);
    }, 10000); // 10 seconds max wait time

    return () => {
      console.log("📱 Page: Unmounting...");
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (loaderTimeoutRef.current) {
        clearTimeout(loaderTimeoutRef.current);
      }
    };
  }, []);

  // Update loader state based on initializing - improved logic
  useEffect(() => {
    console.log("🔄 Page: XMTP state changed:", { initializing, hasClient: !!client, forceHidden: forceLoaderHiddenRef.current });
    
    // If force hidden by timeout, don't show loader again
    if (forceLoaderHiddenRef.current) {
      setShowLoader(false);
      return;
    }
    
    // Clear any existing loader timeout
    if (loaderTimeoutRef.current) {
      clearTimeout(loaderTimeoutRef.current);
      loaderTimeoutRef.current = null;
    }
    
    // If XMTP is not initializing, hide loader after a brief delay
    if (!initializing) {
      loaderTimeoutRef.current = setTimeout(() => {
        if (mounted && !forceLoaderHiddenRef.current) {
          setShowLoader(false);
        }
      }, 1000); // Increased delay for better UX
    } else {
      // If initializing started, show loader (but only if not force hidden and mounted)
      if (mounted && !forceLoaderHiddenRef.current) {
        setShowLoader(true);
      }
    }
  }, [initializing, client, mounted]);

  // Debug logging for client state changes
  useEffect(() => {
    console.log("🌐 Page: XMTP client state:", { 
      hasClient: !!client, 
      isInFarcasterContext,
      initializing 
    });
  }, [client, isInFarcasterContext, initializing]);

  console.log("🎯 Page: Render state:", { 
    mounted, 
    showLoader, 
    initializing, 
    hasClient: !!client,
    isInFarcasterContext,
    forceHidden: forceLoaderHiddenRef.current
  });

  // Show loader while not mounted or during initial load (with better conditions)
  if (!mounted || (showLoader && initializing && !forceLoaderHiddenRef.current)) {
    console.log("⏳ Page: Showing loader - mounted:", mounted, "showLoader:", showLoader, "initializing:", initializing, "forceHidden:", forceLoaderHiddenRef.current);
    return (
      <SafeAreaContainer>
        <div className="flex flex-col w-full max-w-md mx-auto h-screen bg-black">
          <FullPageLoader />
          <div className="text-white text-xs text-center mt-2">
            {!mounted ? "Loading app..." : 
             initializing ? "Initializing XMTP..." : 
             "Getting ready..."}
          </div>
        </div>
      </SafeAreaContainer>
    );
  }

  return (
    <SafeAreaContainer>
      <div className="flex flex-col w-full max-w-md mx-auto h-screen bg-black">
        <Header 
          isConnected={!!client} 
          onShowEarningsChart={() => setShowEarningsChart(true)}
        />

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
      </div>
    </SafeAreaContainer>
  );
}
