"use client";

import { FrameProvider } from "@/context/frame-context";
import { XMTPProvider } from "@/context/xmtp-context";
import MiniAppWalletProvider from "@/providers/miniapp-wallet-provider";
import { ErudaProvider } from "@/providers/eruda";
import { type ReactNode } from 'react';

// Initialize navigator.wallets on the client side
if (typeof window !== 'undefined') {
  try {
    if (!window.navigator.wallets || !Array.isArray(window.navigator.wallets)) {
      Object.defineProperty(window.navigator, 'wallets', {
        value: [],
        writable: true,
        configurable: true,
        enumerable: true
      });
    }
  } catch (error) {
    // Silent fail - not critical
  }
}

export const Providers = ({
  children,
  cookies = null,
}: {
  children: ReactNode;
  cookies?: string | null;
}) => {
  return (
    <ErudaProvider>
      <FrameProvider>
        <MiniAppWalletProvider cookies={cookies}>
          <XMTPProvider>{children}</XMTPProvider>
        </MiniAppWalletProvider>
      </FrameProvider>
    </ErudaProvider>
  );
};
