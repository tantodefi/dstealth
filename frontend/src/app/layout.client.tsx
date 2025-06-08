"use client";

import "./globals.css";
// import "@coinbase/onchainkit/styles.css";
import { Inter } from "next/font/google";
import { Providers } from "@/providers/index";
import "./config";
import { Toaster } from "react-hot-toast";
import dynamic from "next/dynamic";

const inter = Inter({ subsets: ["latin"] });

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        {/* Mobile Viewport Optimization for smooth scrolling */}
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover" />
        
        {/* X402 Protocol Meta Tags */}
        <meta name="x402:app" content="true" />
        <meta name="x402:version" content="1.0" />
        <meta name="x402:supported-networks" content="base,base-sepolia" />
        <meta name="x402:supported-currencies" content="USDC" />
        
        {/* PWA Meta Tags */}
        <meta name="application-name" content="myf⚡key" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="myf⚡key" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="msapplication-tap-highlight" content="no" />
        
        {/* Protocol Handler Registration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('registerProtocolHandler' in navigator) {
                try {
                  navigator.registerProtocolHandler('x402', '/viewer?x402_uri=%s', 'X402 Protocol Viewer');
                } catch (e) {
                  console.log('Protocol handler registration not supported');
                }
              }
            `,
          }}
        />
        
        {/* Service Worker Registration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js')
                    .then(function(registration) {
                      console.log('SW registered: ', registration);
                    })
                    .catch(function(registrationError) {
                      console.log('SW registration failed: ', registrationError);
                    });
                });
              }
            `,
          }}
        />
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body className={`${inter.className} bg-gray-900 text-white`}>
        <Providers>
          {children}
        </Providers>
        <Toaster 
          toastOptions={{
            style: {
              background: '#1f2937',
              color: '#fff',
              border: '1px solid #374151'
            }
          }}
        />
      </body>
    </html>
  );
}
