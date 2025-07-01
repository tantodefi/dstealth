'use client';

import { useXMTP } from '@/context/xmtp-context';
import { useAccount, useEnsName, useEnsAvatar } from 'wagmi';
import { useState, useEffect } from 'react';
import ProfileMenu from '@/components/ProfileMenu';
import { User, Settings, DollarSign, Eye, FileText, Calendar, ExternalLink, Copy, Check } from 'lucide-react';
import { database } from '@/lib/database';


interface UserProfile {
  address: string;
  username: string;
  avatar?: string;
  bio?: string;
  ensName?: string;
  baseName?: string;
  farcasterProfile?: {
    fid: string;
    username: string;
    displayName?: string;
    bio?: string;
    avatar?: string;
    followerCount?: number;
    followingCount?: number;
  };
  convosProfile?: {
    username: string;
    name: string;
    bio?: string;
    avatar?: string;
    xmtpId: string;
  };
  fkeyProfile?: {
    username: string;
    address: string;
    isRegistered: boolean;
  };
  stats: {
    totalContent: number;
    totalEarnings: string;
    totalViews: number;
    totalPurchases: number;
    privacyScore: number;
    stealthActions: number;
  };
  content: any[];
  joinedDate: string;
  isDstealthUser: boolean;
}

export default function UserPage() {
  const { client, isInFarcasterContext, farcasterUser } = useXMTP();
  const { address } = useAccount();
  const [mounted, setMounted] = useState(false);
  const [profileData, setProfileData] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [avatarError, setAvatarError] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // Handle mounting
  useEffect(() => {
    setMounted(true);
  }, []);

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

  // Fetch real profile data from API
  useEffect(() => {
    const fetchProfileData = async () => {
      if (!currentAddress) return;

      try {
        setLoading(true);
        
        // Fetch full profile data (includePrivate=true for own profile)
        const response = await fetch(`/api/user/profile/${currentAddress}?includePrivate=true`);
        
        if (response.ok) {
          // Check if response is actually JSON
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            if (data.success && data.profile) {
              setProfileData(data.profile);
            } else {
              throw new Error('Invalid profile data structure');
            }
          } else {
            throw new Error('API returned non-JSON response');
          }
        } else {
          throw new Error('Failed to fetch profile');
        }
      } catch (error) {
        console.error('Error fetching profile data:', error);
        
        // Fallback to local database data
        const localUser = database.getUser(currentAddress);
        const localStats = database.calculateUserStats(currentAddress);
        const localLinks = database.getUserX402Links(currentAddress);
        
        const fallbackProfile: UserProfile = {
          address: currentAddress,
          username: localUser?.ensName || `${currentAddress.slice(0, 6)}...${currentAddress.slice(-4)}`,
          avatar: localUser?.avatar || `https://api.ensideas.com/v1/avatar/${currentAddress}`,
          bio: localUser?.bio,
          ensName: localUser?.ensName,
          stats: {
            totalContent: localLinks.length,
            totalEarnings: localStats.totalEarnings.toFixed(2),
            totalViews: localStats.totalViews,
            totalPurchases: localStats.totalPurchases,
            privacyScore: localStats.privacyScore,
            stealthActions: localStats.stealthActions,
          },
          content: localLinks,
          joinedDate: localUser?.createdAt || new Date().toISOString(),
          isDstealthUser: !!localUser,
        };
        
        if (localUser?.fkeyId) {
          fallbackProfile.fkeyProfile = {
            username: localUser.fkeyId,
            address: currentAddress,
            isRegistered: true,
          };
        }
        
        setProfileData(fallbackProfile);
      } finally {
        setLoading(false);
      }
    };

    fetchProfileData();
  }, [currentAddress]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied(null), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
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
      <div className="min-h-screen bg-black text-white">
        <div className="max-w-sm mx-auto">
          <div className="p-4">
            <h1 className="text-xl font-bold mb-4">Profile</h1>
            <div className="bg-gray-900 rounded-lg p-4">
              <p className="text-gray-400 text-sm">
                Please connect your wallet to view your profile.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
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
              <div>
                <h1 className="text-2xl font-bold">Your Profile</h1>
                <p className="text-gray-400 text-sm">
                  Your XMTP and Web3 identity
                </p>
              </div>
            </div>
          </div>

          {/* Connected User Info */}
          <div className="bg-gray-900 rounded-lg p-4 mb-4">
            <div className="flex items-start gap-4">
              <div className="relative">
                {!avatarError && profileData?.avatar ? (
                  <img
                    src={profileData.avatar}
                    alt={profileData.username}
                    className="w-16 h-16 rounded-full border-2 border-gray-700"
                    onError={() => setAvatarError(true)}
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 flex items-center justify-center border-2 border-gray-700">
                    <User className="h-8 w-8 text-white" />
                  </div>
                )}
                <div className="absolute -bottom-1 -right-1 bg-green-500 w-4 h-4 rounded-full border-2 border-gray-900"></div>
              </div>
              
              <div className="flex-1">
                <h2 className="text-xl font-bold text-white mb-1">
                  {profileData?.username || `${currentAddress.slice(0, 6)}...${currentAddress.slice(-4)}`}
                </h2>
                <p className="text-blue-300 text-sm font-mono">{currentAddress.slice(0, 6)}...{currentAddress.slice(-4)}</p>
                
                {/* Connection Status */}
                <div className="flex flex-wrap gap-2 mt-2">
                  <div className="bg-green-900/30 border border-green-600/30 rounded-lg px-2 py-1">
                    <span className="text-xs text-green-300">Wallet Connected</span>
                  </div>
                  
                  {client && (
                    <div className="bg-blue-900/30 border border-blue-600/30 rounded-lg px-2 py-1">
                      <span className="text-xs text-blue-300">XMTP Active</span>
                    </div>
                  )}
                  
                  {isInFarcasterContext && (
                    <div className="bg-purple-900/30 border border-purple-600/30 rounded-lg px-2 py-1">
                      <span className="text-xs text-purple-300">Farcaster Context</span>
                    </div>
                  )}
                  
                  {profileData?.ensName && (
                    <div className="bg-blue-900/30 border border-blue-600/30 rounded-lg px-2 py-1">
                      <span className="text-xs text-blue-300">{profileData.ensName}</span>
                    </div>
                  )}
                  
                  {profileData?.baseName && (
                    <div className="bg-indigo-900/30 border border-indigo-600/30 rounded-lg px-2 py-1">
                      <span className="text-xs text-indigo-300">{profileData.baseName}</span>
                    </div>
                  )}
                  
                  {profileData?.farcasterProfile && (
                    <div className="bg-purple-900/30 border border-purple-600/30 rounded-lg px-2 py-1">
                      <span className="text-xs text-purple-300">@{profileData.farcasterProfile.username}</span>
                    </div>
                  )}
                  
                  {profileData?.fkeyProfile && (
                    <div className="bg-orange-900/30 border border-orange-600/30 rounded-lg px-2 py-1">
                      <span className="text-xs text-orange-300">{profileData.fkeyProfile.username}.fkey.id</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {/* Bio */}
            {profileData?.bio && (
              <p className="text-gray-300 text-sm mt-3">{profileData.bio}</p>
            )}
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-gray-900 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-4 w-4 text-purple-400" />
                <span className="text-sm text-gray-400">Content</span>
              </div>
              <div className="text-lg font-bold text-white">{profileData?.stats.totalContent || 0}</div>
            </div>
            
            <div className="bg-gray-900 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="h-4 w-4 text-green-400" />
                <span className="text-sm text-gray-400">Earnings</span>
              </div>
              <div className="text-lg font-bold text-white">{profileData?.stats.totalEarnings || 0} USDC</div>
            </div>
            
            <div className="bg-gray-900 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Eye className="h-4 w-4 text-blue-400" />
                <span className="text-sm text-gray-400">Privacy</span>
              </div>
              <div className="text-lg font-bold text-white">{profileData?.stats.privacyScore || 0}/100</div>
            </div>
            
            <div className="bg-gray-900 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Settings className="h-4 w-4 text-orange-400" />
                <span className="text-sm text-gray-400">Stealth</span>
              </div>
              <div className="text-lg font-bold text-white">{profileData?.stats.stealthActions || 0}</div>
            </div>
          </div>

          {/* Pay / Message Privately - Show when user has fkey.id */}
          {profileData?.fkeyProfile && (
            <div className="bg-gradient-to-r from-green-900/50 to-blue-900/50 border border-green-500/30 rounded-lg p-4 mb-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                  <DollarSign className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    Accept payments privately
                  </h3>
                  <p className="text-green-200 text-sm">
                    {profileData.fkeyProfile.username}.fkey.id • ZK stealth payments enabled
                  </p>
                </div>
              </div>
              
              <p className="text-sm text-gray-300 mb-4">
                Your fkey.id is ready to receive private USDC payments. Share your profile URL to let others pay / msg you privately using stealth addresses.
              </p>
              
              <div className="bg-gray-800/50 rounded-lg p-3 mb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-white font-medium text-sm">Your Payment Profile</div>
                    <div className="text-gray-400 text-xs font-mono">
                      dstealth.app/user/{profileData.fkeyProfile.username}
                    </div>
                  </div>
                  <button
                    onClick={() => copyToClipboard(`${window.location.origin}/user/${profileData.fkeyProfile.username}`)}
                    className="text-gray-400 hover:text-white transition-colors"
                    title="Copy profile URL"
                  >
                    {copied === `${window.location.origin}/user/${profileData.fkeyProfile.username}` ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              
              <div className="mt-3 pt-3 border-t border-green-500/20">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-green-300 flex items-center gap-1">
                    🔒 Stealth Address Protected
                  </span>
                  <span className="text-green-400">
                    💬 XMTP Messaging Enabled
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Real X402 Content */}
          {profileData?.content && profileData.content.length > 0 && (
            <div className="bg-gray-900 rounded-lg p-4 mb-4">
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <FileText className="h-4 w-4 text-purple-400" />
                Your X402 Content ({profileData.content.length})
              </h3>
              
              <div className="space-y-3">
                {profileData.content.slice(0, 3).map((item: any) => (
                  <div key={item.id} className="bg-gray-800 rounded-lg p-3 border border-gray-700">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium text-white text-sm mb-1">{item.title}</h4>
                        <p className="text-gray-300 text-xs mb-2">{item.description}</p>
                        <div className="flex items-center gap-3 text-xs text-gray-400">
                          <span className="flex items-center gap-1">
                            <DollarSign className="h-3 w-3" />
                            {item.price || '0.00'} USDC
                          </span>
                          <span className="flex items-center gap-1">
                            <Eye className="h-3 w-3" />
                            {item.viewCount || 0} views
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => copyToClipboard(`x402://base:${currentAddress}/${item.id}`)}
                          className="text-gray-400 hover:text-white transition-colors"
                          title="Copy X402 URI"
                        >
                          {copied === `x402://base:${currentAddress}/${item.id}` ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </button>
                        <a
                          href={`/api/x402/frame/${item.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-purple-400 hover:text-purple-300 transition-colors"
                          title="View content"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Profile Menu with Settings */}
          <ProfileMenu />

          {/* Quick Actions */}
          <div className="bg-gray-900 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-white mb-3">Quick Actions</h3>
            <div className="space-y-2">
              <button className="w-full text-left bg-gray-800 hover:bg-gray-700 rounded-lg p-3 transition-colors">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-purple-400" />
                  <div>
                    <div className="text-white font-medium">Create X402 Content</div>
                    <div className="text-gray-400 text-sm">Share premium content</div>
                  </div>
                </div>
              </button>
              
              <button className="w-full text-left bg-gray-800 hover:bg-gray-700 rounded-lg p-3 transition-colors">
                <div className="flex items-center gap-3">
                  <DollarSign className="h-5 w-5 text-green-400" />
                  <div>
                    <div className="text-white font-medium">Send Payment</div>
                    <div className="text-gray-400 text-sm">Transfer USDC privately</div>
                  </div>
                </div>
              </button>
              
              <button className="w-full text-left bg-gray-800 hover:bg-gray-700 rounded-lg p-3 transition-colors">
                <div className="flex items-center gap-3">
                  <Eye className="h-5 w-5 text-blue-400" />
                  <div>
                    <div className="text-white font-medium">View Analytics</div>
                    <div className="text-gray-400 text-sm">Track your performance</div>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Connection Info */}
          <div className="bg-gray-900 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-white mb-3">Connection Details</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Address:</span>
                <span className="text-white font-mono">{currentAddress.slice(0, 8)}...{currentAddress.slice(-6)}</span>
              </div>
              
              {client && (
                <>
                  <div className="flex justify-between">
                    <span className="text-gray-400">XMTP Inbox:</span>
                    <span className="text-white">{client.inboxId?.slice(0, 8)}...</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-gray-400">Installation:</span>
                    <span className="text-white">{client.installationId?.slice(0, 8)}...</span>
                  </div>
                </>
              )}
              
              <div className="flex justify-between">
                <span className="text-gray-400">Environment:</span>
                <span className="text-white">
                  {process.env.NEXT_PUBLIC_XMTP_ENV || 'dev'}
                </span>
              </div>
              
              {isInFarcasterContext && farcasterUser && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Farcaster FID:</span>
                  <span className="text-white">{farcasterUser.fid}</span>
                </div>
              )}
              
              {profileData?.joinedDate && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Joined:</span>
                  <span className="text-white">{formatDate(profileData.joinedDate)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 