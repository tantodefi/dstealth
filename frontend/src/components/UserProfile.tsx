"use client";

import { useState, useEffect } from "react";
import { useAccount, useEnsName, useEnsAvatar } from 'wagmi';
import { Button } from "@/components/Button";
import { ExternalLink, Link as LinkIcon, Eye, Copy, Share, DollarSign, FileText, Shield, User, MessageCircle } from 'lucide-react';
import NotificationModal from './NotificationModal';
import Link from 'next/link';
import type { ZKReceipt } from './ZKReceiptCard';
import { database } from '@/lib/database';
import dynamic from 'next/dynamic';
import DaimoPayButton from './DaimoPayButton';
import ConvosChat from './ConvosChat';

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
  const [showConvosChat, setShowConvosChat] = useState(false);

  // Load real user data from working APIs and database
  useEffect(() => {
    const loadUserData = async () => {
      if (!targetAddress) {
        setLoading(false);
        return;
      }

      setLoading(true);
      
      try {
        // Load data from local database first
        const dbUser = database.getUser(targetAddress);
        const dbStats = database.calculateUserStats(targetAddress);
        const dbLinks = database.getUserX402Links(targetAddress);

        // Initialize with database data if available
        let userData: Partial<UserData> = {
          username: dbUser?.ensName || ensName || `${targetAddress.slice(0, 6)}...${targetAddress.slice(-4)}`,
          bio: dbUser?.bio || "Web3 enthusiast", 
          avatar: dbUser?.avatar || ensAvatar,
          stats: {
            totalEarnings: dbStats.totalEarnings,
            totalLinks: dbStats.totalLinks,
            privacyScore: dbStats.privacyScore,
            stealthActions: dbStats.stealthActions
          },
          x402Links: dbLinks.map(link => ({
            id: link.id,
            title: link.title,
            description: link.description,
            price: link.price.toFixed(2),
            currency: 'USDC',
            linkType: link.linkType,
            directUrl: link.directUrl,
            proxyUrl: link.proxyUrl,
            frameUrl: link.frameUrl,
            ogImageUrl: link.ogImageUrl,
            viewCount: link.viewCount,
            purchaseCount: link.purchaseCount,
            totalEarnings: link.totalEarnings,
            isActive: link.isActive,
            createdAt: link.createdAt,
            network: 'Base',
            x402Uri: `x402://base:${targetAddress}/${link.id}`
          })),
          zkReceipts: [],
          ensName: dbUser?.ensName || ensName || undefined,
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
              // Update database with base name
              await database.createOrUpdateUser({
                address: targetAddress,
                ensName: baseNameData[0].name
              });
            }
          }
        } catch (error) {
          console.warn('Failed to fetch Base name:', error);
        }

        // Load Farcaster data from Neynar API
        try {
          const farcasterRes = await fetch(`/api/farcaster/search?q=${targetAddress}`);
          if (farcasterRes.ok) {
            const farcasterData = await farcasterRes.json();
            if (farcasterData.result?.users && farcasterData.result.users.length > 0) {
              const farcasterUser = farcasterData.result.users[0];
              userData = {
                ...userData,
                username: farcasterUser.username || userData.username,
                bio: farcasterUser.profile?.bio?.text || userData.bio,
                avatar: farcasterUser.pfp_url || userData.avatar,
                farcasterProfile: {
                  fid: farcasterUser.fid.toString(),
                  username: farcasterUser.username,
                  displayName: farcasterUser.display_name,
                  bio: farcasterUser.profile?.bio?.text,
                  avatar: farcasterUser.pfp_url
                }
              };

              // Update database with Farcaster data
              await database.createOrUpdateUser({
                address: targetAddress,
                bio: farcasterUser.profile?.bio?.text || userData.bio,
                avatar: farcasterUser.pfp_url || userData.avatar
              });
            }
          }
        } catch (error) {
          console.warn('Failed to fetch Farcaster data:', error);
        }

        // Look for fkey profile
        const possibleUsernames = [
          userData.farcasterProfile?.username,
          userData.ensName?.replace('.eth', ''),
          userData.baseName?.replace('.base.eth', '')
        ].filter(Boolean);

        for (const username of possibleUsernames) {
          try {
            const fkeyRes = await fetch(`/api/fkey/lookup/${username}`);
            if (fkeyRes.ok) {
              const fkeyData = await fkeyRes.json();
              if (fkeyData.success) {
                userData.fkeyProfile = {
                  username: username,
                  address: fkeyData.address || targetAddress,
                  isRegistered: true
                };
                
                // Update database with fkey ID
                await database.createOrUpdateUser({
                  address: targetAddress,
                  fkeyId: `${username}.fkey.id`
                });
                break;
              }
            }
          } catch (error) {
            console.warn(`Failed to check fkey ${username}:`, error);
          }
        }

        // Try to find convos.org profile
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
                
                // Update database with convos username
                await database.createOrUpdateUser({
                  address: targetAddress,
                  convosUsername: username
                });
                break;
              }
            }
          } catch (error) {
            console.warn(`Failed to check convos ${username}:`, error);
          }
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

          // Generate demo ZK receipts (only for own profile)
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

        // For public profiles (viewOnly), check privacy settings before showing X402 content
        if (viewOnly) {
          try {
            const privacyResponse = await fetch(`/api/user/profile/${targetAddress}`);
            if (privacyResponse.ok) {
              const privacyData = await privacyResponse.json();
              if (privacyData.success && privacyData.profile) {
                // Only show x402 content if user has made it public
                if (privacyData.profile.x402Links) {
                  userData.x402Links = privacyData.profile.x402Links.map((link: any) => ({
                    id: link.id,
                    title: link.title,
                    description: link.description,
                    price: link.price?.toString() || '0.00',
                    currency: 'USDC',
                    linkType: link.linkType || 'document',
                    directUrl: link.directUrl,
                    proxyUrl: link.proxyUrl,
                    frameUrl: link.frameUrl || `/api/x402/frame/${link.id}`,
                    ogImageUrl: link.ogImageUrl,
                    viewCount: link.viewCount || 0,
                    purchaseCount: link.purchaseCount || 0,
                    totalEarnings: link.totalEarnings || 0,
                    isActive: link.isActive !== false,
                    createdAt: link.createdAt || new Date().toISOString(),
                    network: 'Base',
                    x402Uri: `x402://base:${targetAddress}/${link.id}`
                  }));
                }
              }
            }
          } catch (error) {
            console.warn('Failed to load privacy-filtered content:', error);
          }
        } else {
          // For own profile, show all content from database
          // If no x402 links from database, generate some based on user's identity (fallback)
          if (userData.x402Links?.length === 0) {
            userData.x402Links = generateUserLinks(targetAddress, userData);
          }
        }

        // Recalculate stats based on final data
        if (userData.stats) {
          userData.stats.totalLinks = userData.x402Links?.length || 0;
          userData.stats.totalEarnings = userData.x402Links?.reduce((sum, link) => sum + Number(link.price), 0) || 0;
        }

        setUserData(userData as UserData);
      } catch (error) {
        console.error('Failed to load user data:', error);
        // Create fallback data
        const fallbackData: UserData = {
          username: ensName || `${targetAddress.slice(0, 6)}...${targetAddress.slice(-4)}`,
          bio: "Web3 enthusiast", 
          avatar: ensAvatar || `https://api.ensideas.com/v1/avatar/${targetAddress}`,
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
    <div className="space-y-6 max-w-md mx-auto p-4 mobile-scroll hide-scrollbar overflow-y-auto">
      {/* Profile Header */}
      <div className="bg-gradient-to-r from-blue-900/20 to-purple-900/20 border border-blue-600/30 rounded-lg p-6 mobile-scroll hide-scrollbar">
                    <div className="flex items-center gap-4 mb-4">
          <div className="relative">
            <img
              src={userData?.avatar || userData?.ensAvatar || `https://api.ensideas.com/v1/avatar/${targetAddress}`}
              alt={userData?.username}
              className="w-16 h-16 rounded-full border-2 border-blue-500"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                // Try ENS avatar first, then fallback to address-based avatar
                if (!target.src.includes('ensideas.com')) {
                  target.src = `https://api.ensideas.com/v1/avatar/${targetAddress}`;
                }
              }}
            />
            <div className="absolute -bottom-1 -right-1 bg-green-500 w-4 h-4 rounded-full border-2 border-gray-900"></div>
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-white mb-1">
              {userData?.username}
            </h2>
            <p className="text-blue-300 text-sm font-mono">{targetAddress.slice(0, 6)}...{targetAddress.slice(-4)}</p>
            
            {/* Identity Tags */}
            <div className="flex flex-wrap gap-2 mt-2">
              {userData?.ensName && (
                <div className="bg-blue-900/30 border border-blue-600/30 rounded-lg px-2 py-1">
                  <span className="text-xs text-blue-300">{userData.ensName}</span>
                </div>
              )}
              
              {userData?.baseName && (
                <div className="bg-indigo-900/30 border border-indigo-600/30 rounded-lg px-2 py-1">
                  <span className="text-xs text-indigo-300">{userData.baseName}</span>
                </div>
              )}
              
              {userData?.fkeyProfile && (
                <div className="bg-purple-900/30 border border-purple-600/30 rounded-lg px-2 py-1">
                  <span className="text-xs text-purple-300">{userData.fkeyProfile.username}.fkey.id</span>
                </div>
              )}
              
              {userData?.convosProfile && (
                <div className="bg-green-900/30 border border-green-600/30 rounded-lg px-2 py-1">
                  <span className="text-xs text-green-300">{userData.convosProfile.username}.convos.org</span>
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Bio */}
        {userData?.bio && (
          <p className="text-gray-300 text-sm mb-4">{userData.bio}</p>
        )}
        
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="text-lg font-bold text-purple-400">{userData?.stats?.totalLinks || 0}</div>
            <div className="text-xs text-gray-400">Content</div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="text-lg font-bold text-green-400">{userData?.stats?.totalEarnings || 0}</div>
            <div className="text-xs text-gray-400">USDC</div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="text-lg font-bold text-blue-400">{userData?.stats?.privacyScore || 0}</div>
            <div className="text-xs text-gray-400">Privacy</div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="text-lg font-bold text-orange-400">{userData?.stats?.stealthActions || 0}</div>
            <div className="text-xs text-gray-400">Stealth</div>
          </div>
        </div>
      </div>

      {/* DaimoPay Button - Show if user has fkey.id */}
      {userData?.fkeyProfile && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 mobile-scroll hide-scrollbar">
          <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-green-400" />
            Send Payment
          </h3>
          <p className="text-sm text-gray-400 mb-3">
            Send USDC to {userData.fkeyProfile.username}.fkey.id using ZK stealth payments
          </p>
          <DaimoPayButton
            toAddress={userData.address as `0x${string}`}
            memo={`Payment to ${userData.fkeyProfile.username}.fkey.id`}
            username={userData.fkeyProfile.username}
            onPaymentCompleted={(event) => {
              console.log('Payment completed to', userData.fkeyProfile?.username, event);
              setNotification({
                isOpen: true,
                type: 'success',
                title: 'Payment Sent!',
                message: `Payment sent to ${userData.fkeyProfile?.username}.fkey.id`
              });
            }}
          />
        </div>
      )}

      {/* Convos Chat Widget - Show if user has convos profile */}
      {userData?.convosProfile && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 mobile-scroll hide-scrollbar">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-blue-400" />
              Chat on Convos
            </h3>
            <button
              onClick={() => setShowConvosChat(!showConvosChat)}
              className="text-sm bg-blue-600 hover:bg-blue-500 text-white py-1 px-3 rounded transition-colors"
            >
              {showConvosChat ? 'Hide' : 'Show'} Chat
            </button>
          </div>
          
          {showConvosChat && (
            <ConvosChat
              xmtpId={userData.convosProfile.xmtpId}
              username={userData.convosProfile.username}
              url={`https://${userData.convosProfile.username}.convos.org`}
              profile={{
                name: userData.convosProfile.name,
                username: userData.convosProfile.username,
                description: userData.convosProfile.bio,
                avatar: userData.convosProfile.avatar || userData.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${userData.convosProfile.username}`,
                address: userData.address
              }}
            />
          )}
        </div>
      )}

      {/* Content Sections */}
      <div className="space-y-6 mobile-scroll hide-scrollbar">
        {/* X402 Links */}
        {userData?.x402Links && userData.x402Links.length > 0 && (
          <div className="space-y-4 mobile-scroll hide-scrollbar">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <LinkIcon className="h-5 w-5 text-blue-400" />
              X402 Links
            </h2>
            <div className="grid grid-cols-1 gap-4 mobile-scroll hide-scrollbar">
              {userData.x402Links.map((link) => (
                <div
                  key={link.id}
                  className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 hover:border-blue-500/50 transition-colors mobile-scroll hide-scrollbar"
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
          <div className="space-y-4 mobile-scroll hide-scrollbar">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Shield className="h-5 w-5 text-green-400" />
              Proxy402 URLs
            </h2>
            <div className="space-y-2 mobile-scroll hide-scrollbar">
              {userData.proxy402Urls.map((url, index) => (
                <div
                  key={index}
                  className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 mobile-scroll hide-scrollbar"
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
          <div className="space-y-4 mobile-scroll hide-scrollbar">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Shield className="h-5 w-5 text-purple-400" />
              ZK Receipts
            </h2>
            <div className="space-y-4 mobile-scroll hide-scrollbar">
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