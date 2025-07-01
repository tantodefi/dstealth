import { useFrame } from "@/context/frame-context";
import { useAccount, useDisconnect, useSignMessage } from "wagmi";
import Image from "next/image";
import { useXMTP } from "@/context/xmtp-context";
import { useState, useEffect, useRef } from "react";
import { privateKeyToAccount } from "viem/accounts";
import { ChevronDown, Copy, Check, Eye, User, Settings, X, RefreshCw } from "lucide-react";
// Temporarily commented out due to React dependency conflicts
// import {
//   Avatar as WalletAvatar,
//   Name as WalletName,
//   Identity,
//   EthBalance,
//   Badge,
//   Address,
// } from '@coinbase/onchainkit/identity';
import UserAvatar from './UserAvatar';
import { useRouter } from "next/navigation";

// Storage keys
const XMTP_CONNECTION_TYPE_KEY = "xmtp:connectionType";
const XMTP_EPHEMERAL_KEY = "xmtp:ephemeralKey";

interface WelcomeMessageProps {
  onShowEarningsChart?: () => void;
  onBackendStatusChange?: (status: 'connected' | 'disconnected' | 'checking') => void;
}

export function WelcomeMessage({ onShowEarningsChart, onBackendStatusChange }: WelcomeMessageProps) {
  const { context } = useFrame();
  const { address, isConnected: isWalletConnected } = useAccount();
  const { disconnect: disconnectWallet } = useDisconnect();
  
  const { 
    client, 
    disconnect: disconnectXMTP, 
    connectionType, 
    isInFarcasterContext, 
    farcasterUser 
  } = useXMTP();

  const router = useRouter();

  // State
  const [showDropdown, setShowDropdown] = useState(false);
  const [ephemeralAddress, setEphemeralAddress] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [ethName, setEthName] = useState<string | null>(null);
  const [isLoadingEthName, setIsLoadingEthName] = useState(false);
  const [backendStatus, setBackendStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking');
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Handle mounting state
  useEffect(() => {
    setMounted(true);
  }, []);

  // Get ephemeral address when connection type changes
  useEffect(() => {
    const isEphemeral = connectionType === "ephemeral" || connectionType === "Ephemeral Wallet";
    
    if (isEphemeral) {
      const savedPrivateKey = localStorage.getItem(XMTP_EPHEMERAL_KEY);
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
  }, [connectionType]);

  // Determine connection state
  const isEphemeralConnection = connectionType === "ephemeral" || connectionType === "Ephemeral Wallet";
  const hasWalletConnection = isWalletConnected && address;
  const hasEphemeralConnection = isEphemeralConnection && ephemeralAddress;
  const hasActiveConnection = !!client && (hasWalletConnection || hasEphemeralConnection);
  
  const displayAddress = address || ephemeralAddress;

  // Check backend status periodically - REDUCED frequency to prevent spam
  useEffect(() => {
    const checkBackendStatus = async () => {
      try {
        const response = await fetch('/api/agent/info', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        
        const newStatus = response.ok ? 'connected' : 'disconnected';
        setBackendStatus(newStatus);
        onBackendStatusChange?.(newStatus);
      } catch (error) {
        setBackendStatus('disconnected');
        onBackendStatusChange?.('disconnected');
      }
    };

    // Check immediately and then every 10 minutes - REDUCED from 5 to prevent spam
    checkBackendStatus();
    const interval = setInterval(checkBackendStatus, 10 * 60 * 1000);

    return () => clearInterval(interval);
  }, [onBackendStatusChange]);

  // Resolve ENS name
  useEffect(() => {
    const resolveEthName = async () => {
      if (!displayAddress || !mounted) return;
      
      setIsLoadingEthName(true);
      try {
        // Try to resolve ENS name using a public API
        const response = await fetch(`https://api.ensideas.com/ens/resolve/${displayAddress}`);
        if (response.ok) {
          const data = await response.json();
          if (data.name) {
            setEthName(data.name);
          }
        }
      } catch (error) {
        console.log("ENS resolution failed:", error);
      } finally {
        setIsLoadingEthName(false);
      }
    };

    const timeoutId = setTimeout(resolveEthName, 500); // Debounce
    return () => clearTimeout(timeoutId);
  }, [displayAddress, mounted]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showDropdown]);

  // Get display name - prioritize Farcaster user info, then ENS, then address
  const getDisplayName = () => {
    if (isInFarcasterContext && farcasterUser) {
      return farcasterUser.displayName || farcasterUser.username || "Farcaster User";
    }
    if (ethName) {
      return ethName;
    }
    if (displayAddress) {
      return `${displayAddress.slice(0, 6)}...${displayAddress.slice(-4)}`;
    }
    return "Guest";
  };

  // Get welcome message
  const getWelcomeText = () => {
    const displayName = getDisplayName();
    
    if (isInFarcasterContext && farcasterUser) {
      return `Welcome back, ${farcasterUser.displayName || farcasterUser.username}!`;
    }
    if (hasActiveConnection) {
      return `Welcome back, ${displayName}!`;
    }
    return "Connect your wallet to get started";
  };

  // Copy to clipboard function
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  // Handle disconnect
  const handleDisconnect = async () => {
    try {
      // Show loading immediately for better UX
      setIsDisconnecting(true);
      
      console.log("🔄 Starting disconnect from WelcomeMessage...");
      
      // 1. Clear component state FIRST to prevent UI persistence
      setEthName(null);
      setEphemeralAddress("");
      setShowDropdown(false);
      
      // 2. Disconnect services - ALWAYS disconnect both
      console.log("🔌 Disconnecting XMTP client...");
      disconnectXMTP();
      
      console.log("🔌 Disconnecting wallet...");
      disconnectWallet();
      
      // 3. Clear ALL relevant localStorage comprehensively
      console.log("🧹 Clearing localStorage comprehensively...");
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
          key.startsWith('xmtp:') || 
          key.startsWith('xmtp.') ||
          key.startsWith('wagmi') || 
          key.startsWith('WCM_') ||
          key.startsWith('wc@') ||
          key.startsWith('fkey:') ||
          key.includes('wallet') ||
          key.includes('connect') ||
          key.includes('ens') ||
          key.includes('eth') ||
          key.includes('address') ||
          key.includes('signer') ||
          key.includes('session') ||
          key.includes('name') ||
          key.includes('avatar') ||
          key.includes('cache') ||
          key.includes('user')
        )) {
          keysToRemove.push(key);
        }
      }
      
      // Also remove specific keys that might not match patterns
      const specificKeys = [
        XMTP_CONNECTION_TYPE_KEY,
        XMTP_EPHEMERAL_KEY,
        'connectionType',
        'lastConnectedAddress', 
        'ensName',
        'ensCache',
        'ethName',
        'userProfile',
        'walletconnect',
        'WALLETCONNECT_DEEPLINK_CHOICE',
        'recentWalletChoice',
        'connector',
        'isConnected',
        'tantodefi.eth', // Clear any cached ENS names
        'cached_name',
        'user_cache',
        'profile_cache'
      ];
      
      specificKeys.forEach(key => {
        if (localStorage.getItem(key)) {
          keysToRemove.push(key);
        }
      });

      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
        console.log(`🗑️ Removed: ${key}`);
      });

      // 4. Clear session storage
      try {
        sessionStorage.clear();
        console.log("🧹 Cleared sessionStorage");
      } catch (e) {
        console.warn("Could not clear sessionStorage:", e);
      }

      // 5. Clear wagmi cookies aggressively
      try {
        // Clear wagmi cookies from document.cookie
        const cookies = document.cookie.split(";");
        for (let cookie of cookies) {
          const eqPos = cookie.indexOf("=");
          const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
          if (name.includes('wagmi') || name.includes('wallet') || name.includes('connect')) {
            // Clear cookie by setting expiration to past date
            document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${window.location.hostname}`;
            document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
            console.log(`🍪 Cleared cookie: ${name}`);
          }
        }
      } catch (e) {
        console.warn("Could not clear cookies:", e);
      }

      // 6. Clear any cached DNS/ENS entries (browser level)
      try {
        if ('caches' in window) {
          const cacheNames = await caches.keys();
          await Promise.all(
            cacheNames.map(cacheName => caches.delete(cacheName))
          );
          console.log("🧹 Cleared browser caches");
        }
      } catch (e) {
        console.warn("Could not clear browser caches:", e);
      }

      console.log("✅ Disconnect completed successfully");
      
      // 7. Force page reload to ensure clean state
      setTimeout(() => {
        window.location.href = window.location.origin + window.location.pathname;
      }, 500); // Small delay to ensure all cleanup completes
      
    } catch (error) {
      console.error("❌ Error during disconnect:", error);
      // Force reload even if there's an error
      setTimeout(() => {
        window.location.reload();
      }, 500);
    }
  };

  // Don't render until mounted to prevent hydration issues
  if (!mounted) {
    return (
      <div className="bg-gray-800 py-3 px-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <p className="text-gray-200">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 py-3 px-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Welcome message with avatar and connection status */}
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="flex-shrink-0">
            <UserAvatar
              address={displayAddress || undefined}
              farcasterUser={isInFarcasterContext ? farcasterUser : undefined}
              size={32}
                        />
                  </div>
          
          {/* Name and connection dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="flex items-center gap-2 text-gray-200 hover:text-white transition-colors group"
            >
              <div>
                <div className="text-sm font-medium">
                  {isLoadingEthName ? (
                    <div className="flex items-center gap-1">
                      <span>{getDisplayName()}</span>
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    </div>
                  ) : (
                    getDisplayName()
                  )}
                </div>
                <div className="text-xs text-gray-400">
                  {getWelcomeText()}
                </div>
                      </div>
              <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-white transition-transform duration-200" />
            </button>

            {/* Connection Details Dropdown */}
            {showDropdown && (
              <div className="absolute top-full left-0 mt-2 w-80 bg-gray-900 border border-gray-700 rounded-lg shadow-lg z-50">
                <div className="p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-white">Connection Details</h3>
                    <button
                      onClick={() => setShowDropdown(false)}
                      className="text-gray-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                          </div>
                          
                  <div className="space-y-3 text-xs">
                    {/* Frontend Status */}
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Frontend:</span>
                      <span className="text-green-400">✓ Connected</span>
                          </div>
                          
                    {/* Backend Status */}
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Backend:</span>
                      <span className={`${
                        backendStatus === 'connected' ? 'text-green-400' : 
                        backendStatus === 'disconnected' ? 'text-red-400' : 
                        'text-yellow-400'
                      }`}>
                        {backendStatus === 'connected' ? '✓ Connected' : 
                         backendStatus === 'disconnected' ? '✗ Disconnected' : 
                         '↻ Checking...'}
                      </span>
                          </div>
                          
                    {/* Wallet Status */}
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Wallet:</span>
                      <span className={`${hasActiveConnection ? "text-green-400" : "text-red-400"}`}>
                        {hasActiveConnection ? "✓ Connected" : "✗ Not connected"}
                      </span>
                          </div>
                          
                    {/* Address */}
                    {displayAddress && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400">Address:</span>
                        <div className="flex items-center gap-1">
                          <span className="text-white text-xs font-mono">
                            {displayAddress.slice(0, 6)}...{displayAddress.slice(-4)}
                          </span>
                            <button
                            onClick={() => copyToClipboard(displayAddress)}
                            className="text-gray-400 hover:text-blue-400"
                          >
                            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    </button>
                        </div>
                      </div>
                    )}
                    
                    {/* XMTP Client */}
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">XMTP Client:</span>
                      <span className={`${client ? "text-green-400" : "text-red-400"}`}>
                        {client ? "✓ Active" : "✗ Not active"}
                        </span>
                        </div>
                        
                    {/* Inbox ID */}
                    {client?.inboxId && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400">Inbox ID:</span>
                        <div className="flex items-center gap-1">
                          <span className="text-white text-xs font-mono">
                            {client.inboxId.slice(0, 8)}...
                          </span>
                          <button
                            onClick={() => copyToClipboard(client.inboxId || "")}
                            className="text-gray-400 hover:text-blue-400"
                          >
                            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Connection Type */}
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Type:</span>
                      <span className="text-white">
                        {connectionType || "unknown"}
                      </span>
                    </div>

                    {/* Environment */}
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Environment:</span>
                      <span className="text-white">dev</span>
                    </div>

                    {/* Ephemeral Key Status */}
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Ephemeral Key:</span>
                      <span className="text-white">
                        {isEphemeralConnection ? "Active" : "Not set"}
                      </span>
                    </div>
                  </div>

                  {/* Action buttons */}
                  {hasActiveConnection && (
                    <div className="mt-4 pt-3 border-t border-gray-700">
                      <button
                        onClick={handleDisconnect}
                        className="w-full px-3 py-2 text-left text-red-400 hover:bg-red-500/10 rounded-lg flex items-center gap-2 transition-colors text-sm"
                        disabled={isDisconnecting}
                      >
                        <Settings className="w-4 h-4" />
                        {isDisconnecting ? "Disconnecting..." : "Disconnect"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
              )}
            </div>
        </div>
      </div>
      
      {/* Full-screen disconnect loader overlay */}
      {isDisconnecting && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-8 flex flex-col items-center gap-4 max-w-sm mx-4">
            <div className="relative">
              <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
              <div className="absolute inset-0 w-8 h-8 border-2 border-blue-400/20 rounded-full animate-pulse" />
            </div>
            <div className="text-center">
              <h3 className="text-white font-medium text-lg mb-2">Disconnecting...</h3>
              <p className="text-gray-400 text-sm">
                Clearing connections and resetting state
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 