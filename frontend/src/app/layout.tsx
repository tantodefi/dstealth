import "./globals.css";
import "@coinbase/onchainkit/styles.css";
import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import { env } from "@/lib/env";
import { Providers } from "@/providers";
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
      <body
        className={`${montserrat.className} size-full antialiased max-h-screen overflow-y-hidden`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
