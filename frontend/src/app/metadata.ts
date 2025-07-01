import { env } from "@/lib/env";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "dstealth: Private Payments & Content Creation",
  description: "Create monetized content, send private payments, and earn rewards with stealth addresses. Built on XMTP and Base.",
  manifest: "/manifest.json",
  keywords: ["XMTP", "Base", "stealth payments", "content creation", "X402", "DeFi", "privacy", "cryptocurrency", "Farcaster", "Mini App"],
  authors: [{ name: "dstealth team" }],
  creator: "dstealth",
  publisher: "dstealth",
  themeColor: "#000000",
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
    title: "dstealth",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    title: "dstealth: Private Payments & Content Creation",
    description: "Create monetized content, send private payments, and earn rewards with stealth addresses. Built on XMTP and Base.",
    type: "website",
    siteName: "dstealth",
    locale: "en_US",
    images: [
      {
        url: "/api/og/default",
        width: 1200,
        height: 630,
        alt: "dstealth - Private Payments & Content Creation",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "dstealth: Private Payments & Content Creation",
    description: "Create monetized content, send private payments, and earn rewards with stealth addresses. Built on XMTP and Base.",
    images: ["/api/og/default"],
    creator: "@dstealth",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: env.NEXT_PUBLIC_URL || 'https://dstealth.app',
  },
  other: {
    "msapplication-TileColor": "#000000",
    "msapplication-config": "/browserconfig.xml",
    // Farcaster Mini App embed (default for all pages)
    "fc:frame": JSON.stringify({
      version: "next",
      imageUrl: `${env.NEXT_PUBLIC_URL || 'https://dstealth.app'}/api/og/default`,
      button: {
        title: "🥷 Launch dstealth",
        action: {
          type: "launch_frame",
          name: "dstealth",
          url: env.NEXT_PUBLIC_URL || 'https://dstealth.app',
          splashImageUrl: `${env.NEXT_PUBLIC_URL || 'https://dstealth.app'}/images/icon.png`,
          splashBackgroundColor: "#000000"
        }
      }
    }),
  },
  metadataBase: new URL(env.NEXT_PUBLIC_URL || 'https://dstealth.app'),
}; 