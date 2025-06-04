"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/Button";
import { SpinnerIcon } from "@/components/icons/SpinnerIcon";
import { CheckIcon } from "@/components/icons/CheckIcon";
import { XIcon } from "@/components/icons/XIcon";
import { Copy, ExternalLink } from 'lucide-react';
import { useAccount } from 'wagmi';

interface Proxy402Link {
  id: string | number;
  short_code: string;
  target?: string;
  target_url: string;
  access_url: string;
  url?: string;
  price: number | string;
  description?: string;
  visits?: number;
  access_count?: number;
  method?: string;
  type?: string;
  created_at?: string;
}

export default function Proxy402Settings() {
  const [jwt, setJwt] = useState("");
  const [loading, setLoading] = useState(false);
  const [links, setLinks] = useState<Proxy402Link[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  
  // Link creation
  const [targetUrl, setTargetUrl] = useState("");
  const [price, setPrice] = useState("0.01");
  const [creatingLink, setCreatingLink] = useState(false);

  const { address, isConnected } = useAccount();

  // Get user-specific storage keys
  const getJWTKey = (userAddress: string) => `proxy402_jwt_${userAddress.toLowerCase()}`;
  const getLinksKey = (userAddress: string) => `proxy402_links_${userAddress.toLowerCase()}`;
  const getEndpointsKey = (userAddress: string) => `proxy402_endpoints_${userAddress.toLowerCase()}`;
  const getActivityStatsKey = (userAddress: string) => `proxy402_activity_stats_${userAddress.toLowerCase()}`;

  // Load saved data from localStorage on mount and when wallet changes
  useEffect(() => {
    if (!isConnected || !address) {
      // Clear state when wallet disconnects
      setJwt("");
      setLinks([]);
      setError("");
      setSuccess("");
      return;
    }

    const jwtKey = getJWTKey(address);
    const linksKey = getLinksKey(address);
    const endpointsKey = getEndpointsKey(address);
    const activityStatsKey = getActivityStatsKey(address);
    
    const savedJwt = localStorage.getItem(jwtKey);
    const savedLinks = localStorage.getItem(linksKey);
    const savedEndpoints = localStorage.getItem(endpointsKey);
    const savedActivityStats = localStorage.getItem(activityStatsKey);
    
    console.log('Loading data for wallet:', address);
    console.log('Saved JWT exists:', !!savedJwt);
    console.log('Saved links count:', savedLinks ? JSON.parse(savedLinks).length : 0);
    console.log('Saved endpoints:', savedEndpoints);
    console.log('Saved activity stats:', savedActivityStats);
    
    if (savedJwt) {
      setJwt(savedJwt);
    } else {
      setJwt("");
    }
    
    if (savedLinks) {
      try {
        const parsedLinks = JSON.parse(savedLinks);
        if (Array.isArray(parsedLinks)) {
          setLinks(parsedLinks);
        }
      } catch (error) {
        console.error('Failed to parse saved links:', error);
        setLinks([]);
      }
    } else {
      setLinks([]);
    }
  }, [address, isConnected]);

  const testConnection = async () => {
    if (!jwt.trim()) {
      setError("Please enter a JWT token");
      return;
    }

    if (!address) {
      setError("Please connect your wallet first");
      return;
    }

    // Save JWT to localStorage for this specific user
    const jwtKey = getJWTKey(address);
    localStorage.setItem(jwtKey, jwt);
    
    // Dispatch custom event to notify other components
    const event = new CustomEvent('proxy402JWTSaved', {
      detail: { address: address.toLowerCase(), jwt }
    });
    window.dispatchEvent(event);
    
    setSuccess("✅ JWT token saved for this wallet!");

    setLoading(true);
    setError("");

    try {
      const response = await fetch('/api/proxy402/links', {
        headers: {
          'Authorization': `Bearer ${jwt}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        const linksArray = Array.isArray(data) ? data : [];
        setLinks(linksArray);
        
        // Save links to localStorage for this specific user
        const linksKey = getLinksKey(address);
        localStorage.setItem(linksKey, JSON.stringify(linksArray));
        
        // Store endpoints count
        const endpointsKey = getEndpointsKey(address);
        const endpointsCount = linksArray.length;
        localStorage.setItem(endpointsKey, endpointsCount.toString());
        
        // Calculate and store activity stats
        const activityStats = {
          totalLinks: linksArray.length,
          totalPurchases: linksArray.reduce((sum, link) => sum + (link.access_count || 0), 0),
          totalRevenue: linksArray.reduce((sum, link) => {
            const price = typeof link.price === 'number' ? link.price : parseFloat(link.price) || 0;
            const purchases = link.access_count || 0;
            return sum + (price * purchases);
          }, 0),
          lastUpdated: new Date().toISOString()
        };
        
        const activityStatsKey = getActivityStatsKey(address);
        localStorage.setItem(activityStatsKey, JSON.stringify(activityStats));
        
        console.log('Stored endpoints count:', endpointsCount);
        console.log('Stored activity stats:', activityStats);
        
        setSuccess("✅ Connected to Proxy402 successfully!");
      } else {
        const errorData = await response.json().catch(() => ({}));
        setError(`❌ Failed to connect: ${errorData.error || response.statusText}`);
      }
    } catch (error) {
      setError(`❌ Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const createPaymentGatedLink = async () => {
    if (!targetUrl.trim()) {
      setError("Please enter a URL");
      return;
    }

    if (!jwt.trim()) {
      setError("Please connect with your JWT token first");
      return;
    }

    if (!address) {
      setError("Please connect your wallet first");
      return;
    }

    setCreatingLink(true);
    setError("");

    try {
      const response = await fetch('/api/proxy402/links/shrink', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${jwt}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          target_url: targetUrl,
          method: 'GET',
          price: parseFloat(price),
          is_test: true
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        // API returns the link data directly, not wrapped in success/data
        const newLinks = [data, ...links];
        setLinks(newLinks);
        
        // Save updated links to localStorage for this specific user
        const linksKey = getLinksKey(address);
        localStorage.setItem(linksKey, JSON.stringify(newLinks));
        
        // Update endpoints count
        const endpointsKey = getEndpointsKey(address);
        const endpointsCount = newLinks.length;
        localStorage.setItem(endpointsKey, endpointsCount.toString());
        
        // Update activity stats
        const activityStats = {
          totalLinks: newLinks.length,
          totalPurchases: newLinks.reduce((sum, link) => sum + (link.access_count || 0), 0),
          totalRevenue: newLinks.reduce((sum, link) => {
            const price = typeof link.price === 'number' ? link.price : parseFloat(link.price) || 0;
            const purchases = link.access_count || 0;
            return sum + (price * purchases);
          }, 0),
          lastUpdated: new Date().toISOString()
        };
        
        const activityStatsKey = getActivityStatsKey(address);
        localStorage.setItem(activityStatsKey, JSON.stringify(activityStats));
        
        console.log('Updated endpoints count after new link:', endpointsCount);
        console.log('Updated activity stats after new link:', activityStats);
        
        setTargetUrl("");
        setSuccess("✅ Payment-gated link created successfully!");
      } else {
        setError(`❌ Failed to create link: ${data.error || response.statusText}`);
      }
    } catch (error) {
      setError(`❌ Failed to create link: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setCreatingLink(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setSuccess("✅ Copied to clipboard!");
      setTimeout(() => setSuccess(""), 2000);
    } catch (error) {
      setError("❌ Failed to copy to clipboard");
    }
  };

  // Don't render if wallet is not connected
  if (!isConnected || !address) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-white mb-2">Proxy402 Settings</h3>
          <div className="text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded p-3">
            <p className="text-sm">Please connect your wallet to configure Proxy402 settings.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-white mb-2">Proxy402 Settings</h3>
        <p className="text-gray-400 text-sm mb-2">
          Create payment-gated links using Proxy402
        </p>
      </div>

      {/* JWT Token Input */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          JWT Token
        </label>
        <div className="flex gap-2">
          <input
            type="password"
            value={jwt}
            onChange={(e) => setJwt(e.target.value)}
            placeholder="Enter your Proxy402 JWT token"
            className="flex-1 bg-gray-800 border border-gray-700 text-white rounded p-2 text-sm"
          />
          <Button
            onClick={testConnection}
            disabled={loading || !jwt.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3"
          >
            {loading ? <SpinnerIcon className="animate-spin h-4 w-4" /> : "Save"}
          </Button>
        </div>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2">
          <XIcon className="h-4 w-4" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 text-green-400 bg-green-500/10 border border-green-500/20 rounded p-2">
          <CheckIcon className="h-4 w-4" />
          <span className="text-sm">{success}</span>
        </div>
      )}

      {/* Create Payment-Gated Link */}
      {jwt && (
        <div className="border-t border-gray-700 pt-4">
          <h4 className="text-md font-medium text-white mb-3">Create Payment-Gated Link</h4>
          
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Target URL
              </label>
              <input
                type="url"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://example.com/premium-content"
                className="w-full bg-gray-800 border border-gray-700 text-white rounded p-2 text-sm"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Price (USD)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded p-2 text-sm"
              />
            </div>
            
            <Button
              onClick={createPaymentGatedLink}
              disabled={creatingLink || !targetUrl.trim()}
              className="w-full bg-green-600 hover:bg-green-700 text-white"
            >
              {creatingLink ? (
                <>
                  <SpinnerIcon className="animate-spin h-4 w-4 mr-2" />
                  Creating Link...
                </>
              ) : (
                "Create Payment-Gated Link"
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Display Links */}
      {links.length > 0 && (
        <div className="border-t border-gray-700 pt-4">
          <h4 className="text-md font-medium text-white mb-3">Your Payment-Gated Links</h4>
          <div className="space-y-3">
            {links.map((link) => (
              <div key={link.id || link.short_code} className="bg-gray-800 rounded p-3">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">
                      {link.target_url || link.target}
                    </p>
                    <p className="text-gray-400 text-xs">
                      Price: ${typeof link.price === 'number' ? link.price.toFixed(2) : link.price}
                      {link.access_count !== undefined && ` • ${link.access_count} purchases`}
                    </p>
                  </div>
                  <div className="flex gap-2 ml-2">
                    <button
                      onClick={() => copyToClipboard(link.access_url)}
                      className="text-gray-400 hover:text-white p-1"
                      title="Copy payment link"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    <a
                      href={link.access_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-400 hover:text-white p-1"
                      title="Open payment link"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </div>
                <div className="bg-gray-900 rounded p-2">
                  <p className="text-gray-300 text-xs font-mono break-all">
                    {link.access_url}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
} 