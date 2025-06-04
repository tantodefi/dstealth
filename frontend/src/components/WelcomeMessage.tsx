import { useFrame } from "@/context/frame-context";
import { useAccount, useDisconnect, useSignMessage } from "wagmi";
import Image from "next/image";
import { useXMTP } from "@/context/xmtp-context";
import {
  Wallet,
  WalletDropdown,
  WalletDropdownDisconnect,
  WalletDropdownLink,
  WalletDropdownFundLink,
  WalletDropdownBasename,
  ConnectWallet,
} from '@coinbase/onchainkit/wallet';
import {
  Avatar as WalletAvatar,
  Name as WalletName,
  Identity,
  EthBalance,
  Badge,
  Address,
} from '@coinbase/onchainkit/identity';
import { useEffect, useState } from 'react';
import { privateKeyToAccount } from 'viem/accounts';
import { Proxy402Balance } from './Proxy402Balance';

// Storage keys
const XMTP_CONNECTION_TYPE_KEY = "xmtp:connectionType";
const XMTP_EPHEMERAL_KEY = "xmtp:ephemeralKey";

interface WelcomeMessageProps {
  onShowEarningsChart?: () => void;
}

export function WelcomeMessage({ onShowEarningsChart }: WelcomeMessageProps) {
  const { context } = useFrame();
  const { address, connector, isConnected } = useAccount();
  const { disconnect: disconnectWallet } = useDisconnect();
  const { 
    client, 
    disconnect: disconnectXMTP, 
    connectionType, 
    isInFarcasterContext, 
    farcasterUser 
  } = useXMTP();
  const { signMessageAsync } = useSignMessage();
  const [ephemeralAddress, setEphemeralAddress] = useState<string>("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [forceRerender, setForceRerender] = useState(0);

  // Handle mounting state
  useEffect(() => {
    setMounted(true);
  }, []);

  // Force re-render when connection state changes to help OnchainKit sync
  useEffect(() => {
    if (isConnected && address && mounted) {
      // Small delay to let OnchainKit's internal state sync
      const timer = setTimeout(() => {
        setForceRerender(prev => prev + 1);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isConnected, address, mounted, connectionType]);

  // Get ephemeral address when connection type changes
  useEffect(() => {
    const isEphemeral = connectionType === "ephemeral" || connectionType === "Ephemeral Wallet";
    
    if (isEphemeral) {
      const savedPrivateKey = localStorage.getItem("xmtp:ephemeralKey");
      if (savedPrivateKey) {
        try {
      const formattedKey = savedPrivateKey.startsWith("0x")
        ? (savedPrivateKey as `0x${string}`)
        : (`0x${savedPrivateKey}` as `0x${string}`);

      const account = privateKeyToAccount(formattedKey);
      setEphemeralAddress(account.address);
          console.log("🔑 Ephemeral address set:", account.address);
        } catch (error) {
          console.error("Error generating ephemeral address:", error);
          setEphemeralAddress("");
        }
      } else {
        console.warn("Ephemeral connection type but no key found");
        setEphemeralAddress("");
      }
    } else {
      setEphemeralAddress("");
    }
  }, [connectionType]);

  // Handle wallet disconnection events - only for non-Farcaster connections
  useEffect(() => {
    if (!isConnected && !address && connectionType !== "ephemeral" && connectionType !== "Ephemeral Wallet" && !isInFarcasterContext) {
      // Regular wallet was disconnected, also disconnect XMTP
      disconnectXMTP();
    }
  }, [isConnected, address, connectionType, disconnectXMTP, isInFarcasterContext]);

  // Determine what to show in the UI
  const isEphemeralConnection = connectionType === "ephemeral" || connectionType === "Ephemeral Wallet";
  const isSmartWalletConnection = connectionType === "Coinbase Smart Wallet" || connectionType === "scw";
  const hasActiveConnection = !!client && (
    (isConnected && address) || 
    (isEphemeralConnection && ephemeralAddress)
  );
  
  const displayAddress = address || ephemeralAddress;

  // Enhanced connection check for smart wallets
  const isSmartWalletReady = mounted && isSmartWalletConnection && isConnected && address && displayAddress;

  // Debug logging
  useEffect(() => {
    console.log("👋 WelcomeMessage state:", {
      connectionType,
      isEphemeralConnection,
      isSmartWalletConnection,
      isSmartWalletReady,
      hasActiveConnection,
      hasClient: !!client,
      address,
      ephemeralAddress,
      displayAddress,
      isConnected,
      mounted,
      forceRerender,
      connector: connector?.id,
    });
  }, [connectionType, isEphemeralConnection, isSmartWalletConnection, isSmartWalletReady, hasActiveConnection, client, address, ephemeralAddress, displayAddress, isConnected, mounted, forceRerender, connector]);

  // Get display name - prioritize Farcaster user info
  const getDisplayName = () => {
    if (isInFarcasterContext && farcasterUser) {
      return farcasterUser.displayName || farcasterUser.username || "Farcaster User";
    }
    return null; // Will show address or basename
  };

  // Copy to clipboard function
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000); // Reset after 2 seconds
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  const handleEphemeralDisconnect = () => {
    // For ephemeral wallets, manually clear everything
    disconnectXMTP();
    localStorage.removeItem("xmtp:connectionType");
    localStorage.removeItem("xmtp:ephemeralKey");
    setEphemeralAddress("");
    setShowDropdown(false);
  };

  const handleWalletDisconnect = () => {
    // For regular wallets, disconnect both wallet and XMTP
    disconnectWallet();
    disconnectXMTP();
    setShowDropdown(false);
  };

  // Don't render until mounted to prevent hydration issues
  if (!mounted) {
    return (
      <div className="bg-gray-800 py-2 px-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <p className="text-gray-200">Loading...</p>
          <div className="flex items-center">
            <Proxy402Balance onShowChart={onShowEarningsChart} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 py-2 px-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between relative">
        <div className="flex items-center gap-2">
          {hasActiveConnection && displayAddress ? (
            <div className="relative z-[10000]">
              {/* Use OnchainKit for Smart Wallet connections */}
              {isSmartWalletConnection ? (
                // Check if wagmi also sees the wallet as connected for OnchainKit compatibility
                isSmartWalletReady ? (
                  <Wallet key={`smart-wallet-${forceRerender}`}>
                    <ConnectWallet 
                      className="!bg-transparent !border-none !p-0 !shadow-none hover:!bg-transparent !text-white !min-h-0"
                    >
                      {/* Custom connected state content */}
                      <div className="flex items-center gap-2 cursor-pointer text-white hover:bg-gray-700 rounded-lg p-2 transition-colors">
                        <span className="text-gray-200">Welcome,</span>
                        <WalletAvatar 
                          address={displayAddress as `0x${string}`}
                          className="h-6 w-6" 
                        />
                        <WalletName 
                          address={displayAddress as `0x${string}`}
                          className="text-white text-sm" 
                        />
                  </div>
                </ConnectWallet>
                    
                <WalletDropdown className="!z-[10001] !absolute !top-full !left-0 !mt-2">
                  <Identity
                    className="px-4 pt-3 pb-2"
                    hasCopyAddressOnClick
                    address={displayAddress as `0x${string}`}
                  >
                    <WalletAvatar address={displayAddress as `0x${string}`} />
                    <WalletName address={displayAddress as `0x${string}`}>
                      <Badge />
                    </WalletName>
                    <Address />
                        <EthBalance 
                          address={displayAddress as `0x${string}`} 
                          className="text-green-400"
                        />
                  </Identity>
                  
                      {/* Connection type indicator */}
                      <div className="px-4 py-2 text-xs text-gray-500 border-b border-gray-200">
                        Connection: Coinbase Smart Wallet
                      </div>
                      
                    <WalletDropdownBasename />
                      <WalletDropdownLink
                        icon="wallet"
                        href="https://keys.coinbase.com"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Manage Wallet
                      </WalletDropdownLink>
                      <WalletDropdownFundLink />
                      <WalletDropdownLink
                        icon="creditCard"
                        href={`https://etherscan.io/address/${displayAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View on Etherscan
                      </WalletDropdownLink>
                      <WalletDropdownLink
                        icon="coinbaseWallet"
                        href="https://www.coinbase.com/web3"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Learn Web3
                      </WalletDropdownLink>
                      
                      <WalletDropdownDisconnect />
                    </WalletDropdown>
                  </Wallet>
                ) : (
                  /* Smart wallet connected in XMTP but not wagmi - use custom implementation */
                  <>
                    {/* Custom Welcome Button that opens dropdown */}
                    <button
                      onClick={() => setShowDropdown(!showDropdown)}
                      className="flex items-center gap-2 cursor-pointer text-white hover:bg-gray-700 rounded-lg p-2 transition-colors"
                    >
                      <span className="text-gray-200">Welcome,</span>
                      <WalletAvatar 
                        address={displayAddress as `0x${string}`}
                        className="h-6 w-6" 
                      />
                      <WalletName 
                        address={displayAddress as `0x${string}`}
                        className="text-white text-sm" 
                      />
                    </button>
                    
                    {/* Custom Dropdown for smart wallet not connected via wagmi */}
                    {showDropdown && (
                      <div className="absolute top-full left-0 mt-2 z-[10001]">
                        <div className="w-80 bg-gray-900 border border-gray-700 rounded-lg shadow-lg p-4">
                          {/* Identity Section */}
                          <div className="flex items-center gap-3 px-4 pt-3 pb-2">
                            <WalletAvatar address={displayAddress as `0x${string}`} />
                            <div className="flex-1">
                              <div>
                                <WalletName 
                                  address={displayAddress as `0x${string}`}
                                  className="text-white text-sm font-semibold" 
                                />
                                <Badge />
                              </div>
                            </div>
                          </div>
                          
                          {/* Address Section with Copy Button */}
                          <div className="px-4 py-2 border-b border-gray-700">
                            <div className="text-xs text-gray-400 mb-1">Address</div>
                            <div className="flex items-center gap-2">
                              <div className="text-white text-sm font-mono break-all flex-1">
                                {displayAddress}
                              </div>
                              <button
                                onClick={() => copyToClipboard(displayAddress)}
                                className="flex-shrink-0 p-1 text-gray-400 hover:text-white transition-colors"
                                title="Copy address"
                              >
                                {copied ? (
                                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
                                  </svg>
                                ) : (
                                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M4 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V2zm2-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H6z"/>
                                    <path d="M2 5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1h1v1a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1v1H2z"/>
                                  </svg>
                                )}
                              </button>
                            </div>
                          </div>
                          
                          {/* Balance Section */}
                          <div className="px-4 py-2 border-b border-gray-700">
                            <EthBalance 
                              address={displayAddress as `0x${string}`} 
                              className="text-green-400"
                            />
                          </div>
                          
                          {/* Connection type indicator */}
                          <div className="px-4 py-2 text-xs text-gray-400 border-b border-gray-700">
                            Connection: Coinbase Smart Wallet
                          </div>
                          
                          {/* Links */}
                          <div className="px-4 py-2 border-b border-gray-700">
                            <a
                              href="https://keys.coinbase.com"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block text-blue-400 hover:text-blue-300 text-sm py-1"
                            >
                              Manage Wallet
                            </a>
                            <a
                              href={`https://etherscan.io/address/${displayAddress}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block text-blue-400 hover:text-blue-300 text-sm py-1"
                            >
                              View on Etherscan
                            </a>
                          </div>
                          
                          {/* Disconnect button */}
                          <div className="px-4 py-2">
                            <button
                              onClick={handleWalletDisconnect}
                              className="w-full px-4 py-2 text-left text-red-400 hover:bg-red-500/10 rounded-lg flex items-center gap-2 transition-colors"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zM8 14c-3.3 0-6-2.7-6-6s2.7-6 6-6 6 2.7 6 6-2.7 6-6 6z"/>
                        <path d="M11 5L5 11M5 5l6 6"/>
                      </svg>
                      Disconnect
                    </button>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Click outside to close dropdown */}
                    {showDropdown && (
                      <div 
                        className="fixed inset-0 z-[10000]" 
                        onClick={() => setShowDropdown(false)}
                      />
                    )}
                  </>
                )
              ) : (
                /* Custom implementation for EOA and Ephemeral wallets */
                <>
                  {/* Custom Welcome Button that opens dropdown */}
                  <button
                    onClick={() => setShowDropdown(!showDropdown)}
                    className="flex items-center gap-2 cursor-pointer text-white hover:bg-gray-700 rounded-lg p-2 transition-colors"
                  >
                    <span className="text-gray-200">Welcome,</span>
                    {isInFarcasterContext && farcasterUser ? (
                      <>
                        {farcasterUser.pfpUrl ? (
                          <Image
                            src={farcasterUser.pfpUrl}
                            alt="Profile"
                            width={24}
                            height={24}
                            className="rounded-full"
                          />
                        ) : (
                          <WalletAvatar 
                            address={displayAddress as `0x${string}`}
                            className="h-6 w-6" 
                          />
                        )}
                        <span className="text-white text-sm font-medium">
                          {getDisplayName()}
                        </span>
                      </>
                    ) : isEphemeralConnection ? (
                      <>
                        <div className="h-6 w-6 rounded-full bg-yellow-500 flex items-center justify-center">
                          <span className="text-xs">⚡</span>
                        </div>
                        <span className="text-white text-sm font-medium">
                          anon
                        </span>
                      </>
                    ) : (
                      <>
                        <WalletAvatar 
                          address={displayAddress as `0x${string}`}
                          className="h-6 w-6" 
                        />
                        <WalletName 
                          address={displayAddress as `0x${string}`}
                          className="text-white text-sm" 
                        />
                      </>
                    )}
                  </button>
                  
                  {/* Custom Dropdown - only shown when button is clicked */}
                  {showDropdown && (
                    <div className="absolute top-full left-0 mt-2 z-[10001]">
                      <div className="w-80 bg-gray-900 border border-gray-700 rounded-lg shadow-lg p-4">
                        {/* Identity Section */}
                        <div className="flex items-center gap-3 px-4 pt-3 pb-2">
                          {isInFarcasterContext && farcasterUser?.pfpUrl ? (
                            <Image
                              src={farcasterUser.pfpUrl}
                              alt="Profile"
                              width={40}
                              height={40}
                              className="rounded-full"
                            />
                          ) : isEphemeralConnection ? (
                            <div className="w-10 h-10 rounded-full bg-yellow-500 flex items-center justify-center">
                              <span className="text-lg">⚡</span>
                            </div>
                          ) : (
                            <WalletAvatar address={displayAddress as `0x${string}`} />
                          )}
                          
                          <div className="flex-1">
                            {isInFarcasterContext && farcasterUser ? (
                              <div>
                                <div className="font-semibold text-sm text-white">{getDisplayName()}</div>
                                <div className="text-xs text-gray-400">@{farcasterUser.username}</div>
                              </div>
                            ) : isEphemeralConnection ? (
                              <div>
                                <div className="font-semibold text-sm text-white">Anonymous User</div>
                                <div className="text-xs text-gray-400">Ephemeral Wallet</div>
                              </div>
                            ) : (
                              <div>
                                <WalletName 
                                  address={displayAddress as `0x${string}`}
                                  className="text-white text-sm font-semibold" 
                                />
                                <Badge />
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* Address Section with Copy Button */}
                        <div className="px-4 py-2 border-b border-gray-700">
                          <div className="text-xs text-gray-400 mb-1">Address</div>
                          <div className="flex items-center gap-2">
                            <div className="text-white text-sm font-mono break-all flex-1">
                              {displayAddress}
                            </div>
                            <button
                              onClick={() => copyToClipboard(displayAddress)}
                              className="flex-shrink-0 p-1 text-gray-400 hover:text-white transition-colors"
                              title="Copy address"
                            >
                              {copied ? (
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                  <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
                                </svg>
                              ) : (
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                  <path d="M4 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V2zm2-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H6z"/>
                                  <path d="M2 5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1h1v1a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1v1H2z"/>
                                </svg>
                              )}
                            </button>
                          </div>
                        </div>
                        
                        {/* Balance Section for non-ephemeral wallets */}
                        {!isEphemeralConnection && (
                          <div className="px-4 py-2 border-b border-gray-700">
                            <EthBalance 
                              address={displayAddress as `0x${string}`} 
                              className="text-green-400"
                            />
                          </div>
                        )}
                        
                        {/* Connection type indicator */}
                        <div className="px-4 py-2 text-xs text-gray-400 border-b border-gray-700">
                          Connection: {isInFarcasterContext ? "Farcaster Frame" : 
                                      isEphemeralConnection ? "Ephemeral Wallet" : 
                                      "EOA Wallet"}
                        </div>
                        
                        {/* Links for non-ephemeral wallets */}
                        {!isEphemeralConnection && (
                          <div className="px-4 py-2 border-b border-gray-700">
                            <a
                              href={`https://etherscan.io/address/${displayAddress}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block text-blue-400 hover:text-blue-300 text-sm py-1"
                            >
                              View on Etherscan
                            </a>
                          </div>
                        )}
                        
                        {/* Disconnect button */}
                        <div className="px-4 py-2">
                          <button
                            onClick={isEphemeralConnection ? handleEphemeralDisconnect : handleWalletDisconnect}
                            className="w-full px-4 py-2 text-left text-red-400 hover:bg-red-500/10 rounded-lg flex items-center gap-2 transition-colors"
                          >
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                              <path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zM8 14c-3.3 0-6-2.7-6-6s2.7-6 6-6 6 2.7 6 6-2.7 6-6 6z"/>
                              <path d="M11 5L5 11M5 5l6 6"/>
                            </svg>
                            Disconnect
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Click outside to close dropdown */}
                  {showDropdown && (
                    <div 
                      className="fixed inset-0 z-[10000]" 
                      onClick={() => setShowDropdown(false)}
                    />
                  )}
                </>
              )}
            </div>
          ) : (
            // No active XMTP connection - show simple welcome
            <p className="text-gray-200">
              Welcome, <span className="font-medium text-white">anon</span>
            </p>
          )}
        </div>
        
        {/* Proxy402 Balance - Far right in green */}
        <div className="flex items-center">
          <Proxy402Balance onShowChart={onShowEarningsChart} />
        </div>
      </div>
    </div>
  );
} 