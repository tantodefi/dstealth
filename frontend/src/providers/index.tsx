"use client";

import dynamic from "next/dynamic";
import { FrameProvider } from "@/context/frame-context";
import { XMTPProvider } from "@/context/xmtp-context";
import MiniAppWalletProvider from "@/providers/miniapp-wallet-provider";
import { WhiskSdkProvider } from "@paperclip-labs/whisk-sdk";
import { IdentityResolver } from "@paperclip-labs/whisk-sdk/identity";
import { env } from "@/lib/env";

const ErudaProvider = dynamic(
  () => import("@/providers/eruda").then((c) => c.ErudaProvider),
  {
    ssr: false,
  },
);

export const Providers = ({
  children,
  cookies,
}: {
  children: React.ReactNode;
  cookies: string | null;
}) => {
  return (
    <ErudaProvider>
      <FrameProvider>
        <MiniAppWalletProvider cookies={cookies}>
          <WhiskSdkProvider
            apiKey={env.NEXT_PUBLIC_WHISK_API_KEY}
            config={{
              identity: {
                resolverOrder: [
                  IdentityResolver.Farcaster,
                  IdentityResolver.Ens,
                  IdentityResolver.Base,
                ],
              },
            }}>
          <XMTPProvider>{children}</XMTPProvider>
          </WhiskSdkProvider>
        </MiniAppWalletProvider>
      </FrameProvider>
    </ErudaProvider>
  );
};
