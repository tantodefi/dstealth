import { useFrame } from "@/context/frame-context";
import { useAccount, useDisconnect, useSignMessage } from "wagmi";
import Image from "next/image";
import { useXMTP } from "@/context/xmtp-context";
import {
  ConnectWallet,
  Wallet,
  WalletDropdown,
  WalletDropdownDisconnect,
  WalletDropdownLink,
  WalletDropdownFundLink,
} from '@coinbase/onchainkit/wallet';
import {
  Address,
  Avatar as WalletAvatar,
  Name as WalletName,
  Identity,
  EthBalance,
} from '@coinbase/onchainkit/identity';
import { useEffect, useState } from 'react';
import { privateKeyToAccount } from 'viem/accounts';

// Storage keys
const XMTP_CONNECTION_TYPE_KEY = "xmtp:connectionType";
const XMTP_EPHEMERAL_KEY = "xmtp:ephemeralKey";

export function WelcomeMessage() {
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

    if (savedPrivateKey && savedConnectionType === "Ephemeral Wallet") {
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

  // Show wallet UI for any connected wallet or ephemeral connection
  const showWalletUI = (isConnected && address) || (connectionType === "Ephemeral Wallet" && ephemeralAddress);

  return (
    <div className="bg-gray-800 py-2 px-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between relative">
        <div className="flex items-center gap-2">
          {showWalletUI && (
            <div className="relative [--ock-font-family:inherit] [--ock-border-radius:6px] [--ock-text-primary:#fff] [--ock-text-inverse:#000] [--ock-text-foreground:#fff] [--ock-text-foreground-muted:#999] [--ock-text-error:#ff4d4d] [--ock-text-success:#00cc66] [--ock-text-warning:#ffcc00] [--ock-text-disabled:#666] [--ock-bg-default:#111] [--ock-bg-default-hover:#222] [--ock-bg-default-active:#333] [--ock-bg-alternate:#222] [--ock-bg-alternate-hover:#333] [--ock-bg-alternate-active:#444] [--ock-bg-inverse:#fff] [--ock-bg-inverse-hover:#f5f5f5] [--ock-bg-inverse-active:#e5e5e5] [--ock-bg-primary:#3898FF] [--ock-bg-primary-hover:#1a7aff] [--ock-bg-primary-active:#0066ff] [--ock-bg-primary-washed:rgba(56,152,255,0.1)] [--ock-bg-primary-disabled:rgba(56,152,255,0.5)] [--ock-bg-secondary:#222] [--ock-bg-secondary-hover:#333] [--ock-bg-secondary-active:#444] [--ock-bg-error:#ff4d4d] [--ock-bg-warning:#ffcc00] [--ock-bg-success:#00cc66] [--ock-bg-default-reverse:#fff] [--ock-icon-color-primary:#3898FF] [--ock-icon-color-foreground:#fff] [--ock-icon-color-foreground-muted:#999] [--ock-icon-color-inverse:#000] [--ock-icon-color-error:#ff4d4d] [--ock-icon-color-success:#00cc66] [--ock-icon-color-warning:#ffcc00] [--ock-border-line-primary:#3898FF] [--ock-border-line-default:#333] [--ock-border-line-heavy:#444] [--ock-border-line-inverse:#fff] [--ock-dropdown-width:300px]">
              <Wallet>
                <ConnectWallet>
                  <p className="text-gray-200 mr-2">Welcome,</p>
                  <WalletAvatar className="h-6 w-6" />
                  <WalletName className="text-white text-sm" />
                </ConnectWallet>
                <WalletDropdown className="!absolute !left-0 !top-12 !z-50 !max-w-[calc(100vw-2rem)] !w-[300px]">
                  <Identity
                    className="px-4 pt-3 pb-2"
                    hasCopyAddressOnClick
                  >
                    <WalletAvatar />
                    <WalletName />
                    <Address />
                    {connectionType !== "Ephemeral Wallet" && <EthBalance />}
                  </Identity>
                  {connectionType !== "Ephemeral Wallet" && (
                    <>
                      <WalletDropdownLink
                        icon="wallet"
                        href="https://keys.coinbase.com"
                      >
                        Manage Wallet
                      </WalletDropdownLink>
                      <WalletDropdownFundLink />
                    </>
                  )}
                  <WalletDropdownDisconnect 
                    className="text-red-500 hover:bg-red-500/10"
                  />
                </WalletDropdown>
              </Wallet>
            </div>
          )}
          {!showWalletUI && (
            <p className="text-gray-200">
              Welcome, <span className="font-medium text-white">anon</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
} 