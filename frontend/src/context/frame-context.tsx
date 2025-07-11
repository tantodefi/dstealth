"use client";

import { FrameContext } from "@farcaster/frame-core/dist/context";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
  useRef,
} from "react";

interface FrameContextValue {
  context: FrameContext | null;
  isInMiniApp: boolean;
  isSDKLoaded: boolean;
  error: string | null;
  actions: any | null;
  isLoading: boolean;
  clientFid: number | null;
  isInFarcasterContext: boolean;
  isInCoinbaseWalletContext: boolean;
  isBrowserContext: boolean;
}

const FrameProviderContext = createContext<FrameContextValue | undefined>(
  undefined,
);

interface FrameProviderProps {
  children: ReactNode;
}

export function FrameProvider({ children }: FrameProviderProps) {
  const [context, setContext] = useState<FrameContext | null>(null);
  const [actions, setActions] = useState<any | null>(null);
  const [isSDKLoaded, setIsSDKLoaded] = useState(false);
  const [isInMiniApp, setIsInMiniApp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [clientFid, setClientFid] = useState<number | null>(null);
  const initializationAttempted = useRef(false);

  // Derived context states based on clientFid
  const isInFarcasterContext = clientFid === 9152;
  const isInCoinbaseWalletContext = clientFid === 309857;
  const isBrowserContext = !isInMiniApp || (!isInFarcasterContext && !isInCoinbaseWalletContext);

  useEffect(() => {
    const initializeFarcasterSDK = async () => {
      // Prevent multiple initialization attempts
      if (initializationAttempted.current) {
        return;
      }
      initializationAttempted.current = true;

      try {
        setIsLoading(true);
        console.log("🎯 Farcaster: Starting SDK initialization...");

        // Dynamic import to avoid build-time issues
        const sdk = (await import("@farcaster/frame-sdk")).default;

        // Check if we're in a mini app first
        const isMiniApp = await sdk.isInMiniApp();
        setIsInMiniApp(isMiniApp);
        console.log("🎯 Farcaster: Mini app check result:", isMiniApp);

        if (isMiniApp) {
          // Get the context
          const frameContext = await sdk.context;
          console.log("🎯 Farcaster: Context received:", frameContext);
          
          if (frameContext) {
            setContext(frameContext as FrameContext);
            setActions(sdk.actions);
            
            // Detect clientFid for context identification
            const detectedClientFid = (frameContext as any)?.client?.clientFid;
            console.log("🎯 Farcaster: ClientFid detected:", detectedClientFid);
            
            if (detectedClientFid) {
              setClientFid(detectedClientFid);
              
              // Log the context type for debugging
              if (detectedClientFid === 9152) {
                console.log("🎯 Farcaster: Detected Farcaster context");
              } else if (detectedClientFid === 309857) {
                console.log("🎯 Farcaster: Detected Coinbase Wallet context");
              } else {
                console.log("🎯 Farcaster: Unknown clientFid:", detectedClientFid);
              }
            }
            
            // Mark SDK as ready
            await sdk.actions.ready({
              disableNativeGestures: true,
            });
            
            console.log("🎯 Farcaster: SDK ready with context:", {
              user: frameContext.user,
              location: frameContext.location,
              clientFid: detectedClientFid,
            });
          } else {
            console.log("🎯 Farcaster: No context received despite being in mini app");
          }
        } else {
          console.log("🎯 Farcaster: Not in mini app environment");
        }

        setIsSDKLoaded(true);
        setError(null);
      } catch (err) {
        const errorMessage = err instanceof Error 
          ? err.message 
          : "Failed to initialize Farcaster Frames SDK";
        
        console.error("🎯 Farcaster: SDK initialization error:", err);
        setError(errorMessage);
        
        // Set defaults for failed initialization
        setIsInMiniApp(false);
        setContext(null);
        setActions(null);
      } finally {
        setIsLoading(false);
        setIsSDKLoaded(true); // Mark as loaded even if failed, to prevent retry loops
      }
    };

    // Only initialize if we haven't attempted yet
    if (!initializationAttempted.current) {
      initializeFarcasterSDK();
    }
  }, []);

  // Debug logging
  useEffect(() => {
    console.log("🎯 Farcaster: State update:", {
      isSDKLoaded,
      isInMiniApp,
      hasContext: !!context,
      hasActions: !!actions,
      error,
      isLoading,
      clientFid,
      isInFarcasterContext,
      isInCoinbaseWalletContext,
      isBrowserContext,
    });
  }, [isSDKLoaded, isInMiniApp, context, actions, error, isLoading, clientFid, isInFarcasterContext, isInCoinbaseWalletContext, isBrowserContext]);

  const value = {
    context,
    actions,
    isSDKLoaded,
    isInMiniApp,
    error,
    isLoading,
    clientFid,
    isInFarcasterContext,
    isInCoinbaseWalletContext,
    isBrowserContext,
  };

  return (
    <FrameProviderContext.Provider value={value}>
      {children}
    </FrameProviderContext.Provider>
  );
}

export function useFrame() {
  const context = useContext(FrameProviderContext);
  if (context === undefined) {
    throw new Error("useFrame must be used within a FrameProvider");
  }
  return context;
}
