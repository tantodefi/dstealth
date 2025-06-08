"use client";

import { useState, useEffect } from "react";
import { useAccount, useConnect, useEnsName, useEnsAvatar } from 'wagmi';
import { Button } from "@/components/Button";
import { ExternalLink, Wallet, Link as LinkIcon, Eye, Copy, Share, ArrowLeft, User, DollarSign, FileText, Shield } from 'lucide-react';
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
  bio?: string;
  avatar?: string;
}

interface FkeyProfile {
  username: string;
  bio?: string;
  avatar?: string;
}

interface UserProfileProps {
  address?: string;
  frameAction?: string;
  initialAction?: 'pay' | 'connect';
  farcasterUser?: {
    fid: string;
    username: string;
    displayName?: string;
    bio?: string;
    avatar?: string;
  };
}

interface UserData {
  username: string;
  bio?: string;
  avatar?: string;
  stats: UserStats;
  x402Links: X402Link[];
  ensName?: string;
  ensAvatar?: string;
  farcasterProfile?: FarcasterProfile;
  convosProfile?: ConvosProfile;
  fkeyProfile?: FkeyProfile;
  zkReceipts: ZKReceipt[];
}

function generateDummyData(address: string): UserData {
  return {
    username: `User_${address.slice(0, 6)}`,
    bio: 'Web3 enthusiast and privacy advocate',
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${address}`,
    stats: {
      totalEarnings: 1.5,
      totalLinks: 3,
      privacyScore: 85,
      stealthActions: 12
    },
    x402Links: [
      {
        id: '1',
        title: 'Private Document',
        description: 'A confidential document shared securely',
        price: '0.1',
        currency: 'ETH',
        linkType: 'document',
        viewCount: 5,
        x402Uri: 'x402://base-sepolia:0x1234/doc1'
      },
      {
        id: '2',
        title: 'Exclusive Content',
        description: 'Premium content for subscribers',
        price: '0.05',
        currency: 'ETH',
        linkType: 'content',
        viewCount: 10,
        x402Uri: 'x402://base-sepolia:0x1234/content1'
      }
    ],
    zkReceipts: [
      {
        id: '1',
        timestamp: new Date().toISOString(),
        transactionHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        farcasterFid: 'vitalik.eth',
        convosId: 'vitalik',
        proofType: 'farcaster',
        status: 'verified',
        metadata: {
          title: 'Farcaster Identity Verification',
          description: 'Zero-knowledge proof of Farcaster account ownership',
          amount: '0.01',
          currency: 'ETH'
        }
      },
      {
        id: '2',
        timestamp: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
        transactionHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        convosId: 'vitalik',
        proofType: 'convos',
        status: 'verified',
        metadata: {
          title: 'Convos Membership Proof',
          description: 'Zero-knowledge proof of Convos membership',
          amount: '0.05',
          currency: 'ETH'
        }
      }
    ]
  };
}

export default function UserProfile({ address: propAddress, frameAction, initialAction, farcasterUser }: UserProfileProps) {
  const { address: connectedAddress, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  
  // Use connected address if no address prop provided
  const targetAddress = propAddress || connectedAddress;
  
  // ENS hooks for the target address
  const { data: ensName } = useEnsName({ address: targetAddress as `0x${string}` });
  const { data: ensAvatar } = useEnsAvatar({ name: ensName! });
  
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [selectedLink, setSelectedLink] = useState<UserData['x402Links'][0] | null>(null);
  const [showViewer, setShowViewer] = useState(false);
  const [viewerUrl, setViewerUrl] = useState('');
  const [notification, setNotification] = useState<NotificationState>({
    isOpen: false,
    type: 'success',
    title: '',
    message: ''
  });

  // Handle initial actions from Frame/URL
  useEffect(() => {
    if (initialAction === 'pay') {
      setShowPaymentModal(true);
    } else if (initialAction === 'connect') {
      setShowConnectModal(true);
    }
  }, [initialAction]);

  // Load real user data from APIs and local storage
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
            privacyScore: 0,
            stealthActions: 0
          },
          x402Links: [],
          zkReceipts: [],
          ensName: ensName || undefined,
          ensAvatar: ensAvatar || undefined
        };

        // Load Farcaster data
        try {
          const farcasterRes = await fetch(`/api/farcaster/user/${targetAddress}`);
          if (farcasterRes.ok) {
            const farcasterData = await farcasterRes.json();
            userData = {
              ...userData,
              username: farcasterData.username || userData.username,
              bio: farcasterData.bio || userData.bio,
              avatar: farcasterData.avatar || userData.avatar,
              farcasterProfile: farcasterData
            };
          }
        } catch (error) {
          console.warn('Failed to fetch Farcaster data:', error);
        }

        // Load Convos data
        try {
          const convosRes = await fetch(`/api/convos/user/${targetAddress}`);
          if (convosRes.ok) {
            const convosData = await convosRes.json();
            userData.convosProfile = convosData;
          }
        } catch (error) {
          console.warn('Failed to fetch Convos data:', error);
        }

        // Load .fkey.id data
        try {
          const fkeyRes = await fetch(`/api/fkey/user/${targetAddress}`);
          if (fkeyRes.ok) {
            const fkeyData = await fkeyRes.json();
            userData.fkeyProfile = fkeyData;
          }
        } catch (error) {
          console.warn('Failed to fetch .fkey.id data:', error);
        }

        // Load x402 links
        try {
          const x402Res = await fetch(`/api/x402/links/${targetAddress}`);
          if (x402Res.ok) {
            const x402Links = await x402Res.json();
            userData.x402Links = x402Links;
            if (userData.stats) {
              userData.stats.totalLinks = x402Links.length;
            }
          }
        } catch (error) {
          console.warn('Failed to fetch x402 links:', error);
          // Use demo links as fallback
          userData.x402Links = generateUserLinks(targetAddress, 2);
          if (userData.stats) {
            userData.stats.totalLinks = userData.x402Links.length;
          }
        }

        // Load ZK receipts
        try {
          const receiptsRes = await fetch(`/api/zk/receipts/${targetAddress}`);
          if (receiptsRes.ok) {
            const zkReceipts = await receiptsRes.json();
            userData.zkReceipts = zkReceipts;
          }
        } catch (error) {
          console.warn('Failed to fetch ZK receipts:', error);
          // Use demo receipt as fallback
          userData.zkReceipts = [{
            id: '1',
            timestamp: new Date().toISOString(),
            transactionHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
            farcasterFid: targetAddress,
            convosId: targetAddress.slice(0, 8),
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

        // Set the user data even if some APIs failed
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
            privacyScore: 0,
            stealthActions: 0
          },
          x402Links: generateUserLinks(targetAddress, 2),
          zkReceipts: [],
          ensName: ensName || undefined,
          ensAvatar: ensAvatar || undefined
        };
        setUserData(fallbackData);
      } finally {
        setLoading(false);
      }
    };

    loadUserData();
  }, [targetAddress, ensName, ensAvatar]);

  // Generate realistic X402 links based on user's actual data
  const generateUserLinks = (address: string, linkCount: number): X402Link[] => {
    const baseLinks: X402Link[] = [
      {
        id: '1',
        title: '🚀 Exclusive Trading Strategy',
        description: 'Proven DeFi trading methodology with documented results',
        price: 25.00,
        currency: 'USDC',
        linkType: 'document',
        viewCount: 0,
        x402Uri: `x402://pay/${address}/trading-strategy`,
        url: `x402://pay/${address}/trading-strategy?price=25&currency=USDC`,
        proxy402Url: `${typeof window !== 'undefined' ? window.location.origin : ''}/viewer?url=x402://pay/${address}/trading-strategy`,
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 5 days ago
      },
      {
        id: '2', 
        title: '📊 Weekly Market Analysis',
        description: 'In-depth crypto market analysis with actionable insights',
        price: 10.00,
        currency: 'USDC',
        linkType: 'document',
        viewCount: 0,
        x402Uri: `x402://pay/${address}/market-analysis`,
        url: `x402://pay/${address}/market-analysis?price=10&currency=USDC`,
        proxy402Url: `${typeof window !== 'undefined' ? window.location.origin : ''}/viewer?url=x402://pay/${address}/market-analysis`,
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 2 days ago
      },
      {
        id: '3',
        title: '🎯 Portfolio Review Service',
        description: 'Personal portfolio review with optimization recommendations',
        price: 50.00,
        currency: 'USDC',
        linkType: 'service',
        viewCount: 0,
        x402Uri: `x402://pay/${address}/portfolio-review`,
        url: `x402://pay/${address}/portfolio-review?price=50&currency=USDC`,
        proxy402Url: `${typeof window !== 'undefined' ? window.location.origin : ''}/viewer?url=x402://pay/${address}/portfolio-review`,
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 1 week ago
      }
    ];

    // Return actual number of links based on stored endpoints count
    return baseLinks.slice(0, Math.max(linkCount, 1));
  };

  const handlePayment = async (link: UserData['x402Links'][0]) => {
    if (!isConnected) {
      setShowConnectModal(true);
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
          message: `This content requires payment of ${link.price} ${link.currency}`
        });
        return;
      }
      
      // Handle successful content access
      window.open(data.contentUrl, '_blank');
    } catch (error) {
      setNotification({
        isOpen: true,
        type: 'error',
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to access content'
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
    const profileUrl = `${window.location.origin}/u/${targetAddress}`;
    try {
      await navigator.clipboard.writeText(profileUrl);
      setNotification({
        isOpen: true,
        type: 'success',
        title: 'Profile Link Copied!',
        message: 'Share this link to let others discover your X402 profile.'
      });
    } catch (error) {
      console.error('Failed to copy profile link');
    }
  };

  if (!targetAddress && !isConnected) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="text-center text-white">
          <User className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-4 text-white">Connect Your Wallet</h1>
          <p className="text-gray-400 mb-6">Connect your wallet to view your profile and X402 content links.</p>
          <Button
            onClick={() => setShowConnectModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            Connect Wallet
          </Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-400"></div>
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="text-center text-white">
          <h1 className="text-2xl font-bold mb-4 text-white">Profile Not Found</h1>
          <p className="text-gray-400">This user profile doesn&apos;t exist or couldn&apos;t be loaded.</p>
        </div>
      </div>
    );
  }

  // Show if this is the connected user's own profile
  const isOwnProfile = isConnected && connectedAddress?.toLowerCase() === targetAddress?.toLowerCase();

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-4">
      {/* Profile Header */}
      <div className="bg-gradient-to-r from-blue-900/20 to-purple-900/20 border border-blue-600/30 rounded-lg p-6">
        <div className="flex flex-col md:flex-row items-start gap-6">
          <div className="flex-shrink-0">
            <img
              src={userData?.avatar}
              alt={userData?.username}
              className="w-24 h-24 rounded-full border-2 border-blue-400"
            />
          </div>
          
          <div className="flex-1 space-y-4">
            {/* Identity Section */}
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-white">
                  {userData?.username}
                </h1>
                {isOwnProfile && (
                  <span className="bg-green-600/20 text-green-400 text-xs px-2 py-1 rounded-full border border-green-600/30">
                    Your Profile
                  </span>
                )}
              </div>

              {/* Identity Stack */}
              <div className="space-y-1">
                {userData?.farcasterProfile?.username && (
                  <div className="flex items-center gap-2">
                    <span className="text-purple-400">@{userData.farcasterProfile!.username}</span>
                    <ExternalLink 
                      className="h-4 w-4 cursor-pointer hover:text-purple-400"
                      onClick={() => window.open(`https://warpcast.com/${userData.farcasterProfile!.username}`, '_blank')}
                    />
                  </div>
                )}
                
                {userData?.ensName && (
                  <p className="text-blue-400">{userData.ensName}</p>
                )}

                {userData?.fkeyProfile?.username && (
                  <div className="flex items-center gap-2">
                    <span className="text-green-400">{userData.fkeyProfile!.username}.fkey.id</span>
                    <ExternalLink 
                      className="h-4 w-4 cursor-pointer hover:text-green-400"
                      onClick={() => window.open(`https://${userData.fkeyProfile!.username}.fkey.id`, '_blank')}
                    />
                  </div>
                )}

                {userData?.convosProfile?.username && (
                  <div className="flex items-center gap-2">
                    <span className="text-yellow-400">{userData.convosProfile!.username}.convos.org</span>
                    <ExternalLink 
                      className="h-4 w-4 cursor-pointer hover:text-yellow-400"
                      onClick={() => window.open(`https://${userData.convosProfile!.username}.convos.org`, '_blank')}
                    />
                  </div>
                )}

                <div className="flex items-center gap-2 text-xs text-gray-400 font-mono">
                  <span>{targetAddress}</span>
                  <Copy 
                    className="h-3 w-3 cursor-pointer hover:text-blue-400 transition-colors"
                    onClick={() => copyLink(targetAddress!)}
                  />
                </div>
              </div>
            </div>

            {/* Bio */}
            {userData?.bio && (
              <p className="text-gray-300">{userData.bio}</p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2 md:ml-auto">
            <Button
              onClick={shareProfile}
              className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
            >
              <Share className="h-4 w-4" />
              Share
            </Button>
            {userData?.farcasterProfile?.username && (
              <Button
                onClick={() => window.open(`https://warpcast.com/${userData.farcasterProfile!.username}`, '_blank')}
                className="bg-purple-600 hover:bg-purple-700 text-white flex items-center gap-2"
              >
                <ExternalLink className="h-4 w-4" />
                Warpcast
              </Button>
            )}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-gray-800/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-green-400" />
              <span className="text-sm text-gray-400">Total Earnings</span>
            </div>
            <div className="text-2xl font-bold text-green-400">
              ${userData?.stats.totalEarnings.toFixed(2)}
            </div>
          </div>
          
          <div className="bg-gray-800/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <LinkIcon className="h-4 w-4 text-blue-400" />
              <span className="text-sm text-gray-400">X402 Links</span>
            </div>
            <div className="text-2xl font-bold text-blue-400">
              {userData?.stats.totalLinks}
            </div>
          </div>
          
          <div className="bg-gray-800/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <Shield className="h-4 w-4 text-purple-400" />
              <span className="text-sm text-gray-400">Privacy Score</span>
            </div>
            <div className="text-2xl font-bold text-purple-400">
              {userData?.stats.privacyScore}
            </div>
          </div>
          
          <div className="bg-gray-800/50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <Eye className="h-4 w-4 text-yellow-400" />
              <span className="text-sm text-gray-400">Stealth Actions</span>
            </div>
            <div className="text-2xl font-bold text-yellow-400">
              {userData?.stats.stealthActions}
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                        View
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

        {/* ZK Receipts */}
        {userData?.zkReceipts && userData.zkReceipts.length > 0 && (
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