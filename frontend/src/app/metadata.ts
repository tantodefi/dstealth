import { env } from "@/lib/env";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "X402 Protocol Mini App",
  description: "A decentralized content payment and viewing application supporting the X402 protocol with XMTP messaging",
  manifest: "/manifest.json",
  themeColor: "#8b5cf6",
  colorScheme: "dark",
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "X402 Protocol",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    title: "X402 Protocol Mini App",
    description: "Decentralized content payments with XMTP messaging",
    type: "website",
    siteName: "X402 Protocol",
  },
  twitter: {
    card: "summary_large_image",
    title: "X402 Protocol Mini App",
    description: "Decentralized content payments with XMTP messaging",
  },
  other: {
    "msapplication-TileColor": "#8b5cf6",
    "msapplication-config": "/browserconfig.xml",
  },
  metadataBase: new URL(env.NEXT_PUBLIC_URL || 'https://localhost:3000'),
}; 