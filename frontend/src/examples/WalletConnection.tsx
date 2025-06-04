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

// Simple local storage keys - use consistent naming
const XMTP_CONNECTION_TYPE_KEY = "xmtp:connectionType";
const XMTP_EPHEMERAL_KEY = "xmtp:ephemeralKey";

export default function WalletConnection() {
  const { context, isInMiniApp } = useFrame();
  const { 
    initialize, 
    initializing, 
    client, 
    error, 
    connectionType: xmtpConnectionType,
    isInFarcasterContext,
    farcasterUser
  } = useXMTP();
  const { data: walletData } = useWalletClient();
  const { connect } = useConnect();
  const { isConnected, connector, address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [localConnectionType, setLocalConnectionType] = useState<string>("");
  const [ephemeralAddress, setEphemeralAddress] = useState<string>("");
  const [localInitializing, setLocalInitializing] = useState(false);
  
  // Refs to prevent multiple connection attempts
  const connectionAttemptRef = useRef<string>("");
  const initializationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sync local connection type with XMTP context
  useEffect(() => {
    if (xmtpConnectionType && xmtpConnectionType !== localConnectionType) {
      setLocalConnectionType(xmtpConnectionType);
    }
  }, [xmtpConnectionType, localConnectionType]);

  // Get the appropriate signer based on connection type
  const getSigner = useCallback(() => {
    if (!localConnectionType) return null;

    if (localConnectionType === "ephemeral" || localConnectionType === "Ephemeral Wallet") {
      const savedPrivateKey = localStorage.getItem(XMTP_EPHEMERAL_KEY);
      if (savedPrivateKey) {
        const formattedKey = savedPrivateKey.startsWith("0x")
          ? (savedPrivateKey as `0x${string}`)
          : (`0x${savedPrivateKey}` as `0x${string}`);

        return createEphemeralSigner(formattedKey);
      }
    }

    if (!isConnected || !walletData) return null;

    if (localConnectionType === "EOA Wallet" || localConnectionType === "eoa") {
      return createEOASigner(walletData.account.address, signMessageAsync);
    }

    if (
      (localConnectionType === "Coinbase Smart Wallet" || localConnectionType === "scw") &&
      connector?.id === "coinbaseWalletSDK"
    ) {
      return createSCWSigner(
        walletData.account.address,
        signMessageAsync,
        BigInt(mainnet.id),
      );
    }

    return null;
  }, [localConnectionType, isConnected, walletData, connector, signMessageAsync]);

  // Initialize XMTP client with wallet signer
  const initializeXmtp = useCallback(
    async (signer: any, connectionTypeOverride?: string) => {
      const connectionKey = `${connectionTypeOverride || localConnectionType}-${address || 'ephemeral'}`;
      
      // Prevent duplicate initialization attempts for the same connection
      if (connectionAttemptRef.current === connectionKey) {
        console.log("Duplicate initialization attempt prevented for:", connectionKey);
        return;
      }

      // Prevent duplicate initialization
      if (initializing || localInitializing || client) {
        console.log("XMTP initialization already in progress or client exists");
        return;
      }

      connectionAttemptRef.current = connectionKey;
      setLocalInitializing(true);

      // Clear any existing timeout
      if (initializationTimeoutRef.current) {
        clearTimeout(initializationTimeoutRef.current);
      }

      // Set a timeout to reset the initialization state if it gets stuck
      initializationTimeoutRef.current = setTimeout(() => {
        console.log("Initialization timeout reached, resetting state");
        setLocalInitializing(false);
        connectionAttemptRef.current = "";
      }, 30000); // 30 second timeout

      try {
        console.log("Initializing XMTP with signer for connection type:", connectionTypeOverride || localConnectionType);
        
        const result = await initialize({
          dbEncryptionKey: env.NEXT_PUBLIC_ENCRYPTION_KEY ? hexToUint8Array(env.NEXT_PUBLIC_ENCRYPTION_KEY) : undefined,
          env: env.NEXT_PUBLIC_XMTP_ENV,
          loggingLevel: "off",
          signer,
          connectionType: connectionTypeOverride || (localConnectionType === "Ephemeral Wallet" ? "ephemeral" : 
                          localConnectionType === "Coinbase Smart Wallet" ? "scw" : "eoa"),
        });
        
        if (result) {
          console.log("XMTP initialization successful for", connectionTypeOverride || localConnectionType);
        }
      } catch (error) {
        console.error("Error initializing XMTP:", error);

        // Handle specific error types
        const errorMessage = error && (error as any).message;
        if (errorMessage?.includes("rejected due to a change in selected network") ||
            errorMessage?.includes("User rejected") ||
            errorMessage?.includes("User denied") ||
            errorMessage?.includes("user rejected")) {
          console.log("User-related error, clearing connection type to allow retry");
          localStorage.removeItem(XMTP_CONNECTION_TYPE_KEY);
          setLocalConnectionType("");
        } else if (errorMessage?.includes("Signature")) {
          console.log("Signature error detected, clearing connection type to prevent loops");
          localStorage.removeItem(XMTP_CONNECTION_TYPE_KEY);
          setLocalConnectionType("");
        } else if (errorMessage?.includes("createSyncAccessHandle") || 
                   errorMessage?.includes("NoModificationAllowedError")) {
          console.log("Database access conflict, will retry automatically later");
        } else {
          console.log("Other error type, keeping connection type for potential retry");
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
    if (savedConnectionType === "ephemeral" || savedConnectionType === "Ephemeral Wallet") {
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

  // Farcaster auto-connection is now handled by XMTP context
  // Just ensure wagmi connection happens
  useEffect(() => {
    if (!isConnected && isInFarcasterContext && context && !address) {
      console.log("Connecting to Farcaster frame connector");
      connect({ connector: farcasterFrame() });
    }
  }, [isConnected, address, isInFarcasterContext, context, connect]);

  // Connect with EOA wallet
  const connectWithEOA = useCallback(() => {
    if (initializing || localInitializing) return;

    console.log("Connecting with EOA wallet...");
    setLocalConnectionType("EOA Wallet");
    localStorage.setItem(XMTP_CONNECTION_TYPE_KEY, "EOA Wallet");

    if (!isConnected) {
      console.log("Wallet not connected, attempting to connect...");
      try {
        if (context && isInMiniApp) {
          console.log("Connecting with Farcaster frame");
          connect({ connector: farcasterFrame() });
        } else {
          console.log("Connecting with injected wallet");
          connect({ connector: injected() });
        }
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
    isInMiniApp,
    getSigner,
    initializeXmtp,
  ]);

  // Connect with Ephemeral Wallet
  const connectWithEphemeral = useCallback(() => {
    if (initializing || localInitializing) return;

    setLocalConnectionType("Ephemeral Wallet");

    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    setEphemeralAddress(account.address);

    localStorage.setItem(XMTP_EPHEMERAL_KEY, privateKey);
    localStorage.setItem(XMTP_CONNECTION_TYPE_KEY, "Ephemeral Wallet");

    initializeXmtp(createEphemeralSigner(privateKey), "ephemeral");
  }, [initializeXmtp, initializing, localInitializing]);

  // Manual retry function to clear errors and reset state
  const retryConnection = useCallback(() => {
    console.log("Manual retry triggered - clearing all state");
    
    // Clear all localStorage items
    localStorage.removeItem(XMTP_CONNECTION_TYPE_KEY);
    localStorage.removeItem(XMTP_EPHEMERAL_KEY);
    
    // Reset local state
    setLocalConnectionType("");
    setEphemeralAddress("");
    setLocalInitializing(false);
    connectionAttemptRef.current = "";
    
    // Clear timeout
    if (initializationTimeoutRef.current) {
      clearTimeout(initializationTimeoutRef.current);
    }
    
    console.log("State cleared - ready for fresh connection attempt");
  }, []);

  // Connect with Coinbase Smart Wallet
  const connectWithCoinbaseSmartWallet = useCallback(() => {
    if (initializing || localInitializing) return;

    setLocalConnectionType("Coinbase Smart Wallet");
    localStorage.setItem(XMTP_CONNECTION_TYPE_KEY, "Coinbase Smart Wallet");

    if (!isConnected || connector?.id !== "coinbaseWalletSDK") {
      connect({
        connector: coinbaseWallet({
          appName: "XMTP Mini App",
          preference: { options: "smartWalletOnly" },
        }),
      });
    } else {
      // If already connected with Coinbase wallet, manually trigger XMTP initialization
      const signer = getSigner();
      if (signer) {
        initializeXmtp(signer, "scw");
      }
    }
  }, [connect, initializing, localInitializing, isConnected, connector, getSigner, initializeXmtp]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (initializationTimeoutRef.current) {
        clearTimeout(initializationTimeoutRef.current);
      }
    };
  }, []);

  // Show different UI if we're in Farcaster context and already connected
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

  return (
    <div className="w-full flex flex-col gap-4">
      {/* Debug Information - only show in development or if there are issues */}
      {(env.NEXT_PUBLIC_APP_ENV === "development" || error) && (
        <div className="bg-gray-800 p-3 rounded text-xs text-gray-300">
          <div className="font-bold mb-2">Debug Info:</div>
          <div>Local Connection Type: {localConnectionType || "None"}</div>
          <div>XMTP Connection Type: {xmtpConnectionType || "None"}</div>
          <div>Wallet Connected: {isConnected ? "Yes" : "No"}</div>
          <div>Wallet Address: {address || "None"}</div>
          <div>XMTP Client: {client ? "Connected" : "Not Connected"}</div>
          <div>XMTP Initializing: {initializing ? "Yes" : "No"}</div>
          <div>Local Initializing: {localInitializing ? "Yes" : "No"}</div>
          <div>Connector: {connector?.id || "None"}</div>
          <div>Environment: {env.NEXT_PUBLIC_XMTP_ENV}</div>
          <div>Has Encryption Key: {env.NEXT_PUBLIC_ENCRYPTION_KEY ? "Yes" : "No"}</div>
          <div>In Farcaster Context: {isInFarcasterContext ? "Yes" : "No"}</div>
          <div>Connection Attempt: {connectionAttemptRef.current || "None"}</div>
          {error && (
            <div className="text-red-400 mt-2">
              <div className="font-bold">Error:</div>
              <div>{error.message}</div>
            </div>
          )}
        </div>
      )}

      <div className="w-full flex flex-col gap-3 mt-2">
        {/* Show retry button if there's an error */}
        {error && (
          <Button
            className="w-full bg-red-600 text-white hover:bg-red-700"
            size="lg"
            onClick={retryConnection}>
            Clear Error & Retry
          </Button>
        )}

        <Button
          className="w-full bg-transparent text-white hover:bg-gray-100 hover:text-black "
          size="lg"
          onClick={connectWithEOA}
          disabled={initializing || localInitializing}>
          {(initializing || localInitializing) &&
          (localConnectionType === "EOA Wallet" || localConnectionType === "eoa")
            ? "Connecting EOA Wallet..."
            : "Connect with EOA Wallet"}
        </Button>

        <Button
          className="w-full bg-transparent text-white hover:bg-gray-100 hover:text-black "
          size="lg"
          onClick={connectWithEphemeral}
          disabled={initializing || localInitializing}>
          {(initializing || localInitializing) &&
          (localConnectionType === "Ephemeral Wallet" || localConnectionType === "ephemeral")
            ? "Connecting Ephemeral Wallet..."
            : "Connect with Ephemeral Wallet"}
        </Button>

        <Button
          className="w-full bg-transparent text-white hover:bg-gray-100 hover:text-black "
          size="lg"
          onClick={connectWithCoinbaseSmartWallet}
          disabled={initializing || localInitializing}>
          {(initializing || localInitializing) &&
          (localConnectionType === "Coinbase Smart Wallet" || localConnectionType === "scw")
            ? "Connecting Coinbase Smart Wallet..."
            : "Connect with Coinbase Smart Wallet"}
        </Button>
      </div>
    </div>
  );
}
