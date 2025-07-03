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
        
        {/* IMMEDIATE polyfill - runs before any extensions */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Immediate polyfill to ensure navigator.wallets exists before extensions load
              (function() {
                if (typeof window !== 'undefined' && window.navigator && !window.navigator.wallets) {
                  try {
                    // Set up immediately as simple array
                    window.navigator.wallets = [];
                    console.log('⚡ Immediate navigator.wallets polyfill applied');
                  } catch (e) {
                    console.warn('Immediate polyfill failed:', e);
                  }
                }
                
                // Defensive error handling for Chrome extension conflicts
                const originalConsoleError = console.error;
                console.error = function(...args) {
                  const message = args.join(' ');
                  if (message.includes('navigator.wallets is not an array')) {
                    console.warn('🛡️ Intercepted navigator.wallets extension error, reapplying polyfill...');
                    try {
                      if (!Array.isArray(window.navigator.wallets)) {
                        window.navigator.wallets = [];
                      }
                    } catch (e) {
                      console.warn('Failed to fix navigator.wallets:', e);
                    }
                    // Still log the original error, but don't let it break the app
                    originalConsoleError.call(console, '🔧 [HANDLED]', ...args);
                  } else {
                    // Normal error logging
                    originalConsoleError.apply(console, args);
                  }
                };
              })();
            `,
          }}
        />
        
        {/* Enhanced Browser Compatibility Polyfills - Must run FIRST */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Cooperative persistent polyfill for navigator.wallets (compatible with browser extensions)
              if (typeof window !== 'undefined' && window.navigator) {
                try {
                  // Create a cooperative polyfill function that respects extension modifications
                  window._applyNavigatorWalletsPolyfill = function() {
                    try {
                      // Check if polyfill is needed
                      if (Array.isArray(window.navigator.wallets)) {
                        return true; // Already working
                      }
                      
                      console.log('🔧 Applying cooperative navigator.wallets polyfill...');
                      
                      // Strategy 1: Cooperative getter/setter that works with extensions
                      try {
                        // Create a persistent backing array that extensions can modify
                        if (!window._cooperativeWallets) {
                          window._cooperativeWallets = [];
                        }
                        
                        // Check if there's already a descriptor (from extensions)
                        const existingDescriptor = Object.getOwnPropertyDescriptor(window.navigator, 'wallets');
                        
                        if (existingDescriptor && existingDescriptor.get) {
                          // Extension already has a getter, try to preserve it
                          console.log('🔍 Extension descriptor detected, preserving...');
                          try {
                            const existingValue = existingDescriptor.get.call(window.navigator);
                            if (Array.isArray(existingValue)) {
                              return true; // Extension's implementation is working
                            }
                          } catch (e) {
                            console.log('Extension getter failed, applying fallback');
                          }
                        }
                        
                        // Apply our cooperative implementation
                        Object.defineProperty(window.navigator, 'wallets', {
                          get: function() {
                            // Return extension's wallets if they exist, otherwise our fallback
                            try {
                              const extensionWallets = window._extensionWallets || window._cooperativeWallets;
                              return Array.isArray(extensionWallets) ? extensionWallets : [];
                            } catch (e) {
                              return window._cooperativeWallets || [];
                            }
                          },
                          set: function(value) {
                            // Allow extensions to set wallets
                            if (Array.isArray(value)) {
                              window._extensionWallets = value;
                              window._cooperativeWallets = [...value]; // Keep a backup
                            } else {
                              console.warn('Non-array value set to navigator.wallets:', value);
                              window._cooperativeWallets = [];
                            }
                          },
                          configurable: true,
                          enumerable: true
                        });
                        
                        // Verify it works
                        if (Array.isArray(window.navigator.wallets)) {
                          console.log('✅ Cooperative navigator.wallets polyfill successful');
                          return true;
                        }
                        
                      } catch (e) {
                        console.log('Cooperative strategy failed, trying simple fallback:', e);
                      }
                      
                      // Fallback strategies for when cooperative approach doesn't work
                      var fallbackStrategies = [
                        // Simple array assignment
                        function() {
                          try {
                            window.navigator.wallets = [];
                            return Array.isArray(window.navigator.wallets);
                          } catch (e) { return false; }
                        },
                        
                        // Force defineProperty
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
                        }
                      ];
                      
                      // Try fallback strategies
                      for (var i = 0; i < fallbackStrategies.length; i++) {
                        if (fallbackStrategies[i]()) {
                          console.log('✅ Navigator.wallets fallback strategy', i + 1, 'successful');
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
                  
                  // Set up less aggressive monitoring (every 5 seconds instead of 1)
                  window._walletsPolyfillInterval = setInterval(function() {
                    if (!Array.isArray(window.navigator.wallets)) {
                      console.log('🚨 navigator.wallets was reset, reapplying cooperative polyfill...');
                      window._applyNavigatorWalletsPolyfill();
                    }
                  }, 5000); // Check every 5 seconds to be less aggressive
                  
                  // Also reapply on page focus (when user returns to tab)
                  window.addEventListener('focus', function() {
                    setTimeout(function() {
                      if (!Array.isArray(window.navigator.wallets)) {
                        console.log('🔄 Reapplying navigator.wallets polyfill on focus');
                        window._applyNavigatorWalletsPolyfill();
                      }
                    }, 1000); // Give extensions time to initialize after focus
                  });
                  
                  // Listen for extension modifications
                  var originalDefineProperty = Object.defineProperty;
                  Object.defineProperty = function(obj, prop, descriptor) {
                    if (obj === window.navigator && prop === 'wallets') {
                      console.log('🔍 Extension is modifying navigator.wallets');
                      // Let the extension do its thing, then check if we need to fix it
                      setTimeout(function() {
                        if (!Array.isArray(window.navigator.wallets)) {
                          console.log('🔧 Extension modification broke wallets array, fixing...');
                          window._applyNavigatorWalletsPolyfill();
                        }
                      }, 100);
                    }
                    return originalDefineProperty.call(this, obj, prop, descriptor);
                  };
                  
                  // Cleanup function for page unload
                  window.addEventListener('beforeunload', function() {
                    if (window._walletsPolyfillInterval) {
                      clearInterval(window._walletsPolyfillInterval);
                    }
                    // Restore original defineProperty
                    Object.defineProperty = originalDefineProperty;
                  });
                  
                  console.log('✅ Cooperative navigator.wallets polyfill initialized');
                  
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
        
        {/* Service Worker Registration with Payment Link Cleanup */}
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
                
                // Listen for messages from service worker
                navigator.serviceWorker.addEventListener('message', function(event) {
                  if (event.data && event.data.type === 'CLEANUP_PAYMENT_LINKS') {
                    console.log('🧹 SW: Received payment link cleanup request');
                    let cleanupResults = {
                      status: 'success',
                      keysRemoved: 0,
                      keysScanned: 0,
                      removedKeys: [],
                      errors: []
                    };
                    
                    try {
                      // Clean up payment link related data from localStorage
                      const cleanupKeys = [];
                      
                      // Scan localStorage for payment link related keys
                      const totalKeys = localStorage.length;
                      cleanupResults.keysScanned = totalKeys;
                      
                      for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        if (key && (
                          key.includes('payment') || 
                          key.includes('stealth') || 
                          key.includes('dstealth') ||
                          key.includes('fkey') ||
                          key.includes('zkProof') ||
                          key.includes('stealthAddress') ||
                          key.includes('paymentLink')
                        )) {
                          cleanupKeys.push(key);
                        }
                      }
                      
                      // Remove identified keys
                      cleanupKeys.forEach(key => {
                        try {
                          localStorage.removeItem(key);
                          cleanupResults.removedKeys.push(key);
                          console.log('🗑️ SW: Removed localStorage key:', key);
                        } catch (err) {
                          cleanupResults.errors.push(\`Failed to remove \${key}: \${err.message}\`);
                        }
                      });
                      
                      // Also clean up any dstealth-specific data
                      const dstealthPattern = /dstealth|stealth|fkey|payment.*link/i;
                      const additionalKeys = Object.keys(localStorage).filter(key => 
                        dstealthPattern.test(key) && !cleanupKeys.includes(key)
                      );
                      
                      additionalKeys.forEach(key => {
                        try {
                          localStorage.removeItem(key);
                          cleanupResults.removedKeys.push(key);
                          console.log('🗑️ SW: Removed dstealth key:', key);
                        } catch (err) {
                          cleanupResults.errors.push(\`Failed to remove \${key}: \${err.message}\`);
                        }
                      });
                      
                      cleanupResults.keysRemoved = cleanupResults.removedKeys.length;
                      
                      console.log('✅ SW: Payment link cleanup completed:', {
                        keysScanned: cleanupResults.keysScanned,
                        keysRemoved: cleanupResults.keysRemoved,
                        errors: cleanupResults.errors.length
                      });
                      
                      // Show user notification if we removed keys
                      if (cleanupResults.keysRemoved > 0 && window.location.pathname !== '/') {
                        // Create a subtle notification
                        const notification = document.createElement('div');
                        notification.style.cssText = \`
                          position: fixed;
                          top: 20px;
                          right: 20px;
                          background: #059669;
                          color: white;
                          padding: 12px 16px;
                          border-radius: 8px;
                          font-size: 14px;
                          z-index: 10000;
                          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                          animation: slideIn 0.3s ease-out;
                        \`;
                        notification.innerHTML = \`🧹 Cleaned up \${cleanupResults.keysRemoved} payment links\`;
                        
                        // Add slide-in animation
                        const style = document.createElement('style');
                        style.textContent = \`
                          @keyframes slideIn {
                            from { transform: translateX(100%); opacity: 0; }
                            to { transform: translateX(0); opacity: 1; }
                          }
                        \`;
                        document.head.appendChild(style);
                        
                        document.body.appendChild(notification);
                        
                        // Remove notification after 4 seconds
                        setTimeout(() => {
                          notification.style.animation = 'slideIn 0.3s ease-out reverse';
                          setTimeout(() => {
                            if (notification.parentNode) {
                              notification.parentNode.removeChild(notification);
                            }
                          }, 300);
                        }, 4000);
                      }
                      
                    } catch (error) {
                      console.error('SW: Error during payment link cleanup:', error);
                      cleanupResults.status = 'error';
                      cleanupResults.errors.push(error.message || 'Unknown cleanup error');
                    }
                    
                    // Send results back to service worker
                    if (navigator.serviceWorker.controller) {
                      navigator.serviceWorker.controller.postMessage({
                        type: 'CLEANUP_RESULTS',
                        results: cleanupResults,
                        requestId: event.data.requestId
                      });
                    }
                  }
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
