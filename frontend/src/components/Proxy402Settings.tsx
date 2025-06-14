"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/Button";
import { SpinnerIcon } from "@/components/icons/SpinnerIcon";
import { CheckIcon } from "@/components/icons/CheckIcon";
import { XIcon } from "@/components/icons/XIcon";
import { Copy, ExternalLink, Eye } from 'lucide-react';
import { useAccount } from 'wagmi';
import { createX402ShareableURLs } from '@/lib/x402-frame';
import { database } from '@/lib/database';

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

interface X402Link {
  id: string;
  uri: string;
  name: string;
  description?: string;
  contentType: string;
  pricing: Array<{amount: number, currency: string}>;
  viewerUrl: string;
  created_at: string;
}

export default function Proxy402Settings() {
  const [jwt, setJwt] = useState("");
  const [loading, setLoading] = useState(false);
  const [links, setLinks] = useState<Proxy402Link[]>([]);
  const [x402Links, setX402Links] = useState<X402Link[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  
  // Link creation
  const [targetUrl, setTargetUrl] = useState("");
  const [price, setPrice] = useState("0.01");
  const [creatingLink, setCreatingLink] = useState(false);
  
  // URI scheme selection - Default to X402:// first for production
  const [uriScheme, setUriScheme] = useState<'x402' | 'proxy402' | 'file'>('x402');
  
  // X402 specific fields
  const [contentName, setContentName] = useState("");
  const [contentDescription, setContentDescription] = useState("");
  const [contentType, setContentType] = useState<'text' | 'image' | 'video' | 'audio' | 'file'>('text');
  const [selectedNetwork, setSelectedNetwork] = useState<'base-sepolia' | 'base'>('base-sepolia');
  
  // File upload fields
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const { address, isConnected } = useAccount();

  // Copy to clipboard utility function
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setSuccess("✅ Copied to clipboard!");
      setTimeout(() => setSuccess(""), 2000);
    }).catch(() => {
      setError("❌ Failed to copy to clipboard");
      setTimeout(() => setError(""), 2000);
    });
  };

  // Get user-specific storage keys
  const getJWTKey = (userAddress: string) => `proxy402_jwt_${userAddress.toLowerCase()}`;
  const getLinksKey = (userAddress: string) => `proxy402_links_${userAddress.toLowerCase()}`;
  const getX402LinksKey = (userAddress: string) => `x402_links_${userAddress.toLowerCase()}`;
  const getEndpointsKey = (userAddress: string) => `proxy402_endpoints_${userAddress.toLowerCase()}`;
  const getActivityStatsKey = (userAddress: string) => `proxy402_activity_stats_${userAddress.toLowerCase()}`;

  // Load saved data from localStorage on mount and when wallet changes
  useEffect(() => {
    if (!isConnected || !address) {
      // Clear state when wallet disconnects
      setJwt("");
      setLinks([]);
      setX402Links([]);
      setError("");
      setSuccess("");
      return;
    }

    // Get JWT from database first
    const userData = database.getUser(address);
    let savedJwt = userData?.jwtToken;

    // If not in database, try localStorage
    if (!savedJwt) {
      const jwtKey = getJWTKey(address);
      savedJwt = localStorage.getItem(jwtKey);
    }

    const linksKey = getLinksKey(address);
    const x402LinksKey = getX402LinksKey(address);
    const endpointsKey = getEndpointsKey(address);
    const activityStatsKey = getActivityStatsKey(address);
    
    const savedLinks = localStorage.getItem(linksKey);
    const savedX402Links = localStorage.getItem(x402LinksKey);
    const savedEndpoints = localStorage.getItem(endpointsKey);
    const savedActivityStats = localStorage.getItem(activityStatsKey);
    
    console.log('Loading data for wallet:', address);
    console.log('Saved JWT exists:', !!savedJwt);
    console.log('Saved links count:', savedLinks ? JSON.parse(savedLinks).length : 0);
    console.log('Saved X402 links count:', savedX402Links ? JSON.parse(savedX402Links).length : 0);
    
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
    
    if (savedX402Links) {
      try {
        const parsedX402Links = JSON.parse(savedX402Links);
        if (Array.isArray(parsedX402Links)) {
          setX402Links(parsedX402Links);
        }
      } catch (error) {
        console.error('Failed to parse saved X402 links:', error);
        setX402Links([]);
      }
    } else {
      setX402Links([]);
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
            // Convert price to cents to match API format (multiply by 100)
            return sum + (price * purchases * 100);
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
    if (uriScheme === 'x402') {
      return createX402URI();
    }
    
    if (uriScheme === 'file') {
      return createFileUpload();
    }
    
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
            // Convert price to cents to match API format (multiply by 100)
            return sum + (price * purchases * 100);
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

  const createX402URI = async () => {
    if (!contentName.trim()) {
      setError("Please enter a content name");
      return;
    }

    if (!targetUrl.trim()) {
      setError("Please enter a target URL");
      return;
    }

    if (!address) {
      setError("Please connect your wallet first");
      return;
    }

    setCreatingLink(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch('/api/x402/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: contentName,
          description: contentDescription,
          contentType: contentType,
          pricing: [{ amount: parseFloat(price), currency: 'USDC', network: selectedNetwork }],
          accessEndpoint: targetUrl,
          coverUrl: '',
          paymentRecipient: address, // Use creator's wallet address as payment recipient
          fileInfo: {
            type: contentType,
            size: undefined
          }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create X402 URI');
      }

      const data = await response.json();
      
      if (data.success && data.x402_uri) {
        // Create shareable URLs for the new content
        const contentId = data.x402_uri.split('/').pop();
        const shareUrls = createX402ShareableURLs(contentId);
        
        const newX402Link: X402Link = {
          id: contentId,
          uri: data.x402_uri,
          name: contentName,
          description: contentDescription,
          contentType: contentType,
          pricing: [{ amount: parseFloat(price), currency: 'USDC' }],
          viewerUrl: shareUrls.viewer,
          created_at: new Date().toISOString()
        };
        
        const newX402Links = [newX402Link, ...x402Links];
        setX402Links(newX402Links);
        
        // Save updated X402 links to localStorage
        const x402LinksKey = getX402LinksKey(address);
        localStorage.setItem(x402LinksKey, JSON.stringify(newX402Links));
        
        // Update activity stats with current links count
        const currentLinks = [...links];
        const activityStats = {
          totalLinks: currentLinks.length + newX402Links.length,
          totalPurchases: currentLinks.reduce((sum, link) => sum + (link.access_count || 0), 0),
          totalRevenue: currentLinks.reduce((sum, link) => {
            const price = typeof link.price === 'number' ? link.price : parseFloat(link.price) || 0;
            const purchases = link.access_count || 0;
            // Convert price to cents to match API format (multiply by 100)
            return sum + (price * purchases * 100);
          }, 0),
          lastUpdated: new Date().toISOString()
        };
        
        const activityStatsKey = getActivityStatsKey(address);
        localStorage.setItem(activityStatsKey, JSON.stringify(activityStats));
        
        // Clear form
        setContentName("");
        setContentDescription("");
        setTargetUrl("");
        setSuccess(`✅ X402 URI created successfully on ${selectedNetwork}!`);
      } else {
        setError("❌ Failed to create X402 URI");
      }
    } catch (error) {
      setError(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setCreatingLink(false);
    }
  };

  const createFileUpload = async () => {
    if (!selectedFile) {
      setError("Please select a file to upload");
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
    setUploadProgress(0);

    try {
      // Step 1: Get pre-signed upload URL from proxy402
      const uploadResponse = await fetch('/api/proxy402/files/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${jwt}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          original_filename: selectedFile.name,
          price: parseFloat(price),
          is_test: true,
          type: 'credit',
          credits: 1
        })
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json();
        throw new Error(errorData.error || 'Failed to initiate file upload');
      }

      const { upload_url } = await uploadResponse.json();
      
      // Step 2: Upload file directly to cloud storage
      setUploadProgress(25);
      
      const fileUploadResponse = await fetch(upload_url, {
        method: 'PUT',
        body: selectedFile,
        headers: {
          'Content-Type': selectedFile.type
        }
      });

      if (!fileUploadResponse.ok) {
        throw new Error('Failed to upload file to storage');
      }

      setUploadProgress(75);

      // Step 3: Refresh links to get the new file link
      const linksResponse = await fetch('/api/proxy402/links', {
        headers: {
          'Authorization': `Bearer ${jwt}`
        }
      });

      if (linksResponse.ok) {
        const data = await linksResponse.json();
        const linksArray = Array.isArray(data) ? data : [];
        setLinks(linksArray);
        
        // Save updated links to localStorage
        const linksKey = getLinksKey(address);
        localStorage.setItem(linksKey, JSON.stringify(linksArray));
        
        setUploadProgress(100);
        setSelectedFile(null);
        setSuccess("✅ File uploaded and monetized successfully!");
      } else {
        setSuccess("✅ File uploaded successfully! Please refresh to see the new link.");
      }
      
    } catch (error) {
      setError(`❌ Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setCreatingLink(false);
      setUploadProgress(0);
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
          Create payment-gated links using Proxy402.com or generate X402:// URIs for our built-in viewer
        </p>
      </div>

      {/* JWT Token Input */}
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          JWT Token (for Proxy402.com)
        </label>
        <p className="text-xs text-gray-400 mb-2">
          Only required for creating proxy402.com links. X402:// URIs work without JWT.
        </p>
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
      {(jwt || uriScheme === 'x402') && (
        <div className="border-t border-gray-700 pt-4">
          <h4 className="text-md font-medium text-white mb-3">Create Payment-Gated Content</h4>
          
          {/* URI Scheme Toggle - X402 first */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Content Type
            </label>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setUriScheme('x402')}
                className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                  uriScheme === 'x402'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                X402:// URIs (Built-in)
              </button>
              <button
                onClick={() => setUriScheme('proxy402')}
                className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                  uriScheme === 'proxy402'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                Proxy402.com Links
              </button>
              <button
                onClick={() => setUriScheme('file')}
                className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                  uriScheme === 'file'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                File Upload
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {uriScheme === 'x402' && "Create payment-gated content using our built-in X402 protocol with real USDC payments on Base/Base Sepolia"}
              {uriScheme === 'proxy402' && "Create payment-gated links using Proxy402.com external service (requires JWT)"}
              {uriScheme === 'file' && "Upload files to cloud storage with payment gating via Proxy402.com (requires JWT)"}
            </p>
          </div>
          
          {/* File Upload Fields (only shown for file scheme) */}
          {uriScheme === 'file' && (
            <div className="space-y-3 mb-3">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Select File *
                </label>
                <input
                  type="file"
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSelectedFile(e.target.files?.[0] || null)}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded p-2 text-sm file:mr-4 file:py-1 file:px-2 file:rounded file:border-0 file:text-sm file:font-medium file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                />
                {selectedFile && (
                  <p className="text-xs text-gray-400 mt-1">
                    Selected: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                  </p>
                )}
              </div>
              
              {uploadProgress > 0 && (
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div 
                    className="bg-green-600 h-2 rounded-full transition-all duration-300" 
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                  <p className="text-xs text-gray-400 mt-1">{uploadProgress}% uploaded</p>
                </div>
              )}
            </div>
          )}
          
          {/* X402 Fields (only shown for X402 scheme) */}
          {uriScheme === 'x402' && (
            <div className="space-y-3 mb-3">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Content Name *
                </label>
                <input
                  type="text"
                  value={contentName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setContentName(e.target.value)}
                  placeholder="My Premium Content"
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded p-2 text-sm"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Content Description
                </label>
                <textarea
                  value={contentDescription}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setContentDescription(e.target.value)}
                  placeholder="Describe your premium content..."
                  rows={2}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded p-2 text-sm resize-none"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Content Type
                </label>
                <select
                  value={contentType}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setContentType(e.target.value as typeof contentType)}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded p-2 text-sm"
                >
                  <option value="text">Text</option>
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                  <option value="audio">Audio</option>
                  <option value="file">File</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Payment Network
                </label>
                <select
                  value={selectedNetwork}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedNetwork(e.target.value as 'base-sepolia' | 'base')}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded p-2 text-sm"
                >
                  <option value="base-sepolia">Base Sepolia (Testing)</option>
                  <option value="base">Base Mainnet (Production)</option>
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  {selectedNetwork === 'base-sepolia' 
                    ? 'Use Base Sepolia for testing with testnet USDC' 
                    : 'Use Base Mainnet for production with real USDC'
                  }
                </p>
              </div>
            </div>
          )}
          
          <div className="space-y-3">
            {/* URL Field (for proxy402 and x402 schemes) */}
            {(uriScheme === 'proxy402' || uriScheme === 'x402') && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                  {uriScheme === 'proxy402' ? 'Target URL' : 'Content/Access URL'}
              </label>
              <input
                type="url"
                value={targetUrl}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTargetUrl(e.target.value)}
                  placeholder={uriScheme === 'proxy402' 
                    ? "https://example.com/premium-content"
                    : "https://example.com/api/premium-content"
                  }
                className="w-full bg-gray-800 border border-gray-700 text-white rounded p-2 text-sm"
              />
            </div>
            )}
            
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Price (USD)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPrice(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded p-2 text-sm"
              />
            </div>
            
            {((uriScheme === 'proxy402' || uriScheme === 'file') && !jwt) && (
              <div className="text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded p-3">
                <p className="text-sm">Please enter and save your JWT token above to create proxy402.com content.</p>
              </div>
            )}
            
            <Button
              onClick={createPaymentGatedLink}
              disabled={
                creatingLink || 
                (uriScheme === 'proxy402' && (!targetUrl.trim() || !jwt.trim())) ||
                (uriScheme === 'file' && (!selectedFile || !jwt.trim())) ||
                (uriScheme === 'x402' && (!contentName.trim() || !targetUrl.trim()))
              }
              className="w-full bg-green-600 hover:bg-green-700 text-white"
            >
              {creatingLink ? (
                <>
                  <SpinnerIcon className="animate-spin h-4 w-4 mr-2" />
                  {uriScheme === 'file' ? 'Uploading...' : 
                   uriScheme === 'x402' ? 'Creating X402 URI...' : 'Creating Link...'}
                </>
              ) : (
                `Create ${uriScheme === 'file' ? 'File Upload' : 
                         uriScheme === 'x402' ? 'X402 URI' : 'Payment-Gated Link'}`
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

      {/* Display X402 Links */}
      {x402Links.length > 0 && (
        <div className="border-t border-gray-700 pt-4">
          <h4 className="text-md font-medium text-white mb-3">Your X402:// URIs</h4>
          <div className="space-y-3">
            {x402Links.map((link) => (
              <div key={link.id} className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2 py-1 bg-purple-900/50 text-purple-300 text-xs rounded font-mono">
                        X402://
                      </span>
                      <p className="text-white text-sm font-medium truncate">
                        {link.name}
                      </p>
                    </div>
                    <p className="text-gray-400 text-xs mb-2">
                      {link.contentType} • ${link.pricing[0]?.amount} {link.pricing[0]?.currency}
                      {link.description && ` • ${link.description}`}
                    </p>
                    <p className="text-gray-500 text-xs">
                      Created: {new Date(link.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2 ml-2">
                    <button
                      onClick={() => copyToClipboard(link.uri)}
                      className="text-gray-400 hover:text-purple-400 p-1 transition-colors"
                      title="Copy X402 URI"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    <a
                      href={link.viewerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-400 hover:text-purple-400 p-1 transition-colors"
                      title="Open in viewer"
                    >
                      <Eye className="h-4 w-4" />
                    </a>
                    <a
                      href={link.viewerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-400 hover:text-blue-400 p-1 transition-colors"
                      title="Open in new tab"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </div>
                
                {/* X402 URI Display */}
                <div className="bg-gray-800 border border-gray-600 rounded-md p-3 mb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-purple-400 text-xs font-medium">X402 URI:</span>
                    <button
                      onClick={() => copyToClipboard(link.uri)}
                      className="text-gray-400 hover:text-white text-xs"
                    >
                      📋 Copy
                    </button>
                  </div>
                  <p className="text-purple-300 text-xs font-mono break-all leading-relaxed">
                    {link.uri}
                  </p>
                </div>
                
                {/* Frame Shareable URL Display */}
                <div className="bg-purple-900/20 border border-purple-700/50 rounded-md p-3 mb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-purple-400 text-xs font-medium">🖼️ Farcaster Frame URL:</span>
                    <button
                      onClick={() => copyToClipboard(createX402ShareableURLs(link.id).frame)}
                      className="text-gray-400 hover:text-white text-xs"
                    >
                      📋 Copy
                    </button>
                  </div>
                  <p className="text-purple-300 text-xs break-all leading-relaxed">
                    {createX402ShareableURLs(link.id).frame}
                  </p>
                  <p className="text-gray-400 text-xs mt-1">
                    Share this URL on Farcaster for rich Frame previews with payment integration
                  </p>
                </div>
                
                {/* Viewer URL Display */}
                <div className="bg-blue-900/20 border border-blue-700/50 rounded-md p-3 mb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-blue-400 text-xs font-medium">Viewer URL:</span>
                    <button
                      onClick={() => copyToClipboard(link.viewerUrl)}
                      className="text-gray-400 hover:text-white text-xs"
                    >
                      📋 Copy
                    </button>
                  </div>
                  <p className="text-blue-300 text-xs break-all leading-relaxed">
                    {link.viewerUrl}
                  </p>
                </div>
                
                {/* Quick Share Actions */}
                <div className="flex gap-2 flex-wrap">
                  <a
                    href={createX402ShareableURLs(link.id).warpcast}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs flex items-center gap-1"
                  >
                    📢 Share on Warpcast
                  </a>
                  <button
                    onClick={() => copyToClipboard(createX402ShareableURLs(link.id).frame)}
                    className="px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs flex items-center gap-1"
                  >
                    🖼️ Copy Frame URL
                  </button>
                  <a
                    href={link.viewerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs flex items-center gap-1"
                  >
                    👁️ Preview Content
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">X402 Link Management</h3>
          <div className="text-xs text-gray-400">
            {links.length} link{links.length !== 1 ? 's' : ''} created
          </div>
        </div>

        {/* URL Format Explanation */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <h4 className="text-sm font-medium text-white mb-3">URL Format Guide</h4>
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="text-green-400 font-medium">✅ proxy402.com URLs (Recommended)</div>
                <div className="bg-gray-900 p-2 rounded font-mono text-gray-300">
                  https://proxy402.com/c/abc123
                </div>
                <ul className="text-gray-400 space-y-1">
                  <li>• Universal browser support</li>
                  <li>• Social media previews</li>
                  <li>• Easy sharing</li>
                  <li>• Mobile-friendly</li>
                </ul>
              </div>
              <div className="space-y-2">
                <div className="text-blue-400 font-medium">⚡ x402:// URIs (Technical)</div>
                <div className="bg-gray-900 p-2 rounded font-mono text-gray-300">
                  x402://proxy402.com/content/abc123
                </div>
                <ul className="text-gray-400 space-y-1">
                  <li>• Native X402 protocol</li>
                  <li>• Decentralized domains</li>
                  <li>• Rich metadata</li>
                  <li>• Standards compliant</li>
                </ul>
              </div>
            </div>
            <div className="pt-2 border-t border-gray-700">
              <p className="text-gray-400">
                <strong>Best Practice:</strong> Use proxy402.com URLs for sharing, x402:// URIs for technical integrations and dApps.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 