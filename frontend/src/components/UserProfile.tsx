"use client";

import { useState, useEffect } from "react";
import { useAccount, useEnsName, useEnsAvatar } from 'wagmi';
import { Button } from "@/components/Button";
import { ExternalLink, Link as LinkIcon, Eye, Copy, Share, DollarSign, FileText, Shield } from 'lucide-react';
import NotificationModal from './NotificationModal';
import Link from 'next/link';
import type { ZKReceipt } from './ZKReceiptCard';
import { database } from '@/lib/database';
import dynamic from 'next/dynamic';

const ZKReceiptCard = dynamic(() => import('./ZKReceiptCard'), { ssr: false });

interface NotificationState {
  isOpen: boolean;
  type: 'success' | 'error' | 'loading';
  title: string;
  message: string;
}

interface X402Link {
  id: string;
  title: string;
  description: string;
  price: string | number;
  currency: string;
  linkType: string;
  viewCount: number;
  x402Uri: string;
  url?: string;
  proxy402Url?: string;
  createdAt?: string;
}

interface UserStats {
  totalEarnings: number;
  totalLinks: number;
  privacyScore: number;
  stealthActions: number;
}

interface FarcasterProfile {
  fid: string;
  username: string;
  displayName?: string;
  bio?: string;
  avatar?: string;
}

interface ConvosProfile {
  username: string;
  name: string;
  bio?: string;
  avatar?: string;
  xmtpId: string;
  turnkeyAddress?: string;
}

interface FkeyProfile {
  username: string;
  address: string;
  isRegistered: boolean;
}

interface UserProfileProps {
  address?: string; // For viewing other user's profiles at u/[address]
  viewOnly?: boolean; // True when viewing someone else's profile
}

interface UserData {
  username: string;
  bio?: string;
  avatar?: string;
  stats: UserStats;
  x402Links: X402Link[];
  ensName?: string;
  ensAvatar?: string;
  baseName?: string;
  farcasterProfile?: FarcasterProfile;
  convosProfile?: ConvosProfile;
  fkeyProfile?: FkeyProfile;
  zkReceipts: ZKReceipt[];
  proxy402Urls: string[];
  address: string;
}

