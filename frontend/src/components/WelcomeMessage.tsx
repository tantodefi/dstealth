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
  Address,
  Avatar as WalletAvatar,
  Name as WalletName,
  Identity,
  EthBalance,
  Badge,
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
  const { client, disconnect: disconnectXMTP } = useXMTP();
  const { signMessageAsync } = useSignMessage();
  const [connectionType, setConnectionType] = useState<string>("");
  const [ephemeralAddress, setEphemeralAddress] = useState<string>("");

  // Get connection type and ephemeral address on mount
  useEffect(() => {
    const savedConnectionType = localStorage.getItem(XMTP_CONNECTION_TYPE_KEY);
    const savedPrivateKey = localStorage.getItem(XMTP_EPHEMERAL_KEY);

    if (savedConnectionType) {
      setConnectionType(savedConnectionType);
    }

    if (savedPrivateKey && savedConnectionType === "ephemeral") {
      const formattedKey = savedPrivateKey.startsWith("0x")
        ? (savedPrivateKey as `0x${string}`)
        : (`0x${savedPrivateKey}` as `0x${string}`);

      const account = privateKeyToAccount(formattedKey);
      setEphemeralAddress(account.address);
    }
  }, []);

  // Update connection type when connector changes
  useEffect(() => {
    if (connector?.id === "coinbaseWalletSDK") {
      setConnectionType("Coinbase Smart Wallet");
      localStorage.setItem(XMTP_CONNECTION_TYPE_KEY, "Coinbase Smart Wallet");
    }
  }, [connector]);

  // Handle wallet disconnection events
  useEffect(() => {
    if (!isConnected && !address && connectionType !== "ephemeral") {
      // Regular wallet was disconnected, also disconnect XMTP
      disconnectXMTP();
    }
  }, [isConnected, address, connectionType, disconnectXMTP]);

  // Show wallet UI for any connected wallet or ephemeral connection
  const showWalletUI = (isConnected && address) || (connectionType === "ephemeral" && ephemeralAddress);
  const displayAddress = address || ephemeralAddress;

  const handleEphemeralDisconnect = () => {
    // For ephemeral wallets, manually clear everything
    disconnectXMTP();
    localStorage.removeItem(XMTP_CONNECTION_TYPE_KEY);
    localStorage.removeItem(XMTP_EPHEMERAL_KEY);
    setConnectionType("");
    setEphemeralAddress("");
  };

  return (
    <div className="bg-gray-800 py-2 px-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between relative">
        <div className="flex items-center gap-2">
          {showWalletUI ? (
            <div className="relative z-[10000]">
              <Wallet>
                <ConnectWallet className="!bg-transparent !border-none !p-0 !shadow-none hover:!bg-transparent !text-white">
                  <div className="flex items-center gap-2 cursor-pointer text-white">
                    <span className="text-gray-200 mr-2">Welcome,</span>
                    {displayAddress ? (
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
                    ) : (
                      <>
                        <div className="h-6 w-6 rounded-full bg-gray-600 flex items-center justify-center">
                          <span className="text-xs">?</span>
                        </div>
                        <span className="text-white text-sm">User</span>
                      </>
                    )}
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
                    {connectionType !== "ephemeral" && <EthBalance />}
                  </Identity>
                  
                  {/* Basename section for non-ephemeral wallets */}
                  {connectionType !== "ephemeral" && (
                    <WalletDropdownBasename />
                  )}
                  
                  {connectionType !== "ephemeral" && (
                    <>
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
                    </>
                  )}
                  
                  {/* For ephemeral wallets, show custom disconnect button */}
                  {connectionType === "ephemeral" ? (
                    <button
                      onClick={handleEphemeralDisconnect}
                      className="w-full px-4 py-2 text-left text-red-500 hover:bg-red-500/10 flex items-center gap-2"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zM8 14c-3.3 0-6-2.7-6-6s2.7-6 6-6 6 2.7 6 6-2.7 6-6 6z"/>
                        <path d="M11 5L5 11M5 5l6 6"/>
                      </svg>
                      Disconnect
                    </button>
                  ) : (
                    <WalletDropdownDisconnect className="text-red-500 hover:bg-red-500/10" />
                  )}
                </WalletDropdown>
              </Wallet>
            </div>
          ) : (
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