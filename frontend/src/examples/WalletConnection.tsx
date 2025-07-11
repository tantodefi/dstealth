"use client";

import farcasterFrame from "@farcaster/frame-wagmi-connector";
import { useCallback, useEffect, useState, useRef } from "react";
import { hexToUint8Array } from "uint8array-extras";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import {
  injected,
  useAccount,
  useConnect,
  useSignMessage,
  useWalletClient,
} from "wagmi";
import { coinbaseWallet } from "wagmi/connectors";
import { Button } from "@/components/Button";
import { useFrame } from "@/context/frame-context";
import { useXMTP } from "@/context/xmtp-context";
import { env } from "@/lib/env";
import {
  createEOASigner,
  createEphemeralSigner,
  createSCWSigner,
} from "@/lib/xmtp";
import { WelcomeMessage } from "@/components/WelcomeMessage";
// OnchainKit imports for Coinbase wallet
import {
  Avatar,
  Name,
  Identity,
  EthBalance,
  Badge,
  Address,
} from '@coinbase/onchainkit/identity';
import { Wallet, WalletDropdown, WalletDropdownLink, WalletDropdownDisconnect } from '@coinbase/onchainkit/wallet';

// Simple local storage keys - use consistent naming
const XMTP_CONNECTION_TYPE_KEY = "xmtp:connectionType";
const XMTP_EPHEMERAL_KEY = "xmtp:ephemeralKey";

