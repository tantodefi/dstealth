"use client";

import "./globals.css";
import "@coinbase/onchainkit/styles.css";
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
        <meta name="application-name" content="Dstealth" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Dstealth" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="msapplication-tap-highlight" content="no" />
        
        {/* Enhanced Browser Compatibility Polyfills - Must run FIRST */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Persistent enhanced polyfill for navigator.wallets (required by Solana wallet adapters)
              if (typeof window !== 'undefined' && window.navigator) {
                try {
                  // Create a persistent polyfill function
                  window._applyNavigatorWalletsPolyfill = function() {
                    try {
                      // Check if polyfill is needed
                      if (Array.isArray(window.navigator.wallets)) {
                        return true; // Already working
                      }
                      
                      console.log('🔧 Applying navigator.wallets polyfill...');
                      
                      // Multiple strategies to ensure navigator.wallets is always an array
                      var strategies = [
                        // Strategy 1: Force delete and recreate
                        function() {
                          try {
                            delete window.navigator.wallets;
                            window.navigator.wallets = [];
                            return Array.isArray(window.navigator.wallets);
                          } catch (e) { return false; }
                        },
                        
                        // Strategy 2: defineProperty with writable
                        function() {
                          try {
                            Object.defineProperty(window.navigator, 'wallets', {
                              value: [],
                              writable: true,
                              configurable: true,
                              enumerable: true
                            });
                            return Array.isArray(window.navigator.wallets);
                          } catch (e) { return false; }
                        },
                        
                        // Strategy 3: Getter/Setter approach with persistent backing array
                        function() {
                          try {
                            if (!window._persistentWallets) {
                              window._persistentWallets = [];
                            }
                            Object.defineProperty(window.navigator, 'wallets', {
                              get: function() { 
                                return window._persistentWallets || []; 
                              },
                              set: function(value) { 
                                window._persistentWallets = Array.isArray(value) ? value : []; 
                              },
                              configurable: true,
                              enumerable: true
                            });
                            return Array.isArray(window.navigator.wallets);
                          } catch (e) { return false; }
                        },
                        
                        // Strategy 4: Direct assignment fallback
                        function() {
                          try {
                            window.navigator.wallets = [];
                            return Array.isArray(window.navigator.wallets);
                          } catch (e) { return false; }
                        }
                      ];
                      
                      // Try each strategy until one works
                      for (var i = 0; i < strategies.length; i++) {
                        if (strategies[i]()) {
                          console.log('✅ Navigator.wallets polyfill successful with strategy', i + 1);
                          return true;
                        }
                      }
                      
                      console.warn('❌ All navigator.wallets polyfill strategies failed');
                      return false;
                      
                    } catch (e) {
                      console.warn('Navigator wallets polyfill error:', e);
                      return false;
                    }
                  };
                  
                  // Apply polyfill immediately
                  window._applyNavigatorWalletsPolyfill();
                  
                  // Set up persistent monitoring
                  window._walletsPolyfillInterval = setInterval(function() {
                    if (!Array.isArray(window.navigator.wallets)) {
                      console.log('🚨 navigator.wallets was reset, reapplying polyfill...');
                      window._applyNavigatorWalletsPolyfill();
                    }
                  }, 1000); // Check every second
                  
                  // Also reapply on various events that might reset the property
                  var events = ['DOMContentLoaded', 'load', 'pageshow', 'focus'];
                  events.forEach(function(event) {
                    window.addEventListener(event, function() {
                      setTimeout(function() {
                        if (!Array.isArray(window.navigator.wallets)) {
                          console.log('🔄 Reapplying navigator.wallets polyfill after', event);
                          window._applyNavigatorWalletsPolyfill();
                        }
                      }, 100);
                    });
                  });
                  
                  // Cleanup function for page unload
                  window.addEventListener('beforeunload', function() {
                    if (window._walletsPolyfillInterval) {
                      clearInterval(window._walletsPolyfillInterval);
                    }
                  });
                  
                  console.log('✅ Persistent navigator.wallets polyfill initialized');
                  
                } catch (e) {
                  console.warn('Navigator wallets polyfill critical error:', e);
                  // Ultimate fallback
                  window._walletsFallback = [];
                }
              }
            `,
          }}
        />
        
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
