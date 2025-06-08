'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { User, Lock, Eye, Share, ExternalLink, Copy, Check } from 'lucide-react';
import Link from 'next/link';

interface X402Content {
  contentId: string;
  name: string;
  description: string;
  price: string;
  network: string;
  type: 'article' | 'video' | 'audio' | 'image' | 'document';
  timestamp: string;
  x402Uri: string;
  proxy402Url: string;
  frameUrl: string;
}

interface UserProfile {
  username: string;
  address?: string;
  avatar?: string;
  bio?: string;
  totalContent: number;
  totalEarnings: string;
  joinedDate: string;
  content: X402Content[];
}

export default function UserProfilePage() {
  const params = useParams();
  const username = params.username as string;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedContent, setSelectedContent] = useState<X402Content | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Mock data - replace with actual API call
  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        setLoading(true);
        
        // Simulate API call delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Mock user profile data
        const mockProfile: UserProfile = {
          username: username,
          address: '0x1234567890123456789012345678901234567890',
          avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
          bio: `Creative content creator sharing premium insights and digital experiences through X402 protocol.`,
          totalContent: 8,
          totalEarnings: '12.34',
          joinedDate: '2024-01-15',
          content: [
            {
              contentId: 'article-001',
              name: 'Advanced DeFi Strategies',
              description: 'Deep dive into yield farming and liquidity mining techniques',
              price: '0.01',
              network: 'Base',
              type: 'article',
              timestamp: '2025-06-01T10:00:00Z',
              x402Uri: 'x402://base:0x123.../article-001',
              proxy402Url: 'https://proxy402.com/base:0x123.../article-001',
              frameUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/api/x402/frame/article-001`
            },
            {
              contentId: 'video-002',
              name: 'Web3 Development Masterclass',
              description: 'Complete guide to building dApps on Base',
              price: '0.05',
              network: 'Base',
              type: 'video',
              timestamp: '2025-05-28T14:30:00Z',
              x402Uri: 'x402://base:0x123.../video-002',
              proxy402Url: 'https://proxy402.com/base:0x123.../video-002',
              frameUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/api/x402/frame/video-002`
            },
            {
              contentId: 'audio-003',
              name: 'Crypto Market Analysis Podcast',
              description: 'Weekly insights on market trends and opportunities',
              price: '0.02',
              network: 'Base',
              type: 'audio',
              timestamp: '2025-05-25T09:15:00Z',
              x402Uri: 'x402://base:0x123.../audio-003',
              proxy402Url: 'https://proxy402.com/base:0x123.../audio-003',
              frameUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/api/x402/frame/audio-003`
            }
          ]
        };
        
        setProfile(mockProfile);
      } catch (err) {
        setError('Failed to load user profile');
        console.error('Error fetching user profile:', err);
      } finally {
        setLoading(false);
      }
    };

    if (username) {
      fetchUserProfile();
    }
  }, [username]);

  const copyToClipboard = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const getContentIcon = (type: string) => {
    switch (type) {
      case 'article': return '📄';
      case 'video': return '🎥';
      case 'audio': return '🎵';
      case 'image': return '🖼️';
      case 'document': return '📋';
      default: return '📄';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const shareUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/user/${username}`;
  const frameUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/api/user/frame/${username}`;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-400 mx-auto mb-4"></div>
          <p className="text-gray-300">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <User className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Profile Not Found</h1>
          <p className="text-gray-400">{error || 'This user profile does not exist'}</p>
          <Link href="/" className="mt-4 inline-block px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors">
            Go Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
      {/* Header */}
      <div className="bg-black/20 border-b border-purple-600/30">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <Link href="/" className="text-purple-400 hover:text-purple-300 transition-colors">
              ← Back to App
            </Link>
            <div className="flex items-center gap-3">
              <button
                onClick={() => copyToClipboard(shareUrl, 'profile')}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-600/50 text-purple-300 rounded-lg transition-colors"
              >
                {copied === 'profile' ? <Check className="h-4 w-4" /> : <Share className="h-4 w-4" />}
                Share Profile
              </button>
              <button
                onClick={() => copyToClipboard(frameUrl, 'frame')}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-600/50 text-blue-300 rounded-lg transition-colors"
              >
                {copied === 'frame' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                Copy Frame URL
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Profile Header */}
        <div className="bg-gray-900/50 border border-purple-600/30 rounded-lg p-8 mb-8">
          <div className="flex items-start gap-6">
            <div className="relative">
              {profile.avatar ? (
                <img
                  src={profile.avatar}
                  alt={profile.username}
                  className="w-24 h-24 rounded-full border-4 border-purple-600/50"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-purple-600/20 border-4 border-purple-600/50 flex items-center justify-center">
                  <User className="h-12 w-12 text-purple-400" />
                </div>
              )}
              <div className="absolute -bottom-2 -right-2 bg-green-500 w-6 h-6 rounded-full border-2 border-gray-900 flex items-center justify-center">
                <div className="w-2 h-2 bg-white rounded-full"></div>
              </div>
            </div>
            
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-white mb-2">@{profile.username}</h1>
              {profile.bio && (
                <p className="text-gray-300 mb-4 max-w-2xl">{profile.bio}</p>
              )}
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <div className="text-2xl font-bold text-purple-400">{profile.totalContent}</div>
                  <div className="text-sm text-gray-400">Content Items</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <div className="text-2xl font-bold text-green-400">{profile.totalEarnings} USDC</div>
                  <div className="text-sm text-gray-400">Total Earnings</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <div className="text-2xl font-bold text-blue-400">{profile.content.length}</div>
                  <div className="text-sm text-gray-400">Published</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3">
                  <div className="text-sm text-gray-400">Joined</div>
                  <div className="text-lg font-medium text-white">{formatDate(profile.joinedDate)}</div>
                </div>
              </div>

              {profile.address && (
                <div className="mt-4 flex items-center gap-2 text-sm text-gray-400">
                  <Lock className="h-4 w-4" />
                  <span className="font-mono">{profile.address.slice(0, 6)}...{profile.address.slice(-4)}</span>
                  <button
                    onClick={() => copyToClipboard(profile.address!, 'address')}
                    className="hover:text-white transition-colors"
                  >
                    {copied === 'address' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Content Gallery */}
        <div className="bg-gray-900/50 border border-purple-600/30 rounded-lg p-6">
          <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
            <Eye className="h-6 w-6 text-purple-400" />
            Premium Content ({profile.content.length})
          </h2>

          {profile.content.length === 0 ? (
            <div className="text-center py-12">
              <Lock className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-medium text-white mb-2">No Content Yet</h3>
              <p className="text-gray-400">This creator hasn&apos;t published any content yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {profile.content.map((content) => (
                <div key={content.contentId} className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-6 hover:border-purple-600/50 transition-colors">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{getContentIcon(content.type)}</span>
                      <div>
                        <h3 className="font-medium text-white">{content.name}</h3>
                        <p className="text-sm text-gray-400 capitalize">{content.type}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-green-400">{content.price} USDC</div>
                      <div className="text-xs text-gray-400">{content.network}</div>
                    </div>
                  </div>

                  <p className="text-gray-300 text-sm mb-4 line-clamp-2">{content.description}</p>

                  <div className="text-xs text-gray-400 mb-4">
                    Published {formatDate(content.timestamp)}
                  </div>

                  <div className="space-y-2">
                    <Link
                      href={`/viewer?content=${content.contentId}&x402_uri=${encodeURIComponent(content.x402Uri)}`}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                    >
                      <Eye className="h-4 w-4" />
                      View & Pay
                    </Link>

                    <div className="flex gap-2">
                      <button
                        onClick={() => copyToClipboard(content.proxy402Url, `proxy-${content.contentId}`)}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition-colors"
                      >
                        {copied === `proxy-${content.contentId}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        Share Link
                      </button>
                      <button
                        onClick={() => copyToClipboard(content.frameUrl, `frame-${content.contentId}`)}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-700 hover:bg-blue-600 text-blue-300 rounded-lg text-sm transition-colors"
                      >
                        {copied === `frame-${content.contentId}` ? <Check className="h-3 w-3" /> : <Share className="h-3 w-3" />}
                        Frame
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Integration Info */}
        <div className="mt-8 bg-gradient-to-r from-purple-900/20 to-blue-900/20 border border-purple-600/30 rounded-lg p-6">
          <h3 className="text-lg font-bold text-white mb-3">🔗 Integration Links</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-400">Profile URL:</span>
              <div className="flex items-center gap-2 mt-1">
                <code className="flex-1 bg-gray-800 text-green-400 px-3 py-1 rounded font-mono text-xs">{shareUrl}</code>
                <button
                  onClick={() => copyToClipboard(shareUrl, 'profile-url')}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  {copied === 'profile-url' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <span className="text-gray-400">Farcaster Frame:</span>
              <div className="flex items-center gap-2 mt-1">
                <code className="flex-1 bg-gray-800 text-blue-400 px-3 py-1 rounded font-mono text-xs">{frameUrl}</code>
                <button
                  onClick={() => copyToClipboard(frameUrl, 'frame-url')}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  {copied === 'frame-url' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 