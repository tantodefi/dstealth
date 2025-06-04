"use client";

import { useEffect, useState } from "react";
import { useXMTP } from "@/context/xmtp-context";
import { useAccount } from "wagmi";
import { ChevronDown, ChevronUp, Copy } from "lucide-react";
import { privateKeyToAccount } from "viem/accounts";

interface ConnectionStatusProps {
  onConnectionChange?: (isConnected: boolean) => void;
}

export function CollapsibleConnectionInfo({
  onConnectionChange,
}: ConnectionStatusProps) {
  const { client, connectionType: xmtpConnectionType } = useXMTP();
  const { address, isConnected: isWalletConnected } = useAccount();
  const [isActuallyConnected, setIsActuallyConnected] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [connectionDetails, setConnectionDetails] = useState<any>({});
  const [backendStatus, setBackendStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [ephemeralAddress, setEphemeralAddress] = useState<string>("");

  // Check backend connection status
  const checkBackendStatus = async () => {
    try {
      setBackendStatus('checking');
      const response = await fetch('/api/proxy/get-group-id?inboxId=test', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      // If we get any response (even 404 for test inboxId), backend is running
      if (response.status === 404 || response.status === 200 || response.status === 500) {
        setBackendStatus('connected');
      } else {
        setBackendStatus('disconnected');
      }
    } catch (error) {
      console.error('Backend check failed:', error);
      setBackendStatus('disconnected');
    }
  };

  // Check backend status on mount and periodically
  useEffect(() => {
    checkBackendStatus();
    
    // Check every 30 seconds
    const interval = setInterval(checkBackendStatus, 30000);
    
    return () => clearInterval(interval);
  }, []);

  // Get ephemeral address if needed
  useEffect(() => {
    const isEphemeral = xmtpConnectionType === "ephemeral" || xmtpConnectionType === "Ephemeral Wallet";
    if (isEphemeral) {
      const savedPrivateKey = localStorage.getItem("xmtp:ephemeralKey");
      if (savedPrivateKey) {
        try {
          const formattedKey = savedPrivateKey.startsWith("0x")
            ? (savedPrivateKey as `0x${string}`)
            : (`0x${savedPrivateKey}` as `0x${string}`);

          const account = privateKeyToAccount(formattedKey);
          setEphemeralAddress(account.address);
        } catch (error) {
          console.error("Error generating ephemeral address:", error);
          setEphemeralAddress("");
        }
      }
    } else {
      setEphemeralAddress("");
    }
  }, [xmtpConnectionType]);

  // Determine actual connection status and gather details
  useEffect(() => {
    const connectionType = xmtpConnectionType || localStorage.getItem("xmtp:connectionType");
    const ephemeralKey = localStorage.getItem("xmtp:ephemeralKey");
    const environment = localStorage.getItem("xmtp:environment") || "dev";
    
    // Check for ephemeral connection (prioritize XMTP context)
    const isEphemeral = connectionType === "ephemeral" || connectionType === "Ephemeral Wallet";
    
    // Determine if we're actually connected
    const newConnectionState = Boolean(
      // Regular wallet connection
      (isWalletConnected && address) ||
      // Ephemeral wallet connection with XMTP client
      (client && isEphemeral && ephemeralKey) ||
      // Any XMTP client (fallback)
      (client && connectionType)
    );

    setIsActuallyConnected(newConnectionState);

    // Update connection details
    setConnectionDetails({
      walletConnected: isWalletConnected,
      walletAddress: address || ephemeralAddress,
      connectionType: connectionType || "Not set",
      xmtpClient: !!client,
      clientInboxId: client?.inboxId,
      environment: environment,
      ephemeralKey: ephemeralKey ? "Present" : "Not set",
      isEphemeral: isEphemeral,
    });

    if (typeof onConnectionChange === "function") {
      onConnectionChange(newConnectionState);
    }
  }, [isWalletConnected, client, address, ephemeralAddress, xmtpConnectionType, onConnectionChange]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const getBackendStatusColor = () => {
    switch (backendStatus) {
      case 'connected': return 'text-green-400';
      case 'disconnected': return 'text-red-400';
      case 'checking': return 'text-yellow-400';
      default: return 'text-gray-400';
    }
  };

  const getBackendStatusText = () => {
    switch (backendStatus) {
      case 'connected': return '✓ Connected';
      case 'disconnected': return '✗ Disconnected';
      case 'checking': return '⏳ Checking...';
      default: return '? Unknown';
    }
  };

  return (
    <div className="relative">
      {/* Connection Status Indicator - Clickable */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-800 transition-colors"
        title="Click to view connection details"
      >
        <div 
          className={`h-3 w-3 rounded-full ${isActuallyConnected ? "bg-green-500" : "bg-red-500"}`} 
        />
        <span className="text-white text-sm font-medium">
          {isActuallyConnected ? "Connected" : "Disconnected"}
        </span>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        )}
      </button>

      {/* Dropdown Details */}
      {isExpanded && (
        <div className="absolute top-full left-0 mt-1 w-80 bg-gray-900 border border-gray-700 rounded-lg shadow-lg z-50 p-4">
          <h3 className="text-white font-medium mb-3">Connection Details</h3>
          
          <div className="space-y-2 text-sm">
            {/* Frontend Connection Status */}
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Frontend:</span>
              <span className={`${isActuallyConnected ? "text-green-400" : "text-red-400"}`}>
                {isActuallyConnected ? "✓ Connected" : "✗ Disconnected"}
              </span>
            </div>

            {/* Backend Connection Status */}
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Backend:</span>
              <div className="flex items-center gap-2">
                <span className={getBackendStatusColor()}>
                  {getBackendStatusText()}
                </span>
                <button
                  onClick={checkBackendStatus}
                  className="text-xs text-blue-400 hover:text-blue-300"
                  title="Refresh backend status"
                >
                  ↻
                </button>
              </div>
            </div>

            {/* Wallet Connection */}
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Wallet:</span>
              <span className={`${connectionDetails.isEphemeral ? "text-yellow-400" : (connectionDetails.walletConnected ? "text-green-400" : "text-red-400")}`}>
                {connectionDetails.isEphemeral ? "⚡ Ephemeral" : (connectionDetails.walletConnected ? "✓ Connected" : "✗ Not connected")}
              </span>
            </div>

            {/* Wallet Address */}
            {connectionDetails.walletAddress && (
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Address:</span>
                <div className="flex items-center gap-1">
                  <span className="text-white text-xs font-mono">
                    {connectionDetails.walletAddress.slice(0, 6)}...{connectionDetails.walletAddress.slice(-4)}
                  </span>
                  <button
                    onClick={() => copyToClipboard(connectionDetails.walletAddress)}
                    className="text-gray-400 hover:text-blue-400"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )}

            {/* XMTP Client */}
            <div className="flex justify-between items-center">
              <span className="text-gray-400">XMTP Client:</span>
              <span className={`${connectionDetails.xmtpClient ? "text-green-400" : "text-red-400"}`}>
                {connectionDetails.xmtpClient ? "✓ Active" : "✗ Not active"}
              </span>
            </div>

            {/* Inbox ID */}
            {connectionDetails.clientInboxId && (
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Inbox ID:</span>
                <div className="flex items-center gap-1">
                  <span className="text-white text-xs font-mono">
                    {connectionDetails.clientInboxId.slice(0, 8)}...
                  </span>
                  <button
                    onClick={() => copyToClipboard(connectionDetails.clientInboxId)}
                    className="text-gray-400 hover:text-blue-400"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )}

            {/* Connection Type */}
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Type:</span>
              <span className="text-white">{connectionDetails.connectionType}</span>
            </div>

            {/* Environment */}
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Environment:</span>
              <span className="text-white">{connectionDetails.environment}</span>
            </div>

            {/* Ephemeral Key Status */}
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Ephemeral Key:</span>
              <span className={`${connectionDetails.ephemeralKey === "Present" ? "text-green-400" : "text-gray-400"}`}>
                {connectionDetails.ephemeralKey}
              </span>
            </div>
          </div>

          {/* Backend Error Notice */}
          {backendStatus === 'disconnected' && (
            <div className="mt-3 p-2 bg-red-500/10 border border-red-500/20 rounded">
              <p className="text-red-400 text-xs">
                ⚠️ Backend service is not available. Group chat features may not work.
              </p>
            </div>
          )}

          {/* Close button */}
          <button
            onClick={() => setIsExpanded(false)}
            className="mt-3 w-full text-center text-gray-400 hover:text-white text-xs"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}

// Keep the simple version for backward compatibility
export function ConnectionStatus({ onConnectionChange }: ConnectionStatusProps) {
  const { client, connectionType: xmtpConnectionType } = useXMTP();
  const { isConnected: isWalletConnected } = useAccount();
  const [isActuallyConnected, setIsActuallyConnected] = useState(false);

  useEffect(() => {
    const connectionType = xmtpConnectionType || localStorage.getItem("xmtp:connectionType");
    const ephemeralKey = localStorage.getItem("xmtp:ephemeralKey");
    
    // Check for ephemeral connection
    const isEphemeral = connectionType === "ephemeral" || connectionType === "Ephemeral Wallet";
    
    const newConnectionState = Boolean(
      isWalletConnected || 
      (client && isEphemeral && ephemeralKey)
    );

    setIsActuallyConnected(newConnectionState);

    if (typeof onConnectionChange === "function") {
      onConnectionChange(newConnectionState);
    }
  }, [isWalletConnected, client, xmtpConnectionType, onConnectionChange]);

  return (
    <div 
      className={`h-3 w-3 rounded-full ${isActuallyConnected ? "bg-green-500" : "bg-red-500"}`} 
      title={isActuallyConnected ? "Connected" : "Not connected"}
    />
  );
}