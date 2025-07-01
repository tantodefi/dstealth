'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useEnsName, useEnsAvatar } from 'wagmi';
import { ArrowLeft, User, Settings, DollarSign, Eye, FileText, MessageCircle, Copy, Check, ExternalLink, Calendar } from 'lucide-react';
import Link from 'next/link';
import { isAddress } from 'viem';
import DaimoPayButton from '@/components/DaimoPayButton';
import ConvosChat from '@/components/ConvosChat';

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
}

export default function UserProfilePage() {
  const params = useParams();
  const usernameOrAddress = params.username as string;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  const [showConvosChat, setShowConvosChat] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  // Check if input is already an address
  const isEthAddress = isAddress(usernameOrAddress);
  const { data: ensName } = useEnsName({ 
    address: isEthAddress ? usernameOrAddress as `0x${string}` : undefined 
  });
  const { data: ensAvatar } = useEnsAvatar({ 
    name: ensName || (!isEthAddress ? usernameOrAddress : undefined)
  });

  // Resolve username/address to final address
  useEffect(() => {
    const resolveToAddress = async () => {
      if (isEthAddress) {
        setResolvedAddress(usernameOrAddress);
        return;
      }

      try {
        // Try different resolution methods for usernames
        
        // 1. Try ENS resolution
        try {
          const ensResponse = await fetch(`https://api.ensideas.com/ens/resolve/${usernameOrAddress}`);
          if (ensResponse.ok) {
            const ensData = await ensResponse.json();
            if (ensData.address) {
              setResolvedAddress(ensData.address);
              return;
            }
          }
        } catch (e) {
          console.warn('ENS resolution failed:', e);
        }

        // 2. Try Farcaster username lookup
        try {
          const farcasterResponse = await fetch(`/api/farcaster/search?q=${usernameOrAddress}`);
          if (farcasterResponse.ok) {
            const farcasterData = await farcasterResponse.json();
            if (farcasterData.users && farcasterData.users.length > 0) {
              const user = farcasterData.users.find((u: any) => 
                u.username.toLowerCase() === usernameOrAddress.toLowerCase()
              );
              if (user && user.verifications && user.verifications.length > 0) {
                setResolvedAddress(user.verifications[0]);
                return;
              }
            }
          }
        } catch (e) {
          console.warn('Farcaster resolution failed:', e);
        }

        // 3. Try basename lookup (check if ends with .base.eth)
        if (usernameOrAddress.endsWith('.base.eth')) {
          try {
            const baseResponse = await fetch(`https://api.basenames.org/v1/name/${usernameOrAddress}`);
            if (baseResponse.ok) {
              const baseData = await baseResponse.json();
              if (baseData.owner) {
                setResolvedAddress(baseData.owner);
                return;
              }
            }
          } catch (e) {
            console.warn('Basename resolution failed:', e);
          }
        }

        // 4. Check if it's a fkey.id username (try database lookup)
        try {
          const fkeyResponse = await fetch(`/api/fkey/lookup/${usernameOrAddress}`);
          if (fkeyResponse.ok) {
            const fkeyData = await fkeyResponse.json();
            if (fkeyData.success && fkeyData.user && fkeyData.user.address) {
              setResolvedAddress(fkeyData.user.address);
              return;
            }
          }
        } catch (e) {
          console.warn('fkey.id resolution failed:', e);
        }

        // 5. Check convos.org username
        try {
          const convosResponse = await fetch(`/api/convos/lookup/${usernameOrAddress}`);
          if (convosResponse.ok) {
            const convosData = await convosResponse.json();
            if (convosData.success && convosData.profile && convosData.profile.address) {
              setResolvedAddress(convosData.profile.address);
              return;
            }
          }
        } catch (e) {
          console.warn('Convos resolution failed:', e);
        }

        // If all resolution methods fail, treat as unknown
        console.warn('Could not resolve username to address:', usernameOrAddress);
        setError('Username not found');
        
      } catch (error) {
        console.error('Resolution error:', error);
        setError('Failed to resolve username');
      }
    };

    resolveToAddress();
  }, [usernameOrAddress, isEthAddress]);

  // Fetch user profile data
  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!resolvedAddress) return;

      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/user/profile/${resolvedAddress}`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.profile) {
            // Priority for avatar: Farcaster → ENS → Basename → ENS Avatar Service
            const avatar = data.profile.farcasterProfile?.avatar || 
                          ensAvatar || 
                          data.profile.avatar || 
                          `https://api.ensideas.com/v1/avatar/${resolvedAddress}`;

            // Priority for display name: Farcaster username → ENS → Basename → original input → address
            const displayName = data.profile.farcasterProfile?.username || 
                               data.profile.ensName || 
                               data.profile.baseName || 
                               (!isEthAddress ? usernameOrAddress : null) ||
                               `${resolvedAddress.slice(0, 6)}...${resolvedAddress.slice(-4)}`;

            const profileData: UserProfile = {
              address: resolvedAddress,
              username: displayName,
              bio: data.profile.bio || data.profile.farcasterProfile?.bio,
              avatar: avatar,
              ensName: data.profile.ensName,
              baseName: data.profile.baseName,
              farcasterProfile: data.profile.farcasterProfile,
              convosProfile: data.profile.convosProfile,
              fkeyProfile: data.profile.fkeyProfile,
              stats: {
                totalContent: data.profile.stats?.totalLinks || 0,
                totalEarnings: data.profile.stats?.totalEarnings?.toString() || '0.00',
                totalViews: data.profile.stats?.totalViews || 0,
                totalPurchases: data.profile.stats?.totalPurchases || 0,
                privacyScore: data.profile.stats?.privacyScore || 0,
                stealthActions: data.profile.stats?.stealthActions || 0,
              },
              content: data.profile.x402Links || [],
              joinedDate: data.profile.joinedDate || new Date().toISOString(),
            };
            setProfile(profileData);
          }
        } else if (response.status === 404) {
          setError('Profile not found or private');
        } else {
          setError('Failed to load profile');
        }
      } catch (err) {
        console.error('Error fetching user profile:', err);
        setError('Failed to load user profile');
      } finally {
        setLoading(false);
      }
    };

    fetchUserProfile();
  }, [resolvedAddress, ensName, ensAvatar, usernameOrAddress, isEthAddress]);

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

  // Loading state - exactly like main /user page
  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    );
  }

  // Error state - exactly like main /user page  
  if (error || !profile) {
    return (
      <div className="min-h-screen bg-black text-white">
        <div className="max-w-sm mx-auto">
          <div className="p-4">
            <Link 
              href="/user"
              className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-4"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Your Profile
            </Link>
            
            <h1 className="text-xl font-bold mb-4">Profile</h1>
            <div className="bg-gray-900 rounded-lg p-4">
              <p className="text-gray-400 text-sm">
                {error || 'Could not find a profile for this username or address.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Mini App Viewport Container - EXACTLY like main /user page */}
      <div className="max-w-sm mx-auto">
        <div className="p-4 space-y-4">
          {/* Back Navigation */}
          <Link 
            href="/user"
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Your Profile
          </Link>

          {/* Header - EXACTLY like main /user page */}
          <div className="mb-6">
            <div className="flex items-center gap-4 mb-4">
              <div>
                <h1 className="text-2xl font-bold">{profile.username}'s Profile</h1>
                <p className="text-gray-400 text-sm">
                  Web3 identity and content
                </p>
              </div>
            </div>
          </div>

          {/* Connected User Info - EXACTLY like main /user page */}
          <div className="bg-gray-900 rounded-lg p-4 mb-4">
            <div className="flex items-start gap-4">
              <div className="relative">
                {!avatarError && profile.avatar ? (
                  <img
                    src={profile.avatar}
                    alt={profile.username}
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
                  {profile.username}
                </h2>
                <p className="text-blue-300 text-sm font-mono">{profile.address.slice(0, 6)}...{profile.address.slice(-4)}</p>
                
                {/* Connection Status - EXACTLY like main /user page */}
                <div className="flex flex-wrap gap-2 mt-2">
                  {profile.ensName && (
                    <div className="bg-blue-900/30 border border-blue-600/30 rounded-lg px-2 py-1">
                      <span className="text-xs text-blue-300">{profile.ensName}</span>
                    </div>
                  )}
                  
                  {profile.baseName && (
                    <div className="bg-indigo-900/30 border border-indigo-600/30 rounded-lg px-2 py-1">
                      <span className="text-xs text-indigo-300">{profile.baseName}</span>
                    </div>
                  )}
                  
                  {profile.farcasterProfile && (
                    <div className="bg-purple-900/30 border border-purple-600/30 rounded-lg px-2 py-1">
                      <span className="text-xs text-purple-300">@{profile.farcasterProfile.username}</span>
                    </div>
                  )}
                  
                  {profile.fkeyProfile && (
                    <div className="bg-orange-900/30 border border-orange-600/30 rounded-lg px-2 py-1">
                      <span className="text-xs text-orange-300">{profile.fkeyProfile.username}.fkey.id</span>
                    </div>
                  )}
                  
                  {profile.convosProfile && (
                    <div className="bg-green-900/30 border border-green-600/30 rounded-lg px-2 py-1">
                      <span className="text-xs text-green-300">{profile.convosProfile.username}.convos.org</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {/* Bio */}
            {profile.bio && (
              <p className="text-gray-300 text-sm mt-3">{profile.bio}</p>
            )}
          </div>

          {/* Stats Grid - EXACTLY like main /user page */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-gray-900 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-4 w-4 text-purple-400" />
                <span className="text-sm text-gray-400">Content</span>
              </div>
              <div className="text-lg font-bold text-white">{profile.stats.totalContent}</div>
            </div>
            
            <div className="bg-gray-900 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="h-4 w-4 text-green-400" />
                <span className="text-sm text-gray-400">Earnings</span>
              </div>
              <div className="text-lg font-bold text-white">{profile.stats.totalEarnings} USDC</div>
            </div>
            
            <div className="bg-gray-900 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Eye className="h-4 w-4 text-blue-400" />
                <span className="text-sm text-gray-400">Privacy</span>
              </div>
              <div className="text-lg font-bold text-white">{profile.stats.privacyScore}/100</div>
            </div>
            
            <div className="bg-gray-900 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <Settings className="h-4 w-4 text-orange-400" />
                <span className="text-sm text-gray-400">Stealth</span>
              </div>
              <div className="text-lg font-bold text-white">{profile.stats.stealthActions}</div>
            </div>
          </div>

          {/* Pay / Message Privately - Primary action for fkey.id users */}
          {profile.fkeyProfile && (
            <div className="bg-gradient-to-r from-green-900/50 to-blue-900/50 border border-green-500/30 rounded-lg p-4 mb-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                  <DollarSign className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    Pay / msg {profile.fkeyProfile.username} privately
                  </h3>
                  <p className="text-green-200 text-sm">
                    {profile.fkeyProfile.username}.fkey.id • ZK stealth payments
                  </p>
                </div>
              </div>
              
              <p className="text-sm text-gray-300 mb-4">
                Send USDC payments with complete privacy using stealth addresses. Messages and payments are end-to-end encrypted.
              </p>
              
              <DaimoPayButton
                toAddress={profile.address as `0x${string}`}
                memo={`ZK Stealth Payment to ${profile.fkeyProfile.username}.fkey.id`}
                username={profile.fkeyProfile.username}
                metadata={{
                  fkeyId: `${profile.fkeyProfile.username}.fkey.id`,
                  recipientAddress: profile.address,
                  paymentType: 'zk_stealth_private',
                  source: 'dstealth_profile_page',
                }}
                onPaymentCompleted={(event) => {
                  console.log('ZK Stealth Payment completed to', profile.fkeyProfile?.username, event);
                }}
              />
              
              <div className="mt-3 pt-3 border-t border-green-500/20">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-green-300 flex items-center gap-1">
                    🔒 Stealth Address Protected
                  </span>
                  <span className="text-green-400">
                    💬 XMTP Messaging Available
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Convos Messaging */}
          {profile.convosProfile && (
            <div className="bg-gray-900 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-blue-400" />
                  Message on Convos.org
                </h3>
                <button
                  onClick={() => setShowConvosChat(!showConvosChat)}
                  className="text-sm bg-blue-600 hover:bg-blue-500 text-white py-1 px-3 rounded transition-colors"
                >
                  {showConvosChat ? 'Hide' : 'Chat'}
                </button>
              </div>
              
              {showConvosChat && (
                <ConvosChat
                  xmtpId={profile.convosProfile.xmtpId}
                  username={profile.convosProfile.username}
                  url={`https://${profile.convosProfile.username}.convos.org`}
                  profile={{
                    name: profile.convosProfile.name,
                    username: profile.convosProfile.username,
                    description: profile.convosProfile.bio,
                    avatar: profile.convosProfile.avatar || profile.avatar,
                    address: profile.address
                  }}
                />
              )}
            </div>
          )}

          {/* Available Content Links */}
          {profile.content.length > 0 && (
            <div className="bg-gray-900 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <FileText className="h-4 w-4 text-purple-400" />
                Available Content ({profile.content.length})
              </h3>
              
              <div className="space-y-3">
                {profile.content.map((item: any) => (
                  <div key={item.id} className="bg-gray-800 rounded-lg p-3 border border-gray-700 hover:border-purple-500/50 transition-colors">
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
                            <Calendar className="h-3 w-3" />
                            {formatDate(item.createdAt || new Date().toISOString())}
                          </span>
                          <span className="bg-purple-900/30 px-2 py-1 rounded">
                            article
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => copyToClipboard(`x402://base:${profile.address}/${item.id}`)}
                          className="text-gray-400 hover:text-white transition-colors"
                          title="Copy X402 URI"
                        >
                          {copied === `x402://base:${profile.address}/${item.id}` ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
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

          {/* Quick Actions - like main /user page */}
          <div className="bg-gray-900 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-white mb-3">Quick Actions</h3>
            <div className="space-y-2">
              <button 
                onClick={() => copyToClipboard(`${window.location.origin}/user/${usernameOrAddress}`)}
                className="w-full text-left bg-gray-800 hover:bg-gray-700 rounded-lg p-3 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Copy className="h-5 w-5 text-blue-400" />
                  <div>
                    <div className="text-white font-medium">Copy Profile URL</div>
                    <div className="text-gray-400 text-sm">Share this profile</div>
                  </div>
                </div>
              </button>
              
              {profile.fkeyProfile && (
                <a
                  href={`https://${profile.fkeyProfile.username}.fkey.id`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full text-left bg-gray-800 hover:bg-gray-700 rounded-lg p-3 transition-colors block"
                >
                  <div className="flex items-center gap-3">
                    <ExternalLink className="h-5 w-5 text-purple-400" />
                    <div>
                      <div className="text-white font-medium">Visit fkey.id Profile</div>
                      <div className="text-gray-400 text-sm">View on fkey.id</div>
                    </div>
                  </div>
                </a>
              )}
              
              {profile.convosProfile && (
                <a
                  href={`https://${profile.convosProfile.username}.convos.org`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full text-left bg-gray-800 hover:bg-gray-700 rounded-lg p-3 transition-colors block"
                >
                  <div className="flex items-center gap-3">
                    <MessageCircle className="h-5 w-5 text-green-400" />
                    <div>
                      <div className="text-white font-medium">Visit Convos Profile</div>
                      <div className="text-gray-400 text-sm">View on convos.org</div>
                    </div>
                  </div>
                </a>
              )}
            </div>
          </div>

          {/* Connection Details - EXACTLY like main /user page */}
          <div className="bg-gray-900 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-white mb-3">Connection Details</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Address:</span>
                <span className="text-white font-mono">{profile.address.slice(0, 8)}...{profile.address.slice(-6)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Joined:</span>
                <span className="text-white">{formatDate(profile.joinedDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Content Items:</span>
                <span className="text-white">{profile.stats.totalContent}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Total Views:</span>
                <span className="text-white">{profile.stats.totalViews}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Privacy Score:</span>
                <span className="text-white">{profile.stats.privacyScore}/100</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 