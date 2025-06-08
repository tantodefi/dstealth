'use client';

import { useXMTP } from '@/context/xmtp-context';
import { useAccount } from 'wagmi';
import { useState, useEffect } from 'react';
import { MessageCircle, ExternalLink, Copy, Check } from 'lucide-react';
import ConvosChat from '@/components/ConvosChat';
import UserAvatar from '@/components/UserAvatar';

export default function UserPage() {
  const { client, isInFarcasterContext, farcasterUser } = useXMTP();
  const { address } = useAccount();
  const [mounted, setMounted] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const [fkeyUsername, setFkeyUsername] = useState('');
  const [convosUsername, setConvosUsername] = useState('');
  const [showConvosChat, setShowConvosChat] = useState(false);
  const [copied, setCopied] = useState(false);

  // Handle mounting
  useEffect(() => {
    setMounted(true);
  }, []);

  // Load settings and user data
  useEffect(() => {
    if (mounted) {
      const savedFkeyUsername = localStorage.getItem('fkey:username') || '';
      const savedConvosUsername = localStorage.getItem('convos:username') || '';
      
      setFkeyUsername(savedFkeyUsername);
      setConvosUsername(savedConvosUsername);
    }
  }, [mounted]);

  // Get the current user's address (either wallet or ephemeral)
  const getCurrentUserAddress = () => {
    if (!mounted) return null; // Prevent SSR issues
    if (address) return address;
    
    // Check for ephemeral address
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

  useEffect(() => {
    if (currentAddress) {
      setUserData({
        address: currentAddress,
        inboxId: client?.inboxId,
        farcasterProfile: isInFarcasterContext ? farcasterUser : null,
      });
    }
  }, [currentAddress, client, isInFarcasterContext, farcasterUser]);

  // Copy to clipboard function
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  if (!mounted) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    );
  }

  if (!currentAddress) {
    return (
      <div className="min-h-screen bg-black text-white max-w-sm mx-auto">
        <div className="p-4">
          <h1 className="text-xl font-bold mb-4">Profile</h1>
          <div className="bg-gray-900 rounded-lg p-4">
            <p className="text-gray-400 text-sm">
              Please connect your wallet to view your profile.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Mini App Viewport Container */}
      <div className="max-w-sm mx-auto">
        <div className="p-4 space-y-4">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center gap-4 mb-4">
              <UserAvatar
                address={currentAddress || undefined}
                farcasterUser={userData?.farcasterProfile}
                size={64}
              />
              <div>
                <h1 className="text-2xl font-bold">Your Profile</h1>
                <p className="text-gray-400 text-sm">
                  Manage your XMTP and Web3 identity
                </p>
              </div>
            </div>
          </div>

          {/* Profile Overview */}
          <div className="bg-gray-900 rounded-lg p-4">
            <h2 className="font-semibold mb-3">Profile Overview</h2>
            
            {/* Address */}
            <div className="mb-3">
              <label className="block text-xs text-gray-400 mb-1">Wallet Address</label>
              <div className="flex items-center gap-2">
                <p className="font-mono text-xs bg-gray-800 p-2 rounded flex-1 break-all">
                  {currentAddress}
                </p>
                <button
                  onClick={() => copyToClipboard(currentAddress)}
                  className="text-gray-400 hover:text-white"
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
            </div>

            {/* XMTP Inbox ID */}
            {userData?.inboxId && (
              <div className="mb-3">
                <label className="block text-xs text-gray-400 mb-1">XMTP Inbox ID</label>
                <p className="font-mono text-xs bg-gray-800 p-2 rounded break-all">
                  {userData.inboxId}
                </p>
              </div>
            )}

            {/* Farcaster Profile */}
            {userData?.farcasterProfile && (
              <div className="mb-3">
                <label className="block text-xs text-gray-400 mb-1">Farcaster Profile</label>
                <div className="bg-gray-800 p-3 rounded">
                  <p className="font-semibold text-sm">
                    {userData.farcasterProfile.displayName || userData.farcasterProfile.username}
                  </p>
                  {userData.farcasterProfile.bio && (
                    <p className="text-xs text-gray-400 mt-1">
                      {userData.farcasterProfile.bio}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Identity Associations */}
          <div className="bg-gray-900 rounded-lg p-4">
            <h2 className="font-semibold mb-3">Identity Associations</h2>
            
            {/* Fkey.id */}
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-1">
                <label className="text-xs text-gray-400">Fkey.id</label>
                {fkeyUsername && (
                  <span className="text-xs bg-green-900 text-green-300 px-2 py-0.5 rounded">
                    CLAIMED
                  </span>
                )}
              </div>
              {fkeyUsername ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm bg-gray-800 p-2 rounded flex-1">
                    {fkeyUsername}.fkey.id
                  </span>
                  <a
                    href={`https://${fkeyUsername}.fkey.id`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300"
                  >
                    <ExternalLink size={16} />
                  </a>
                </div>
              ) : (
                <p className="text-xs text-gray-500">
                  Not configured - Set in Settings
                </p>
              )}
            </div>

            {/* Convos.org */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <label className="text-xs text-gray-400">Convos.org</label>
                {convosUsername && (
                  <span className="text-xs bg-blue-900 text-blue-300 px-2 py-0.5 rounded">
                    LINKED
                  </span>
                )}
              </div>
              {convosUsername ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm bg-gray-800 p-2 rounded flex-1">
                      {convosUsername}.convos.org
                    </span>
                    <a
                      href={`https://${convosUsername}.convos.org`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300"
                    >
                      <ExternalLink size={16} />
                    </a>
                  </div>
                  <button
                    onClick={() => setShowConvosChat(!showConvosChat)}
                    className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white py-2 px-3 rounded text-sm transition-colors"
                  >
                    <MessageCircle size={16} />
                    {showConvosChat ? 'Hide' : 'Show'} Convos Chat
                  </button>
                </div>
              ) : (
                <p className="text-xs text-gray-500">
                  Not configured - Set in Settings
                </p>
              )}
            </div>
          </div>

          {/* XMTP Status */}
          <div className="bg-gray-900 rounded-lg p-4">
            <h2 className="font-semibold mb-3">XMTP Status</h2>
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${client ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className={`text-sm ${client ? 'text-green-400' : 'text-red-400'}`}>
                {client ? 'Connected to XMTP' : 'Not connected to XMTP'}
              </span>
            </div>
            {client && (
              <div className="mt-3 text-xs text-gray-400 space-y-1">
                <p>• Messages are end-to-end encrypted</p>
                <p>• Conversations sync across devices</p>
                <p>• Privacy-first messaging protocol</p>
              </div>
            )}
          </div>

          {/* Convos Chat Integration */}
          {showConvosChat && convosUsername && userData?.inboxId && (
            <div className="bg-gray-900 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold">Convos Chat</h2>
                <button
                  onClick={() => setShowConvosChat(false)}
                  className="text-gray-400 hover:text-white"
                >
                  ×
                </button>
              </div>
              <ConvosChat 
                xmtpId={userData.inboxId}
                username={convosUsername}
                url={`https://${convosUsername}.convos.org`}
                profile={{
                  name: userData?.farcasterProfile?.displayName || convosUsername,
                  username: convosUsername,
                  description: userData?.farcasterProfile?.bio || null,
                  avatar: userData?.farcasterProfile?.pfpUrl || `https://api.dicebear.com/7.x/identicon/svg?seed=${convosUsername}`,
                  address: currentAddress
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 