export default function WalletConnection() {
  const { 
    context, 
    isInMiniApp, 
    clientFid, 
    isInFarcasterContext, 
    isInCoinbaseWalletContext, 
    isBrowserContext 
  } = useFrame();
  const { 
    initialize, 
    initializing, 
    client, 
    error, 
    connectionType: xmtpConnectionType,
    farcasterUser,
    clearErrorAndRetry
  } = useXMTP();
  const { data: walletData } = useWalletClient();
  const { connect, connectors } = useConnect();
  const { isConnected, connector, address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [localConnectionType, setLocalConnectionType] = useState<string>("");
  const [ephemeralAddress, setEphemeralAddress] = useState<string>("");
  const [localInitializing, setLocalInitializing] = useState(false);
  
  // Refs to prevent multiple connection attempts
  const connectionAttemptRef = useRef<string>("");
  const initializationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Determine if user is fully connected
  const isEphemeralConnection = xmtpConnectionType === "ephemeral" || xmtpConnectionType === "Ephemeral Wallet";
  const hasWalletConnection = isConnected && address;
  const hasEphemeralConnection = isEphemeralConnection && ephemeralAddress;
  const isFullyConnected = !!client && (hasWalletConnection || hasEphemeralConnection);
  const isCoinbaseWallet = connector?.id === "coinbaseWalletSDK";

  // Detect wallet environment for better UX
  const walletEnvironment = {
    isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
    isInApp: /FBAN|FBAV|Instagram|Twitter|WeChat|Line/i.test(navigator.userAgent),
    isFarcaster: isInFarcasterContext,
    isCoinbaseApp: /CoinbaseWallet/i.test(navigator.userAgent),
  };

  // Sync local connection type with XMTP context
  useEffect(() => {
    if (xmtpConnectionType && xmtpConnectionType !== localConnectionType) {
      setLocalConnectionType(xmtpConnectionType);
    }
  }, [xmtpConnectionType, localConnectionType]);

  // Get the appropriate signer based on connection type
  const getSigner = useCallback(() => {
    if (!localConnectionType) return null;

    if (localConnectionType === "ephemeral") {
      const savedPrivateKey = localStorage.getItem(XMTP_EPHEMERAL_KEY);
      if (savedPrivateKey) {
        const formattedKey = savedPrivateKey.startsWith("0x")
          ? (savedPrivateKey as `0x${string}`)
          : (`0x${savedPrivateKey}` as `0x${string}`);

        return createEphemeralSigner(formattedKey);
      }
    }

    if (!isConnected || !walletData) return null;

    if (localConnectionType === "eoa") {
      return createEOASigner(walletData.account.address, async ({ message }) => {
        return await signMessageAsync({ 
          message, 
          account: walletData.account.address 
        });
      });
    }

    if (localConnectionType === "scw" && connector?.id === "coinbaseWalletSDK") {
      return createSCWSigner(
        walletData.account.address,
        async ({ message }) => {
          return await signMessageAsync({ 
            message, 
            account: walletData.account.address 
          });
        },
        BigInt(8453), // Use Base chain ID for smart wallets
        true // Force SCW mode
      );
    }

    return null;
  }, [localConnectionType, isConnected, walletData, connector, signMessageAsync]);

  const initializeXmtp = useCallback(
    async (signer: any, connectionTypeOverride?: string) => {
      if (initializing || localInitializing || !signer) return;

      setLocalInitializing(true);
      connectionAttemptRef.current = connectionTypeOverride || localConnectionType;

      // Set timeout for initialization - reduced from 30s to 20s
      initializationTimeoutRef.current = setTimeout(() => {
        console.log("⏰ XMTP initialization timeout after 20 seconds");
        setLocalInitializing(false);
        connectionAttemptRef.current = "";
      }, 20000);

      try {
        console.log(`🚀 Initializing XMTP with signer for connection type: ${connectionTypeOverride || localConnectionType}`);
        
        const result = await initialize({
          dbEncryptionKey: env.NEXT_PUBLIC_ENCRYPTION_KEY ? hexToUint8Array(env.NEXT_PUBLIC_ENCRYPTION_KEY) : undefined,
          env: env.NEXT_PUBLIC_XMTP_ENV,
          loggingLevel: "off",
          signer,
          connectionType: connectionTypeOverride || localConnectionType,
        });
        
        if (result) {
          console.log(`✅ XMTP initialization successful for ${connectionTypeOverride || localConnectionType}`);
        }
      } catch (error) {
        console.error("❌ Error initializing XMTP:", error);

        // Enhanced error handling for specific error types
        const errorMessage = error && (error as any).message;
        
        if (errorMessage?.includes("rejected due to a change in selected network") ||
            errorMessage?.includes("User rejected") ||
            errorMessage?.includes("User denied") ||
            errorMessage?.includes("user rejected")) {
          console.log("👤 User-related error, clearing connection type to allow retry");
          localStorage.removeItem(XMTP_CONNECTION_TYPE_KEY);
          setLocalConnectionType("");
        } else if (errorMessage?.includes("Signature") || errorMessage?.includes("sign")) {
          console.log("🔏 Signature error detected, checking if we need to switch signer type");
          console.error("Signature error", errorMessage);
          
          // For Coinbase wallets, the calling code should handle SCW->EOA fallback
          // Just pass the error up
        } else if (errorMessage?.includes("createSyncAccessHandle") || 
                   errorMessage?.includes("NoModificationAllowedError")) {
          console.log("🗃️ Database access conflict, will retry automatically later");
        } else {
          console.log("❓ Other error type, keeping connection type for potential retry");
        }
        
        // Re-throw to let caller handle
        throw error;
      } finally {
        setLocalInitializing(false);
        connectionAttemptRef.current = "";
        if (initializationTimeoutRef.current) {
          clearTimeout(initializationTimeoutRef.current);
        }
      }
    },
    [initialize, initializing, client, localConnectionType, address, error],
  );

  // Load saved connection on mount - but don't auto-restore since XMTP context handles it
  useEffect(() => {
    // Only load the local connection type to sync UI, don't auto-initialize
    const savedConnectionType = localStorage.getItem(XMTP_CONNECTION_TYPE_KEY);
    if (savedConnectionType && !localConnectionType) {
      setLocalConnectionType(savedConnectionType);
    }

    // Set ephemeral address if needed for display
    if (savedConnectionType === "ephemeral") {
      const savedPrivateKey = localStorage.getItem(XMTP_EPHEMERAL_KEY);
      if (savedPrivateKey) {
        const formattedKey = savedPrivateKey.startsWith("0x")
          ? (savedPrivateKey as `0x${string}`)
          : (`0x${savedPrivateKey}` as `0x${string}`);

        const account = privateKeyToAccount(formattedKey);
        setEphemeralAddress(account.address);
      }
    }
  }, [localConnectionType]);

  // Manual initialization trigger when conditions are met and user explicitly clicked
  useEffect(() => {
    // Don't auto-initialize - this is now handled by XMTP context
    // This effect is mainly for keeping local state in sync
    
    if (localConnectionType && !client && !initializing && !localInitializing && !error) {
      const signer = getSigner();
      if (signer) {
        console.log(`Signer available for ${localConnectionType}, but waiting for explicit user action or XMTP context initialization`);
      }
    }
  }, [
    localConnectionType,
    client,
    initializing,
    localInitializing,
    isConnected,
    walletData,
    connector,
    getSigner,
    error,
  ]);

  // Enhanced Farcaster auto-connection
  useEffect(() => {
    if (!isConnected && isInFarcasterContext && context && !address) {
      console.log("Connecting to Farcaster frame connector");
      const farcasterConnector = connectors.find(c => c.id === 'farcasterFrame');
      if (farcasterConnector) {
        connect({ connector: farcasterConnector });
      } else {
        // Fallback to creating the connector
        connect({ connector: farcasterFrame() });
      }
    }
  }, [isConnected, address, isInFarcasterContext, context, connect, connectors]);

  // Note: Auto-connection for Coinbase Wallet context is now handled in the main page component
  // to ensure proper coordination with ephemeral XMTP initialization

  // Auto-initialize XMTP when wallet connects after user chose connection type
  useEffect(() => {
    // Only proceed if:
    // 1. Wallet is connected
    // 2. User has chosen a connection type (but it's not Coinbase wallet - that has its own handler)
    // 3. XMTP is not already connected or initializing
    // 4. We have a valid signer
    if (
      isConnected && 
      localConnectionType && 
      localConnectionType !== "ephemeral" &&
      connector?.id !== "coinbaseWalletSDK" && 
      !client && 
      !initializing && 
      !localInitializing && 
      !error
    ) {
      const signer = getSigner();
      if (signer) {
        console.log(`🚀 Wallet connected! Auto-initializing XMTP for ${localConnectionType}...`);
        initializeXmtp(signer, localConnectionType).catch((error) => {
          console.error("Auto-initialization failed:", error);
        });
      }
    }
  }, [
    isConnected, 
    localConnectionType, 
    connector?.id, 
    client, 
    initializing, 
    localInitializing, 
    error,
    getSigner,
    initializeXmtp
  ]);

  // Connect with EOA wallet
  const connectWithEOA = useCallback(() => {
    if (initializing || localInitializing) return;

    console.log("Connecting with EOA wallet...");
    setLocalConnectionType("eoa");
    localStorage.setItem(XMTP_CONNECTION_TYPE_KEY, "eoa");

    if (!isConnected) {
      console.log("Wallet not connected, attempting to connect...");
      try {
        if (walletEnvironment.isFarcaster && context) {
          console.log("Connecting with Farcaster frame");
          const farcasterConnector = connectors.find(c => c.id === 'farcasterFrame');
          if (farcasterConnector) {
            connect({ connector: farcasterConnector });
          } else {
            connect({ connector: farcasterFrame() });
          }
        } else {
          console.log("Connecting with injected wallet");
          const injectedConnector = connectors.find(c => c.id === 'injected' || c.type === 'injected');
          if (injectedConnector) {
            connect({ connector: injectedConnector });
          } else {
            connect({ connector: injected() });
          }
        }
        // Note: XMTP initialization will be handled by the auto-initialization effect above
      } catch (connectError) {
        console.error("Error connecting wallet:", connectError);
        // Clear connection type if wallet connection fails
        localStorage.removeItem(XMTP_CONNECTION_TYPE_KEY);
        setLocalConnectionType("");
      }
    } else {
      // If wallet is already connected, manually trigger XMTP initialization
      const signer = getSigner();
      if (signer) {
        initializeXmtp(signer, "eoa");
      }
    }
  }, [
    connect,
    isConnected,
    initializing,
    localInitializing,
    context,
    connectors,
    walletEnvironment.isFarcaster,
    getSigner,
    initializeXmtp,
  ]);

  // Connect with Ephemeral Wallet
  const connectWithEphemeral = useCallback(() => {
    if (initializing || localInitializing) return;

    console.log("Connecting with Ephemeral wallet...");
    setLocalConnectionType("ephemeral");

    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    setEphemeralAddress(account.address);

    localStorage.setItem(XMTP_EPHEMERAL_KEY, privateKey);
    localStorage.setItem(XMTP_CONNECTION_TYPE_KEY, "ephemeral");

    console.log("Created ephemeral address:", account.address);
    initializeXmtp(createEphemeralSigner(privateKey), "ephemeral");
  }, [initializeXmtp, initializing, localInitializing]);

  // Enhanced Coinbase Smart Wallet connection with better error handling
  useEffect(() => {
    let initTimeout: NodeJS.Timeout;
    let retryTimeout: NodeJS.Timeout;

    const attemptInitialization = async () => {
      if (localInitializing || initializing || !isConnected || connector?.id !== "coinbaseWalletSDK") {
        return;
      }

      // For Coinbase Wallet, try SCW first, then fallback to EOA
      console.log("Attempting XMTP initialization with Coinbase Wallet");
      
      // First try SCW mode
      try {
        setLocalConnectionType("scw");
        localStorage.setItem(XMTP_CONNECTION_TYPE_KEY, "scw");
        
        const scwSigner = getSigner();
        if (scwSigner) {
          console.log("🔹 Trying SCW mode first");
          await initializeXmtp(scwSigner, "scw");
        }
      } catch (scwError) {
        console.error("❌ SCW mode failed:", scwError);
        
        // If SCW fails due to signature issues, try EOA mode
        const errorMessage = scwError && (scwError as any).message;
        if (errorMessage?.includes("Signature") || 
            errorMessage?.includes("sign") || 
            errorMessage?.includes("rejected") ||
            errorMessage?.includes("denied")) {
          
          console.log("🔄 SCW failed, trying EOA mode as fallback");
          
          retryTimeout = setTimeout(async () => {
            try {
              setLocalConnectionType("eoa");
              localStorage.setItem(XMTP_CONNECTION_TYPE_KEY, "eoa");
              
              const eoaSigner = getSigner();
              if (eoaSigner) {
                console.log("🔹 Trying EOA mode as fallback");
                await initializeXmtp(eoaSigner, "eoa");
              }
            } catch (eoaError) {
              console.error("❌ EOA fallback also failed:", eoaError);
              // Both modes failed - this is a real error
            }
          }, 1000); // 1 second delay for fallback
        }
      }
    };
    
    if (isConnected && connector?.id === "coinbaseWalletSDK" && !localConnectionType && !error) {
      console.log("🔗 Coinbase Wallet connected, preparing XMTP initialization...");
      
      // Add a delay for mobile to ensure wallet is fully ready
      initTimeout = setTimeout(attemptInitialization, 1500);
    }

    return () => {
      if (initTimeout) {
        clearTimeout(initTimeout);
      }
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
    };
  }, [isConnected, connector, localConnectionType, getSigner, initializeXmtp, initializing, localInitializing, error]);

  // Disabled: Cleanup effect was interfering with connection process
  // The main disconnect scenarios (page refresh, explicit disconnect) reset state anyway
  /*
  useEffect(() => {
    // Only clean up if:
    // 1. Wallet is actually disconnected (not just during connection process)
    // 2. We had a connection type set for non-ephemeral wallets  
    // 3. We're not in the middle of initialization
    // 4. The user hasn't just clicked a connection button recently
    if (
      !isConnected && 
      (localConnectionType === "scw" || localConnectionType === "eoa") &&
      !localInitializing &&
      !initializing
    ) {
      // Much longer delay and additional checks to prevent cleanup during connection
      const cleanupTimeout = setTimeout(() => {
        // Triple-check we're still disconnected and not in any initialization state
        if (!isConnected && !localInitializing && !initializing) {
          console.log("Wallet truly disconnected after delay, cleaning up...");
          localStorage.removeItem(XMTP_CONNECTION_TYPE_KEY);
          setLocalConnectionType("");
        } else {
          console.log("Connection state changed during cleanup delay, skipping cleanup");
        }
      }, 5000); // 5 second delay to prevent cleanup during connection process

      return () => {
        clearTimeout(cleanupTimeout);
      };
    }
  }, [isConnected, localConnectionType, localInitializing, initializing]);
  */

  const connectWithCoinbaseSmartWallet = useCallback(() => {
    if (initializing || localInitializing) return;

    console.log("Connecting with Coinbase Smart Wallet...");
    
    if (!isConnected || connector?.id !== "coinbaseWalletSDK") {
      console.log("Connecting to Coinbase Wallet...");
      
      // Set connection type first (will be handled by Coinbase-specific auto-initialization)
      setLocalConnectionType("scw");
      localStorage.setItem(XMTP_CONNECTION_TYPE_KEY, "scw");
      
      try {
        // Find the Coinbase connector
        const coinbaseConnector = connectors.find(c => 
          c.id === 'coinbaseWalletSDK' || 
          c.name?.includes('Coinbase')
        );
        
        if (coinbaseConnector) {
          connect({ connector: coinbaseConnector });
        } else {
          // Fallback to creating new connector
          connect({
            connector: coinbaseWallet({
              appName: "XMTP Mini App",
              preference: "smartWalletOnly",
            }),
          });
        }
        // Note: XMTP initialization will be handled by the Coinbase-specific effect
      } catch (error) {
        console.error("Error connecting to Coinbase Wallet:", error);
        setLocalInitializing(false);
        localStorage.removeItem(XMTP_CONNECTION_TYPE_KEY);
        setLocalConnectionType("");
      }
    } else {
      // If already connected with Coinbase wallet, manually trigger XMTP initialization
      setLocalConnectionType("scw");
      localStorage.setItem(XMTP_CONNECTION_TYPE_KEY, "scw");
      
      const signer = getSigner();
      if (signer) {
        console.log("Initializing XMTP with existing SCW signer");
        initializeXmtp(signer, "scw").catch((error) => {
          console.error("Error initializing XMTP:", error);
          localStorage.removeItem(XMTP_CONNECTION_TYPE_KEY);
          setLocalConnectionType("");
        });
      }
    }
  }, [connect, initializing, localInitializing, isConnected, connector, connectors, getSigner, initializeXmtp]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (initializationTimeoutRef.current) {
        clearTimeout(initializationTimeoutRef.current);
      }
    };
  }, []);

  // Retry connection function
  const retryConnection = useCallback(() => {
    console.log("🔄 Retry connection clicked - clearing error state");
    
    // Use the new clearErrorAndRetry function from XMTP context
    clearErrorAndRetry();
    
    // Reset local state
    setLocalConnectionType("");
    setLocalInitializing(false);
    setEphemeralAddress("");
    
    // Clear local storage items that might be causing issues
    localStorage.removeItem(XMTP_CONNECTION_TYPE_KEY);
    localStorage.removeItem(XMTP_EPHEMERAL_KEY);
    
    console.log("✅ Error state cleared, ready for fresh connection attempt");
  }, [clearErrorAndRetry]);

  // Show WelcomeMessage if user is fully connected
  if (isFullyConnected) {
    // Enhanced Coinbase wallet display with OnchainKit components
    if (isCoinbaseWallet && isConnected) {
      return (
        <div className="w-full">
          <div className="bg-gray-800 py-3 px-4 rounded-lg">
            <Wallet>
              <Identity
                address={address}
                className="bg-transparent"
              >
                <Avatar />
                <Name />
                <Address />
                <EthBalance />
                <Badge />
              </Identity>
              <WalletDropdown>
                <WalletDropdownLink icon="wallet" href="/wallet">
                  Wallet
                </WalletDropdownLink>
                <WalletDropdownDisconnect />
              </WalletDropdown>
            </Wallet>
          </div>
        </div>
      );
    }
    
    // For other wallet types and ephemeral connections
    return <WelcomeMessage />;
  }

  // Enhanced UI for Farcaster context
  if (isInFarcasterContext && client) {
    return (
      <div className="w-full flex flex-col gap-4 text-center py-8">
        <div className="text-green-400 text-lg font-medium">
          ✅ Connected via Farcaster
        </div>
        {farcasterUser && (
          <div className="text-white">
            Welcome, {farcasterUser.displayName || farcasterUser.username}!
          </div>
        )}
        <div className="text-gray-400 text-sm">
          Your XMTP client is ready to use.
        </div>
      </div>
    );
  }

  // Show connection buttons only if not fully connected
  return (
    <div className="w-full flex flex-col gap-4">
      {/* Context indicator */}
      {isInCoinbaseWalletContext && (
        <div className="bg-blue-900/20 border border-blue-600/30 rounded-lg p-3 text-xs text-blue-200">
          📱 Coinbase Wallet detected - {!client ? "Setting up ephemeral XMTP..." : "Ready"}
        </div>
      )}
      {isInFarcasterContext && (
        <div className="bg-purple-900/20 border border-purple-600/30 rounded-lg p-3 text-xs text-purple-200">
          🎯 Farcaster Frame detected - Auto-prompting wallet connection
        </div>
      )}
      {isBrowserContext && (
        <div className="bg-green-900/20 border border-green-600/30 rounded-lg p-3 text-xs text-green-200">
          🌐 Browser context - Choose your connection method
        </div>
      )}
      {walletEnvironment.isMobile && (
        <div className="bg-blue-900/20 border border-blue-600/30 rounded-lg p-3 text-xs text-blue-200">
          📱 Mobile detected - optimized connection flow active
        </div>
      )}

      {/* Debug Information - only show in development or if there are issues */}
      {(env.NEXT_PUBLIC_APP_ENV === "development" || error) && (
        <div className="bg-gray-800 p-3 rounded text-xs text-gray-300">
          <div className="font-bold mb-2">Debug Info:</div>
          <div>Local Connection Type: {localConnectionType || "None"}</div>
          <div>XMTP Connection Type: {xmtpConnectionType || "None"}</div>
          <div>Wallet Connected: {isConnected ? "Yes" : "No"}</div>
          <div>Wallet Address: {address || "None"}</div>
          <div>Ephemeral Address: {ephemeralAddress || "None"}</div>
          <div>XMTP Client: {client ? "Connected" : "Not Connected"}</div>
          <div>XMTP Initializing: {initializing ? "Yes" : "No"}</div>
          <div>Local Initializing: {localInitializing ? "Yes" : "No"}</div>
          <div>Connector: {connector?.id || "None"}</div>
          <div>Environment: {env.NEXT_PUBLIC_XMTP_ENV}</div>
          <div>Has Encryption Key: {env.NEXT_PUBLIC_ENCRYPTION_KEY ? "Yes" : "No"}</div>
          <div>In Farcaster Context: {isInFarcasterContext ? "Yes" : "No"}</div>
          <div>In Coinbase Wallet Context: {isInCoinbaseWalletContext ? "Yes" : "No"}</div>
          <div>In Browser Context: {isBrowserContext ? "Yes" : "No"}</div>
          <div>Client FID: {clientFid || "None"}</div>
          <div>User Agent: {typeof window !== 'undefined' ? navigator.userAgent.substring(0, 50) + '...' : 'N/A'}</div>
          <div>Has Ethereum: {typeof window !== 'undefined' && typeof window.ethereum !== 'undefined' ? "Yes" : "No"}</div>
          <div>Is Coinbase Provider: {typeof window !== 'undefined' && window.ethereum?.isCoinbaseWallet ? "Yes" : "No"}</div>
          <div>Connection Attempt: {connectionAttemptRef.current || "None"}</div>
          <div>Fully Connected: {isFullyConnected ? "Yes" : "No"}</div>
          <div>Available Connectors: {connectors.map(c => c.id).join(", ")}</div>
          {error && (
            <div className="text-red-400 mt-2">
              <div className="font-bold">Error:</div>
              <div>{error.message}</div>
              {error.message.includes("Signature validation failed") && (
                <div className="text-yellow-400 mt-1 text-xs">
                  💡 This usually happens with Coinbase Smart Wallets. Try the "Clear Error & Retry" button below.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="w-full flex flex-col gap-3 mt-2">
        {/* Show retry button if there's an error */}
        {error && (
          <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3 mb-2">
            <div className="text-red-400 font-medium mb-2">
              ⚠️ Connection Error
            </div>
            <div className="text-red-300 text-sm mb-3">
              {error.message.includes("Signature validation failed") 
                ? "Coinbase Smart Wallet signature issue detected. This can happen due to cached connection state."
                : "Connection failed. Please try again."
              }
            </div>
            <Button
              className="w-full bg-red-600 hover:bg-red-700 text-white font-medium"
              size="lg"
              onClick={retryConnection}>
              🔄 Clear Error & Retry Connection
            </Button>
          </div>
        )}

        {/* Show context-appropriate connection options */}
        {isInCoinbaseWalletContext ? (
          // Coinbase Wallet context - show appropriate message based on state
          <div className="bg-blue-900/20 border border-blue-600/30 rounded-lg p-4 text-center">
            {!client ? (
              <>
                <div className="text-blue-300 text-lg font-medium mb-2">
                  🚀 Coinbase Wallet Detected
                </div>
                <div className="text-blue-200 text-sm">
                  Setting up ephemeral XMTP connection...
                </div>
                <div className="mt-3">
                  <div className="animate-spin inline-block w-4 h-4 border-2 border-blue-300 border-t-transparent rounded-full"></div>
                </div>
                <div className="text-blue-100 text-xs mt-2">
                  No wallet signatures required - using privacy-first ephemeral connection
                </div>
              </>
            ) : (
              <>
                <div className="text-green-300 text-lg font-medium mb-2">
                  ✅ Coinbase Wallet Ready
                </div>
                <div className="text-green-200 text-sm">
                  Ephemeral XMTP connection active
                </div>
              </>
            )}
          </div>
        ) : isInFarcasterContext ? (
          // Farcaster context - show prompt for wallet connection
          <div className="flex flex-col gap-3">
            <div className="bg-purple-900/20 border border-purple-600/30 rounded-lg p-4 text-center">
              <div className="text-purple-300 text-lg font-medium mb-2">
                🎯 Farcaster Frame Detected
              </div>
              <div className="text-purple-200 text-sm">
                Please connect your wallet to continue
              </div>
            </div>
            <Button
              className="w-full bg-transparent text-white hover:bg-gray-100 hover:text-black "
              size="lg"
              onClick={connectWithEOA}
              disabled={initializing || localInitializing}>
              {(initializing || localInitializing) && localConnectionType === "eoa"
                ? "Connecting Wallet..."
                : "Connect Wallet"}
            </Button>
          </div>
        ) : (
          // Browser context - show all connection options
          <div className="flex flex-col gap-3">
            <Button
              className="w-full bg-transparent text-white hover:bg-gray-100 hover:text-black "
              size="lg"
              onClick={connectWithEOA}
              disabled={initializing || localInitializing}>
              {(initializing || localInitializing) && localConnectionType === "eoa"
                ? "Connecting EOA Wallet..."
                : "Connect with EOA Wallet"}
            </Button>

            <Button
              className="w-full bg-transparent text-white hover:bg-gray-100 hover:text-black "
              size="lg"
              onClick={connectWithEphemeral}
              disabled={initializing || localInitializing}>
              {(initializing || localInitializing) && localConnectionType === "ephemeral"
                ? "Connecting Ephemeral Wallet..."
                : "Connect with Ephemeral Wallet"}
            </Button>

            <Button
              className="w-full bg-transparent text-white hover:bg-gray-100 hover:text-black "
              size="lg"
              onClick={connectWithCoinbaseSmartWallet}
              disabled={initializing || localInitializing}>
              {(initializing || localInitializing) && (localConnectionType === "scw" || localConnectionType === "eoa")
                ? `Connecting ${localConnectionType.toUpperCase()} Wallet...`
                : "Connect with Coinbase Smart Wallet"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