export default function UserProfile({ address: propAddress, viewOnly = false }: UserProfileProps) {
  const { address: connectedAddress, isConnected } = useAccount();
  
  // Use prop address for viewing others, connected address for own profile
  const targetAddress = propAddress || connectedAddress;
  const isOwnProfile = !viewOnly && targetAddress === connectedAddress;
  
  // ENS hooks for the target address
  const { data: ensName } = useEnsName({ address: targetAddress as `0x${string}` });
  const { data: ensAvatar } = useEnsAvatar({ name: ensName! });
  
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedLink, setSelectedLink] = useState<UserData['x402Links'][0] | null>(null);
  const [showViewer, setShowViewer] = useState(false);
  const [viewerUrl, setViewerUrl] = useState('');
  const [notification, setNotification] = useState<NotificationState>({
    isOpen: false,
    type: 'success',
    title: '',
    message: ''
  });

  // Load real user data from working APIs
  useEffect(() => {
    const loadUserData = async () => {
      if (!targetAddress) {
        setLoading(false);
        return;
      }

      setLoading(true);
      
      try {
        // Initialize with basic data
        let userData: Partial<UserData> = {
          username: ensName || `${targetAddress.slice(0, 6)}...${targetAddress.slice(-4)}`,
          bio: "Web3 enthusiast",
          avatar: ensAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${targetAddress}`,
          stats: {
            totalEarnings: 0,
            totalLinks: 0,
            privacyScore: 85,
            stealthActions: 12
          },
          x402Links: [],
          zkReceipts: [],
          ensName: ensName || undefined,
          ensAvatar: ensAvatar || undefined,
          proxy402Urls: [],
          address: targetAddress
        };

        // Get Base name using Basename API
        try {
          const baseNameRes = await fetch(`https://api.basename.app/v1/names?address=${targetAddress}`);
          if (baseNameRes.ok) {
            const baseNameData = await baseNameRes.json();
            if (baseNameData.length > 0) {
              userData.baseName = baseNameData[0].name;
            }
          }
        } catch (error) {
          console.warn('Failed to fetch Base name:', error);
        }

        // Load Farcaster data from Neynar API
        try {
          const farcasterRes = await fetch(`/api/farcaster/user-by-verification?address=${targetAddress}`);
          if (farcasterRes.ok) {
            const farcasterData = await farcasterRes.json();
            if (farcasterData.users && farcasterData.users.length > 0) {
              const farcasterUser = farcasterData.users[0];
              userData = {
                ...userData,
                username: farcasterUser.username || userData.username,
                bio: farcasterUser.profile?.bio?.text || userData.bio,
                avatar: farcasterUser.pfp_url || userData.avatar,
                farcasterProfile: {
                  fid: farcasterUser.fid,
                  username: farcasterUser.username,
                  displayName: farcasterUser.display_name,
                  bio: farcasterUser.profile?.bio?.text,
                  avatar: farcasterUser.pfp_url
                }
              };
            }
          }
        } catch (error) {
          console.warn('Failed to fetch Farcaster data:', error);
        }

        // Try to find fkey.id for this address by searching common username patterns
        try {
          const possibleUsernames = [
            userData.farcasterProfile?.username,
            userData.ensName?.replace('.eth', ''),
            userData.baseName?.replace('.base.eth', ''),
            targetAddress.slice(2, 8) // First 6 chars of address
          ].filter(Boolean);

          for (const username of possibleUsernames) {
            try {
              const fkeyRes = await fetch(`/api/fkey/lookup/${username}`);
              if (fkeyRes.ok) {
                const fkeyData = await fkeyRes.json();
                if (fkeyData.isRegistered && fkeyData.address?.toLowerCase() === targetAddress.toLowerCase()) {
                  userData.fkeyProfile = {
                    username: username!,
                    address: fkeyData.address,
                    isRegistered: true
                  };
                  break;
                }
              }
            } catch (error) {
              console.warn(`Failed to check fkey ${username}:`, error);
            }
          }
        } catch (error) {
          console.warn('Failed to search for fkey.id:', error);
        }

        // Try to find convos.org profile similarly
        try {
          const possibleUsernames = [
            userData.farcasterProfile?.username,
            userData.ensName?.replace('.eth', ''),
            userData.baseName?.replace('.base.eth', ''),
            userData.fkeyProfile?.username
          ].filter(Boolean);

          for (const username of possibleUsernames) {
            try {
              const convosRes = await fetch(`/api/convos/lookup/${username}`);
              if (convosRes.ok) {
                const convosData = await convosRes.json();
                if (convosData.success && convosData.profile) {
                  userData.convosProfile = {
                    username: username!,
                    name: convosData.profile.name,
                    bio: convosData.profile.description,
                    avatar: convosData.profile.avatar,
                    xmtpId: convosData.xmtpId,
                    turnkeyAddress: convosData.profile.address
                  };
                  break;
                }
              }
            } catch (error) {
              console.warn(`Failed to check convos ${username}:`, error);
            }
          }
        } catch (error) {
          console.warn('Failed to search for convos.org:', error);
        }

        // Load x402 content proxy URLs from JWT/localStorage (only for own profile)
        if (isOwnProfile) {
          try {
            const storedJWT = localStorage.getItem('x402_jwt');
            if (storedJWT) {
              const jwtPayload = JSON.parse(atob(storedJWT.split('.')[1]));
              if (jwtPayload.proxy402Urls) {
                userData.proxy402Urls = jwtPayload.proxy402Urls;
              }
            }
          } catch (error) {
            console.warn('Failed to load proxy402 URLs from JWT:', error);
          }
        }

        // Generate x402 links based on user's identity
        userData.x402Links = generateUserLinks(targetAddress, userData);
        if (userData.stats) {
          userData.stats.totalLinks = userData.x402Links.length;
          userData.stats.totalEarnings = userData.x402Links.reduce((sum, link) => sum + Number(link.price), 0);
        }

        // Generate demo ZK receipts (only for own profile)
        if (isOwnProfile) {
          userData.zkReceipts = [{
            id: '1',
            timestamp: new Date().toISOString(),
            transactionHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
            farcasterFid: userData.farcasterProfile?.username || targetAddress,
            convosId: userData.convosProfile?.username || targetAddress.slice(0, 8),
            proofType: 'farcaster',
            status: 'verified',
            metadata: {
              title: 'Identity Verification',
              description: 'Zero-knowledge proof of account ownership',
              amount: '0.01',
              currency: 'ETH'
            }
          }];
        }

        setUserData(userData as UserData);
      } catch (error) {
        console.error('Failed to load user data:', error);
        // Create fallback data
        const fallbackData: UserData = {
          username: ensName || `${targetAddress.slice(0, 6)}...${targetAddress.slice(-4)}`,
          bio: "Web3 enthusiast",
          avatar: ensAvatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${targetAddress}`,
          stats: {
            totalEarnings: 0,
            totalLinks: 0,
            privacyScore: 85,
            stealthActions: 12
          },
          x402Links: generateUserLinks(targetAddress, {}),
          zkReceipts: [],
          ensName: ensName || undefined,
          ensAvatar: ensAvatar || undefined,
          proxy402Urls: [],
          address: targetAddress
        };
        setUserData(fallbackData);
      } finally {
        setLoading(false);
      }
    };

    loadUserData();
  }, [targetAddress, ensName, ensAvatar, isOwnProfile]);

  // Generate X402 links based on user's actual data
  const generateUserLinks = (address: string, userData: Partial<UserData>): X402Link[] => {
    const identity = userData.farcasterProfile?.username || userData.ensName || userData.baseName || address.slice(0, 8);
    
    const baseLinks: X402Link[] = [
      {
        id: '1',
        title: `🚀 ${identity}'s Trading Strategy`,
        description: 'Proven DeFi trading methodology with documented results',
        price: 25.00,
        currency: 'USDC',
        linkType: 'document',
        viewCount: 0,
        x402Uri: `x402://pay/${address}/trading-strategy`,
        url: `x402://pay/${address}/trading-strategy?price=25&currency=USDC`,
        proxy402Url: `${typeof window !== 'undefined' ? window.location.origin : ''}/viewer?url=x402://pay/${address}/trading-strategy`,
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      },
      {
        id: '2', 
        title: `📊 ${identity}'s Market Analysis`,
        description: 'In-depth crypto market analysis with actionable insights',
        price: 10.00,
        currency: 'USDC',
        linkType: 'document',
        viewCount: 0,
        x402Uri: `x402://pay/${address}/market-analysis`,
        url: `x402://pay/${address}/market-analysis?price=10&currency=USDC`,
        proxy402Url: `${typeof window !== 'undefined' ? window.location.origin : ''}/viewer?url=x402://pay/${address}/market-analysis`,
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      }
    ];

    return baseLinks;
  };

  const handlePayment = async (link: UserData['x402Links'][0]) => {
    if (!isConnected) {
      setNotification({
        isOpen: true,
        type: 'error',
        title: 'Wallet Required',
        message: 'Please connect your wallet to purchase content.'
      });
      return;
    }

    setSelectedLink(link);
    setShowPaymentModal(true);
  };

  const handleViewContent = async (link: X402Link) => {
    try {
      // Attempt to view content
      const response = await fetch(`/api/content/view?uri=${encodeURIComponent(link.x402Uri)}`);
      if (!response.ok) throw new Error('Failed to access content');
      
      const data = await response.json();
      
      if (data.requiresPayment) {
        setNotification({
          isOpen: true,
          type: 'error',
          title: 'Payment Required',
          message: 'This content requires payment to access.'
        });
        handlePayment(link);
      } else {
        setViewerUrl(link.proxy402Url || link.url || link.x402Uri);
        setShowViewer(true);
      }
    } catch (error) {
      console.error('Error viewing content:', error);
      setNotification({
        isOpen: true,
        type: 'error',
        title: 'Access Failed',
        message: 'Failed to access content. Please try again.'
      });
    }
  };

  const copyLink = (uri: string) => {
    navigator.clipboard.writeText(uri);
    setNotification({
      isOpen: true,
      type: 'success',
      title: 'Copied!',
      message: 'Link copied to clipboard'
    });
  };

  const shareProfile = async () => {
    if (navigator.share && targetAddress) {
      try {
        await navigator.share({
          title: `${userData?.username}'s Profile`,
          text: `Check out ${userData?.username}'s X402 profile`,
          url: `${window.location.origin}/u/${targetAddress}`
        });
      } catch (error) {
        copyLink(`${window.location.origin}/u/${targetAddress}`);
      }
    } else if (targetAddress) {
      copyLink(`${window.location.origin}/u/${targetAddress}`);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-md mx-auto p-4 mobile-scroll hide-scrollbar min-h-screen">
        <div className="flex flex-col items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
          <span className="text-gray-400">Loading profile...</span>
        </div>
      </div>
    );
  }

  if (!targetAddress) {
    return (
      <div className="space-y-6 max-w-md mx-auto p-4 mobile-scroll hide-scrollbar min-h-screen">
        <div className="text-center py-12">
          <p className="text-gray-400">No profile data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-md mx-auto p-4 mobile-scroll hide-scrollbar min-h-screen">
      {/* Profile Header */}
      <div className="bg-gradient-to-r from-blue-900/20 to-purple-900/20 border border-blue-600/30 rounded-lg p-4">
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <img
                src={userData?.avatar}
                alt={userData?.username}
                className="w-16 h-16 rounded-full border-2 border-blue-400"
              />
            </div>
            
            <div className="flex-1 min-w-0">
              {/* Identity Section */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg font-bold text-white truncate">
                    {userData?.username}
                  </h1>
                  {isOwnProfile && (
                    <span className="bg-green-600/20 text-green-400 text-xs px-2 py-1 rounded-full border border-green-600/30 flex-shrink-0">
                      Your Profile
                    </span>
                  )}
                </div>

                {/* Identity Stack */}
                <div className="space-y-1 text-sm">
                  {userData?.farcasterProfile?.username && (
                    <div className="flex items-center gap-2">
                      <span className="text-purple-400 truncate">@{userData.farcasterProfile!.username}</span>
                      <ExternalLink 
                        className="h-3 w-3 cursor-pointer hover:text-purple-400 flex-shrink-0"
                        onClick={() => window.open(`https://warpcast.com/${userData.farcasterProfile!.username}`, '_blank')}
                      />
                    </div>
                  )}
                  
                  {userData?.ensName && (
                    <div className="flex items-center gap-2">
                      <span className="text-blue-400 truncate">{userData.ensName}</span>
                      <ExternalLink 
                        className="h-3 w-3 cursor-pointer hover:text-blue-400 flex-shrink-0"
                        onClick={() => window.open(`https://app.ens.domains/name/${userData.ensName}`, '_blank')}
                      />
                    </div>
                  )}

                  {userData?.baseName && (
                    <div className="flex items-center gap-2">
                      <span className="text-blue-300 truncate">{userData.baseName}</span>
                      <ExternalLink 
                        className="h-3 w-3 cursor-pointer hover:text-blue-300 flex-shrink-0"
                        onClick={() => window.open(`https://www.base.org/name/${userData.baseName}`, '_blank')}
                      />
                    </div>
                  )}

                  {userData?.fkeyProfile?.username && (
                    <div className="flex items-center gap-2">
                      <span className="text-green-400 truncate">{userData.fkeyProfile!.username}.fkey.id</span>
                      <ExternalLink 
                        className="h-3 w-3 cursor-pointer hover:text-green-400 flex-shrink-0"
                        onClick={() => window.open(`https://${userData.fkeyProfile!.username}.fkey.id`, '_blank')}
                      />
                    </div>
                  )}

                  {userData?.convosProfile?.username && (
                    <div className="flex items-center gap-2">
                      <span className="text-yellow-400 truncate">{userData.convosProfile!.username}.convos.org</span>
                      <ExternalLink 
                        className="h-3 w-3 cursor-pointer hover:text-yellow-400 flex-shrink-0"
                        onClick={() => window.open(`https://${userData.convosProfile!.username}.convos.org`, '_blank')}
                      />
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-xs text-gray-400 font-mono">
                    <span className="truncate">{targetAddress}</span>
                    <Copy 
                      className="h-3 w-3 cursor-pointer hover:text-blue-400 transition-colors flex-shrink-0"
                      onClick={() => copyLink(targetAddress!)}
                    />
                  </div>
                </div>
              </div>

              {/* Bio */}
              {userData?.bio && (
                <p className="text-gray-300 text-sm mt-2">{userData.bio}</p>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              onClick={shareProfile}
              className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 text-sm px-3 py-2"
            >
              <Share className="h-3 w-3" />
              Share
            </Button>
            {userData?.farcasterProfile?.username && (
              <Button
                onClick={() => window.open(`https://warpcast.com/${userData.farcasterProfile!.username}`, '_blank')}
                className="bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-2 text-sm px-3 py-2"
              >
                <ExternalLink className="h-3 w-3" />
                Warpcast
              </Button>
            )}
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-800/50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="h-3 w-3 text-green-400" />
                <span className="text-xs text-gray-400">Earnings</span>
              </div>
              <div className="text-lg font-bold text-green-400">
                ${userData?.stats.totalEarnings.toFixed(2)}
              </div>
            </div>
            
            <div className="bg-gray-800/50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <LinkIcon className="h-3 w-3 text-blue-400" />
                <span className="text-xs text-gray-400">X402 Links</span>
              </div>
              <div className="text-lg font-bold text-blue-400">
                {userData?.stats.totalLinks}
              </div>
            </div>
            
            <div className="bg-gray-800/50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Shield className="h-3 w-3 text-purple-400" />
                <span className="text-xs text-gray-400">Privacy</span>
              </div>
              <div className="text-lg font-bold text-purple-400">
                {userData?.stats.privacyScore}
              </div>
            </div>
            
            <div className="bg-gray-800/50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Eye className="h-3 w-3 text-yellow-400" />
                <span className="text-xs text-gray-400">Stealth</span>
              </div>
              <div className="text-lg font-bold text-yellow-400">
                {userData?.stats.stealthActions}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content Sections */}
      <div className="space-y-6">
        {/* X402 Links */}
        {userData?.x402Links && userData.x402Links.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <LinkIcon className="h-5 w-5 text-blue-400" />
              X402 Links
            </h2>
            <div className="grid grid-cols-1 gap-4">
              {userData.x402Links.map((link) => (
                <div
                  key={link.id}
                  className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 hover:border-blue-500/50 transition-colors"
                >
                  <h3 className="text-lg font-semibold text-white mb-2">{link.title}</h3>
                  <p className="text-gray-400 text-sm mb-4">{link.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-green-400 font-semibold">${link.price} {link.currency}</span>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => handleViewContent(link)}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        {viewOnly ? 'Buy' : 'View'}
                      </Button>
                      <Button
                        onClick={() => copyLink(link.x402Uri)}
                        className="bg-gray-700 hover:bg-gray-600"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Proxy402 URLs - Only show for own profile */}
        {isOwnProfile && userData?.proxy402Urls && userData.proxy402Urls.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Shield className="h-5 w-5 text-green-400" />
              Proxy402 URLs
            </h2>
            <div className="space-y-2">
              {userData.proxy402Urls.map((url, index) => (
                <div
                  key={index}
                  className="bg-gray-800/50 border border-gray-700 rounded-lg p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-green-400 text-sm font-mono truncate">{url}</span>
                    <Button
                      onClick={() => copyLink(url)}
                      className="bg-gray-700 hover:bg-gray-600 p-1"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ZK Receipts - Only show for own profile */}
        {isOwnProfile && userData?.zkReceipts && userData.zkReceipts.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Shield className="h-5 w-5 text-purple-400" />
              ZK Receipts
            </h2>
            <div className="space-y-4">
              {userData.zkReceipts.map((receipt) => (
                <ZKReceiptCard key={receipt.id} receipt={receipt} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom padding for mobile scroll */}
      <div className="pb-24"></div>

      {/* Modals */}
      <NotificationModal
        isOpen={notification.isOpen}
        onClose={() => setNotification({ ...notification, isOpen: false })}
        type={notification.type}
        title={notification.title}
        message={notification.message}
      />
    </div>
  );
} 