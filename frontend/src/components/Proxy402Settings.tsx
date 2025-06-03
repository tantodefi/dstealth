"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/Button";
import { SpinnerIcon } from "@/components/icons/SpinnerIcon";
import { CheckIcon } from "@/components/icons/CheckIcon";
import { XIcon } from "@/components/icons/XIcon";
import { Copy, ExternalLink } from 'lucide-react';

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

  // Load saved data from localStorage on mount
  useEffect(() => {
    const savedJwt = localStorage.getItem('proxy402_jwt');
    const savedLinks = localStorage.getItem('proxy402_links');
    
    if (savedJwt) {
      setJwt(savedJwt);
    }
    
    if (savedLinks) {
      try {
        const parsedLinks = JSON.parse(savedLinks);
        if (Array.isArray(parsedLinks)) {
          setLinks(parsedLinks);
        }
      } catch (error) {
        console.error('Failed to parse saved links:', error);
      }
    }
  }, []);

  const testConnection = async () => {
    if (!jwt.trim()) {
      setError("Please enter a JWT token");
      return;
    }

    // Save JWT to localStorage immediately
    localStorage.setItem('proxy402_jwt', jwt);
    setSuccess("✅ JWT token saved!");

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
        
        // Save endpoints to localStorage
        localStorage.setItem('proxy402_links', JSON.stringify(linksArray));
        
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
        
        // Save updated links to localStorage
        localStorage.setItem('proxy402_links', JSON.stringify(newLinks));
        
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

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-white mb-2">Proxy402 Settings</h3>
        <p className="text-gray-400 text-sm">
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

      {/* Link Creation */}
      {jwt && !error && (
        <div>
          <h4 className="text-md font-medium text-white mb-2">Create Payment-Gated Link</h4>
          <div className="space-y-2">
            <input
              type="url"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="Enter URL to make payment-gated"
              className="w-full bg-gray-800 border border-gray-700 text-white rounded p-2 text-sm"
            />
            <div className="flex gap-2">
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="Price (USD)"
                min="0.01"
                step="0.01"
                className="w-24 bg-gray-800 border border-gray-700 text-white rounded p-2 text-sm"
              />
              <Button
                onClick={createPaymentGatedLink}
                disabled={creatingLink || !targetUrl.trim()}
                className="bg-green-600 hover:bg-green-700 text-white flex-1"
              >
                {creatingLink ? <SpinnerIcon className="animate-spin h-4 w-4" /> : "Create Link"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Links List */}
      {links.length > 0 && (
        <div>
          <h4 className="text-md font-medium text-white mb-2">Your Payment-Gated Links</h4>
          <div className="space-y-2">
            {links.map((link) => (
              <div key={link.id} className="bg-gray-800 rounded p-2">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">
                      {link.access_url || link.url || `proxy402.com/${link.short_code}`}
                    </p>
                    <p className="text-gray-400 text-xs truncate">
                      Target: {link.target || link.target_url}
                    </p>
                    <p className="text-gray-400 text-xs">
                      ${link.price} • {link.access_count || link.visits || 0} visits
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => copyToClipboard(link.access_url || link.url || `https://proxy402.com/${link.short_code}`)}
                      className="text-gray-400 hover:text-blue-400 p-1"
                      title="Copy link"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => window.open(link.access_url || link.url || `https://proxy402.com/${link.short_code}`, '_blank')}
                      className="text-gray-400 hover:text-blue-400 p-1"
                      title="Open link"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Help Text */}
      <div className="text-xs text-gray-500 bg-gray-800/50 rounded p-2">
        <p className="mb-1">💡 <strong>How to use Proxy402:</strong></p>
        <ul className="space-y-0.5 ml-3">
          <li>• Get your JWT token from proxy402.com</li>
          <li>• Enter any URL to create a payment-gated version</li>
          <li>• Set a price and share the link</li>
          <li>• Users pay to access the original URL</li>
        </ul>
      </div>
    </div>
  );
} 