import "./globals.css";
import "@coinbase/onchainkit/styles.css";
import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import { env } from "@/lib/env";
import { Providers } from "@/providers/index";
import "./config";

const montserrat = Montserrat({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "XMTP MiniApp",
  description: "XMTP MiniApp",
  metadataBase: new URL(env.NEXT_PUBLIC_URL || 'https://localhost:3000'),
};

export const revalidate = 0;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Ultra-early navigator.wallets polyfill - runs before any modules load
              (function() {
                if (typeof window !== 'undefined' && window.navigator) {
                  try {
                    if (!window.navigator.wallets || !Array.isArray(window.navigator.wallets)) {
                      Object.defineProperty(window.navigator, 'wallets', {
                        value: [],
                        writable: true,
                        configurable: true,
                        enumerable: true
                      });
                      console.log('🚀 Ultra-early navigator.wallets polyfill applied');
                    }
                  } catch (e) {
                    try {
                      window.navigator.wallets = [];
                      console.log('🚀 Ultra-early navigator.wallets fallback applied');
                    } catch (e2) {
                      console.warn('🚀 Ultra-early navigator.wallets polyfill failed:', e2);
                    }
                  }
                }
              })();
            `
          }}
        />
      </head>
      <body
        className={`${montserrat.className} size-full antialiased max-h-screen overflow-y-hidden`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
