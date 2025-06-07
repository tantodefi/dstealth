"use client";

import { useEffect, useState, Suspense } from 'react';
import { useAccount } from 'wagmi';
import { Button } from '@/components/Button';
import { Copy, ExternalLink, Eye, DollarSign, Network, FileText, User, Zap, Plus, TrendingUp, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { database, type X402Link } from '@/lib/database';
import { useRouter } from 'next/navigation';

interface X402Content {
  id: string;
  name: string;
  description?: string;
  contentType: string;
  pricing: Array<{amount: number, currency: string, network?: string}>;
  accessEndpoint: string;
  coverUrl?: string;
  paymentRecipient: string;
  metadata?: {
    size?: number;
    duration?: number;
    format?: string;
  };
  creator?: {
    username: string;
    address: string;
    avatar?: string;
  };
}

interface PaymentStatus {
  isPaid: boolean;
  transactionHash?: string;
  paidAt?: string;
  amount?: number;
  currency?: string;
}

export default function ViewerComponent() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const [content, setContent] = useState<X402Content | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userLinks, setUserLinks] = useState<X402Link[]>([]);
  const [x402Input, setX402Input] = useState('');
  const [userStats, setUserStats] = useState({
    totalEarnings: 0,
    totalLinks: 0,
    totalViews: 0,
    totalPurchases: 0,
  });

  // Load content metadata and user data
  useEffect(() => {
    loadContentMetadata();
    if (address && isConnected) {
      loadUserData();
    }
  }, [address, isConnected]);

  const loadUserData = () => {
    if (!address) return;
    
    // Load user's X402 links from database
    const links = database.getUserX402Links(address);
    setUserLinks(links);
    
    // Load comprehensive stats
    const stats = database.calculateUserStats(address);
    setUserStats({
      totalEarnings: stats.totalEarnings,
      totalLinks: stats.totalLinks,
      totalViews: stats.totalViews,
      totalPurchases: stats.totalPurchases,
    });
  };

  const loadContentMetadata = async () => {
    try {
      setLoading(true);
      setError(null);

      // Show marketplace/demo content when no specific content is requested
      const contentData: X402Content = {
        id: 'marketplace',
        name: "X402 Content Viewer & Creator Dashboard",
        description: "Manage your X402 payment links, track earnings across test/live environments, and monitor content performance. Create monetized content with instant crypto payments.",
        contentType: "marketplace",
        pricing: [{ amount: 0, currency: "Free", network: "multi-chain" }],
        accessEndpoint: "/user",
        coverUrl: "",
        paymentRecipient: "",
        metadata: {
          size: 0,
          format: "dashboard",
        }
      };

      setContent(contentData);
      setLoading(false);
    } catch (error) {
      console.error('Error loading content:', error);
      setError('Failed to load content metadata');
      setLoading(false);
    }
  };

  const handleX402Input = async () => {
    if (!x402Input) return;
    
    try {
      // Clean and validate input
      const cleanInput = x402Input.trim();
      if (!cleanInput.startsWith('x402://')) {
        throw new Error('Invalid X402 URI format. Must start with x402://');
      }
      
      // Navigate to viewer page with the x402 URI
      router.push(`/viewer?x402_uri=${encodeURIComponent(cleanInput)}`);
      
      // Clear input
      setX402Input('');
      
    } catch (error) {
      console.error('Error processing X402 URI:', error);
      setError(error instanceof Error ? error.message : 'Failed to process X402 URI');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      // Could add a toast notification here
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-600/30 rounded-lg p-4">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="bg-gray-900/50 border border-gray-600/30 rounded-lg p-4">
        <p className="text-gray-400">No content to display</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* X402 URI Input */}
      <div className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 border border-purple-600/30 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <Eye className="h-8 w-8 text-purple-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">X402 Content Viewer</h1>
            <p className="text-purple-300">Enter an X402 URI to view and purchase content</p>
          </div>
        </div>
        
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={x402Input}
              onChange={(e) => setX402Input(e.target.value)}
              placeholder="Enter x402:// URI"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500"
              onKeyPress={(e) => e.key === 'Enter' && handleX402Input()}
            />
            {x402Input && (
              <button
                onClick={() => setX402Input('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-400"
              >
                ✕
              </button>
            )}
          </div>
          <Button
            onClick={handleX402Input}
            disabled={!x402Input}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
          >
            <Search className="h-4 w-4" />
            Load
          </Button>
        </div>
        
        <p className="text-gray-400 text-sm mt-2">
          Example: x402://base/0x1234.../my-content
        </p>
      </div>

      {/* Header */}
      <div className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 border border-purple-600/30 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-3">
          <Eye className="h-8 w-8 text-purple-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">{content.name}</h1>
            <p className="text-purple-300">Premium content viewer and creator dashboard</p>
          </div>
        </div>
        {content.description && (
          <p className="text-gray-300 text-sm">{content.description}</p>
        )}
      </div>

      {/* User Stats Dashboard - only show if connected */}
      {isConnected && (
        <div className="bg-gray-900/50 border border-gray-600/30 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-green-400" />
            Your Creator Stats
          </h2>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="bg-green-900/20 border border-green-600/30 rounded-lg p-3">
              <div className="text-2xl font-bold text-green-400">${userStats.totalEarnings.toFixed(2)}</div>
              <div className="text-xs text-green-300">Total Earnings</div>
            </div>
            <div className="bg-blue-900/20 border border-blue-600/30 rounded-lg p-3">
              <div className="text-2xl font-bold text-blue-400">{userStats.totalLinks}</div>
              <div className="text-xs text-blue-300">Content Links</div>
            </div>
            <div className="bg-purple-900/20 border border-purple-600/30 rounded-lg p-3">
              <div className="text-2xl font-bold text-purple-400">{userStats.totalViews}</div>
              <div className="text-xs text-purple-300">Total Views</div>
            </div>
            <div className="bg-orange-900/20 border border-orange-600/30 rounded-lg p-3">
              <div className="text-2xl font-bold text-orange-400">{userStats.totalPurchases}</div>
              <div className="text-xs text-orange-300">Purchases</div>
            </div>
          </div>
        </div>
      )}

      {/* User's Created Links - only show if connected and has links */}
      {isConnected && userLinks.length > 0 && (
        <div className="bg-gray-900/50 border border-gray-600/30 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-400" />
            Your X402 Content ({userLinks.length})
          </h2>
          
          <div className="space-y-3">
            {userLinks.slice(0, 5).map((link) => (
              <div key={link.id} className="border border-gray-700 rounded-lg p-4 hover:border-gray-600 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="text-white font-semibold">{link.title}</h3>
                    <p className="text-gray-400 text-sm">{link.description}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs">
                      <span className="text-green-400 flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        {link.price} {link.currency}
                      </span>
                      <span className="text-blue-400">{link.linkType} link</span>
                      <span className="text-gray-500">{link.viewCount} views</span>
                      <span className="text-orange-400">{link.purchaseCount} purchases</span>
                      <span className="text-green-500">${link.totalEarnings.toFixed(2)} earned</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => copyToClipboard(link.linkType === 'direct' ? link.directUrl : link.proxyUrl)}
                      className="bg-gray-600 hover:bg-gray-700 text-white"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      onClick={() => window.open(link.linkType === 'direct' ? link.directUrl : link.proxyUrl, '_blank')}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            
            {userLinks.length > 5 && (
              <div className="text-center">
                <Button
                  onClick={() => window.open('/x402-test', '_blank')}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  View All {userLinks.length} Links
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="bg-gray-900/50 border border-gray-600/30 rounded-lg p-6">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Zap className="h-5 w-5 text-yellow-400" />
          Quick Actions
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Button
            onClick={() => window.open('/x402-test', '_blank')}
            className="bg-orange-600 hover:bg-orange-700 text-white flex items-center justify-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Create X402 Content
          </Button>
          
          <Button
            onClick={() => window.open('/user', '_blank')}
            className="bg-purple-600 hover:bg-purple-700 text-white flex items-center justify-center gap-2"
          >
            <User className="h-4 w-4" />
            Manage Profile
          </Button>
          
          <Button
            onClick={() => copyToClipboard('x402://base-sepolia:0x87b880b8623f328a378788ffa93dd2d2e01e465d/sample-content')}
            className="bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-2"
          >
            <Copy className="h-4 w-4" />
            Copy Sample X402 URL
          </Button>
          
          <Button
            onClick={() => window.open('https://proxy402.com', '_blank')}
            className="bg-green-600 hover:bg-green-700 text-white flex items-center justify-center gap-2"
          >
            <ExternalLink className="h-4 w-4" />
            Visit Proxy402
          </Button>
        </div>
      </div>

      {/* Get Started Guide - only show if not connected or no links */}
      {(!isConnected || userLinks.length === 0) && (
        <div className="bg-gray-900/50 border border-gray-600/30 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-4">Getting Started with X402</h2>
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <span className="bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold mt-0.5">1</span>
              <div>
                <h3 className="text-white font-semibold">Connect Your Wallet</h3>
                <p className="text-gray-300">Connect your Web3 wallet to start creating monetized content</p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <span className="bg-green-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold mt-0.5">2</span>
              <div>
                <h3 className="text-white font-semibold">Create X402 Links</h3>
                <p className="text-gray-300">Use the X402 tab to create payment-gated content links</p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <span className="bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold mt-0.5">3</span>
              <div>
                <h3 className="text-white font-semibold">Share & Earn</h3>
                <p className="text-gray-300">Share your links and receive instant crypto payments</p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <span className="bg-orange-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold mt-0.5">4</span>
              <div>
                <h3 className="text-white font-semibold">Track Performance</h3>
                <p className="text-gray-300">Monitor earnings and analytics in real-time</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sample Content Links */}
      <div className="bg-gray-900/50 border border-gray-600/30 rounded-lg p-6">
        <h2 className="text-xl font-bold text-white mb-4">Sample X402 Content</h2>
        <div className="space-y-3">
          <div className="border border-gray-700 rounded-lg p-4 hover:border-gray-600 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white font-semibold">📄 DeFi Trading Strategy</h3>
                <p className="text-gray-400 text-sm">Premium trading insights and methodology</p>
                <span className="text-green-400 text-sm font-semibold">25.00 USDC</span>
              </div>
              <Button
                onClick={() => copyToClipboard('x402://base-sepolia:0x87b880b8623f328a378788ffa93dd2d2e01e465d/defi-strategy')}
                className="bg-gray-600 hover:bg-gray-700 text-white"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          <div className="border border-gray-700 rounded-lg p-4 hover:border-gray-600 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white font-semibold">🎥 Web3 Development Course</h3>
                <p className="text-gray-400 text-sm">Complete video series on smart contract development</p>
                <span className="text-green-400 text-sm font-semibold">50.00 USDC</span>
              </div>
              <Button
                onClick={() => copyToClipboard('x402://base-sepolia:0x87b880b8623f328a378788ffa93dd2d2e01e465d/web3-course')}
                className="bg-gray-600 hover:bg-gray-700 text-white"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          <div className="border border-gray-700 rounded-lg p-4 hover:border-gray-600 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white font-semibold">🎵 Exclusive Music Track</h3>
                <p className="text-gray-400 text-sm">Unreleased track from indie artist</p>
                <span className="text-green-400 text-sm font-semibold">5.00 USDC</span>
              </div>
              <Button
                onClick={() => copyToClipboard('x402://base-sepolia:0x87b880b8623f328a378788ffa93dd2d2e01e465d/music-track')}
                className="bg-gray-600 hover:bg-gray-700 text-white"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 