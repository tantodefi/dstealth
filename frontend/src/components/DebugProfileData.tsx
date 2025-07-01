'use client';

import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { database } from '@/lib/database';
import { Trash2, RefreshCw, Eye } from 'lucide-react';

export default function DebugProfileData() {
  const { address } = useAccount();
  const [userData, setUserData] = useState<any>(null);
  const [apiData, setApiData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const getCurrentUserAddress = () => {
    if (address) return address;
    
    const savedPrivateKey = localStorage.getItem("xmtp:ephemeralKey");
    if (savedPrivateKey) {
      try {
        const { privateKeyToAccount } = require('viem/accounts');
        const formattedKey = savedPrivateKey.startsWith("0x")
          ? savedPrivateKey as `0x${string}`
          : `0x${savedPrivateKey}` as `0x${string}`;
        const account = privateKeyToAccount(formattedKey);
        return account.address;
      } catch (error) {
        console.error("Error getting ephemeral address:", error);
      }
    }
    
    return null;
  };

  const currentAddress = getCurrentUserAddress();

  const loadData = () => {
    if (!currentAddress) return;
    
    // Get local database data
    const user = database.getUser(currentAddress);
    const stats = database.calculateUserStats(currentAddress);
    const links = database.getUserX402Links(currentAddress);
    
    setUserData({
      user,
      stats,
      links,
      localStorage: {
        keys: Object.keys(localStorage).filter(key => key.includes('xmtp_app_')),
        totalSize: Object.keys(localStorage).reduce((sum, key) => {
          return sum + (localStorage.getItem(key)?.length || 0);
        }, 0)
      }
    });
  };

  const fetchApiData = async () => {
    if (!currentAddress) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/user/profile/${currentAddress}?includePrivate=true`);
      const data = await response.json();
      setApiData(data);
    } catch (error) {
      console.error('API Error:', error);
      setApiData({ error: error.message });
    } finally {
      setLoading(false);
    }
  };

  const clearMockData = () => {
    if (!currentAddress) return;
    
    // Clear all user data from localStorage
    database.clearUserData(currentAddress);
    
    // Clear any mock X402 links specifically
    const mockLinkPatterns = [
      '0x9B2FB7\'s Trading Strategy',
      '0x9B2FB7\'s Market Analysis',
      'Trading Strategy',
      'Market Analysis'
    ];
    
    Object.keys(localStorage).forEach(key => {
      if (key.includes('xmtp_app_x402_links')) {
        const data = localStorage.getItem(key);
        if (data && mockLinkPatterns.some(pattern => data.includes(pattern))) {
          localStorage.removeItem(key);
        }
      }
    });
    
    alert('Mock data cleared! Please refresh the page.');
    loadData();
  };

  useEffect(() => {
    loadData();
  }, [currentAddress]);

  if (!currentAddress) {
    return (
      <div className="bg-red-900/20 border border-red-600/30 rounded-lg p-4">
        <p className="text-red-300 text-sm">Connect your wallet to debug profile data</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Debug Profile Data</h3>
        <div className="flex gap-2">
          <button
            onClick={loadData}
            className="flex items-center gap-1 text-sm bg-blue-600 hover:bg-blue-500 text-white py-1 px-3 rounded"
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </button>
          <button
            onClick={fetchApiData}
            disabled={loading}
            className="flex items-center gap-1 text-sm bg-green-600 hover:bg-green-500 text-white py-1 px-3 rounded disabled:opacity-50"
          >
            <Eye className="h-3 w-3" />
            {loading ? 'Loading...' : 'Test API'}
          </button>
          <button
            onClick={clearMockData}
            className="flex items-center gap-1 text-sm bg-red-600 hover:bg-red-500 text-white py-1 px-3 rounded"
          >
            <Trash2 className="h-3 w-3" />
            Clear Mock Data
          </button>
        </div>
      </div>

      {/* Local Database Data */}
      <div className="bg-gray-800 rounded-lg p-3">
        <h4 className="text-white font-medium mb-2">Local Database (localStorage)</h4>
        <div className="text-xs font-mono">
          <div className="text-gray-400 mb-2">Address: {currentAddress}</div>
          <div className="text-gray-400 mb-2">
            Storage Keys: {userData?.localStorage?.keys?.length || 0} 
            ({(userData?.localStorage?.totalSize || 0)} chars)
          </div>
          
          {userData?.user && (
            <div className="mb-2">
              <span className="text-green-400">User Record:</span>
              <pre className="text-white text-xs mt-1 overflow-x-auto">
                {JSON.stringify(userData.user, null, 2)}
              </pre>
            </div>
          )}
          
          {userData?.links && userData.links.length > 0 && (
            <div className="mb-2">
              <span className="text-yellow-400">X402 Links ({userData.links.length}):</span>
              <pre className="text-white text-xs mt-1 overflow-x-auto">
                {JSON.stringify(userData.links, null, 2)}
              </pre>
            </div>
          )}
          
          {userData?.stats && (
            <div className="mb-2">
              <span className="text-blue-400">Stats:</span>
              <pre className="text-white text-xs mt-1 overflow-x-auto">
                {JSON.stringify(userData.stats, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* API Response */}
      {apiData && (
        <div className="bg-gray-800 rounded-lg p-3">
          <h4 className="text-white font-medium mb-2">
            API Response {apiData.success ? '✅' : '❌'}
          </h4>
          <pre className="text-xs font-mono text-white overflow-x-auto">
            {JSON.stringify(apiData, null, 2)}
          </pre>
        </div>
      )}

      {/* Instructions */}
      <div className="bg-blue-900/20 border border-blue-600/30 rounded-lg p-3">
        <h4 className="text-blue-300 font-medium mb-2">How to get real data:</h4>
        <ul className="text-blue-200 text-sm space-y-1">
          <li>1. Clear mock data using the button above</li>
          <li>2. Your profile will show real ENS/Farcaster data if available</li>
          <li>3. Create real X402 content to see it in your profile</li>
          <li>4. Connect fkey.id or convos.org accounts for integration features</li>
          <li>5. The API fetches external data (ENS, Farcaster, Basename) automatically</li>
        </ul>
      </div>
    </div>
  );
} 