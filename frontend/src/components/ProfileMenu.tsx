'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { Copy, Check, ExternalLink, Settings, Eye, EyeOff, User } from 'lucide-react';
import { database, type ProfilePrivacySettings } from '@/lib/database';

export default function ProfileMenu() {
  const { address, isConnected } = useAccount();
  const [copied, setCopied] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [privacySettings, setPrivacySettings] = useState<ProfilePrivacySettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const [debugInfo, setDebugInfo] = useState<any>(null);

  // Get current user address (either wallet or ephemeral)
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

  // Enhanced data loading with debugging
  const loadUserData = useCallback(async () => {
    if (!currentAddress) return;

    const user = database.getUser(currentAddress);
    const stats = database.calculateUserStats(currentAddress);
    const privacy = database.getPrivacySettings(currentAddress);
    
    setUserData(user);
    setPrivacySettings(privacy);
    
    // Debug information
    setDebugInfo({
      address: currentAddress,
      hasUser: !!user,
      userCreatedAt: user?.createdAt,
      userUpdatedAt: user?.updatedAt,
      statsCalculated: stats,
      privacySettings: privacy,
      localStorageKeys: Object.keys(localStorage)
        .filter(key => key.includes('xmtp_app_') && key.includes(currentAddress.toLowerCase()))
        .length,
    });

    // If no user data found, try to fetch from session storage
    if (!user) {
      const sessionInboxId = localStorage.getItem('user:inboxId');
      const sessionAddress = localStorage.getItem('user:address');
      
      if (sessionInboxId && sessionAddress === currentAddress) {
        console.log("🔄 Creating user record from session data");
        try {
          await database.createOrUpdateUser({
            address: currentAddress,
            xmtpId: sessionInboxId,
            createdAt: new Date().toISOString(),
          });
          // Reload data
          const newUser = database.getUser(currentAddress);
          setUserData(newUser);
          console.log("✅ User record created from session data");
        } catch (error) {
          console.error("❌ Failed to create user from session data:", error);
        }
      }
    }
  }, [currentAddress]);

  // Load user data and privacy settings
  useEffect(() => {
    loadUserData();
  }, [loadUserData]);

  // Refresh data when connection changes
  useEffect(() => {
    if (isConnected && currentAddress) {
      loadUserData();
    }
  }, [isConnected, currentAddress, loadUserData]);

  // Generate profile URL
  const getProfileUrl = () => {
    if (!currentAddress) return '';
    
    const user = database.getUser(currentAddress);
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    
    // Use ENS name if available, otherwise use address
    const identifier = user?.ensName || currentAddress;
    return `${baseUrl}/user/${identifier}`;
  };

  // Copy profile URL to clipboard
  const copyProfileUrl = async () => {
    const url = getProfileUrl();
    if (!url) return;
    
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy profile URL:', error);
    }
  };

  // Update privacy setting
  const updatePrivacySetting = async (key: keyof Omit<ProfilePrivacySettings, 'userId' | 'updatedAt'>, value: any) => {
    if (!currentAddress) return;
    
    setLoading(true);
    try {
      const updatedSettings = await database.createOrUpdatePrivacySettings(currentAddress, {
        [key]: value
      });
      setPrivacySettings(updatedSettings);
    } catch (error) {
      console.error('Failed to update privacy setting:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!currentAddress) {
    return (
      <div className="bg-gray-900 rounded-lg p-4">
        <p className="text-gray-400 text-sm">Connect wallet to access profile</p>
      </div>
    );
  }

  const profileUrl = getProfileUrl();
  const user = database.getUser(currentAddress);
  const username = user?.ensName || `${currentAddress.slice(0, 6)}...${currentAddress.slice(-4)}`;

  return (
    <div className="bg-gray-900 rounded-lg p-4 space-y-4">
      {/* Profile URL Section */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <User className="h-5 w-5" />
          Your Profile
        </h3>
        
        <div className="bg-gray-800 rounded-lg p-3 mb-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm text-gray-400">Profile URL:</span>
            <span className={`text-xs px-2 py-1 rounded ${
              privacySettings?.profileVisibility === 'public' 
                ? 'bg-green-900 text-green-300' 
                : privacySettings?.profileVisibility === 'friends'
                ? 'bg-yellow-900 text-yellow-300'
                : 'bg-red-900 text-red-300'
            }`}>
              {privacySettings?.profileVisibility?.toUpperCase() || 'PUBLIC'}
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm text-white font-mono bg-gray-700 px-2 py-1 rounded flex-1 truncate">
              {profileUrl}
            </span>
            <button
              onClick={copyProfileUrl}
              className="text-gray-400 hover:text-white transition-colors"
              title="Copy profile URL"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </button>
            <a
              href={profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-white transition-colors"
              title="Open profile"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            <Settings className="h-4 w-4" />
            Privacy Settings
          </button>
        </div>
      </div>

      {/* Privacy Settings */}
      {showSettings && (
        <div className="border-t border-gray-700 pt-4">
          <h4 className="text-md font-medium text-white mb-3">Profile Visibility Controls</h4>
          
          <div className="space-y-3">
            {/* Profile Visibility */}
            <div>
              <label className="block text-sm text-gray-300 mb-1">Profile Visibility</label>
              <select
                value={privacySettings?.profileVisibility || 'public'}
                onChange={(e) => updatePrivacySetting('profileVisibility', e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                disabled={loading}
              >
                <option value="public">Public - Anyone can view</option>
                <option value="friends">Friends Only - Limited access</option>
                <option value="private">Private - Hidden from search</option>
              </select>
            </div>

            {/* Privacy Toggles */}
            <div className="grid grid-cols-1 gap-2">
              {[
                { key: 'showEarnings', label: 'Show Earnings', sensitive: true },
                { key: 'showX402Links', label: 'Show X402 Content', sensitive: false },
                { key: 'showPrivacyScore', label: 'Show Privacy Score', sensitive: false },
                { key: 'showStealthActions', label: 'Show Stealth Actions', sensitive: true },
                { key: 'showActivityStats', label: 'Show Activity Stats', sensitive: true },
                { key: 'showConnectedIdentities', label: 'Show Connected Identities', sensitive: false },
                { key: 'showJoinDate', label: 'Show Join Date', sensitive: false },
                { key: 'showTotalViews', label: 'Show View Counts', sensitive: false },
                { key: 'showPurchaseHistory', label: 'Show Purchase History', sensitive: true },
                { key: 'allowDirectContact', label: 'Allow Direct Contact', sensitive: false },
              ].map(({ key, label, sensitive }) => (
                <div key={key} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-300">{label}</span>
                    {sensitive && <span className="text-xs text-orange-400 bg-orange-900/20 px-1 rounded">SENSITIVE</span>}
                  </div>
                  <button
                    onClick={() => updatePrivacySetting(key as any, !privacySettings?.[key as keyof ProfilePrivacySettings])}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                      privacySettings?.[key as keyof ProfilePrivacySettings]
                        ? 'bg-green-900 text-green-300'
                        : 'bg-gray-700 text-gray-400'
                    }`}
                    disabled={loading}
                  >
                    {privacySettings?.[key as keyof ProfilePrivacySettings] ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    {privacySettings?.[key as keyof ProfilePrivacySettings] ? 'Visible' : 'Hidden'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 p-3 bg-blue-900/20 border border-blue-600/30 rounded-lg">
            <p className="text-xs text-blue-300">
              💡 <strong>Privacy Tip:</strong> Sensitive data like earnings and stealth actions are hidden by default. 
              Only enable them if you want this information public on your profile URL.
            </p>
          </div>
        </div>
      )}
    </div>
  );
} 