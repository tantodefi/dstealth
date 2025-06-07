import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Eye, Shield, Wallet, Activity, Zap } from 'lucide-react';
import { storage } from '@/lib/storage';
import { useAccount } from 'wagmi';
import Link from 'next/link';

interface AppStats {
  invitesSent: number;
  stealthPaymentsSent: number;
  endpoints: number; // Keep for backward compatibility but won't display
}

interface Proxy402ActivityStats {
  totalLinks: number;
  totalPurchases: number;
  totalRevenue: number;
  lastUpdated: string;
}

interface PrivacyActionStats {
  stealthAddressRegistrations: number;
  stealthPaymentsSent: number;
  stealthPaymentsReceived: number;
  umbraPayments: number;
  veilCashDeposits: number;
  veilCashWithdrawals: number;
  zkProofsGenerated: number;
  privacyScore: number;
  lastPrivacyAction: string | null;
}

interface PaymentUrlStats {
  x402Links: number;
  x402Purchases: number;
  x402Revenue: number;
  directPaymentLinks: number;
  directPayments: number;
  directRevenue: number;
  subscriptionLinks: number;
  subscriptionRevenue: number;
  tipJarLinks: number;
  tipJarRevenue: number;
  lastUpdated: string;
}

interface UserAccountDetails {
  fkeyId: string | null;
  convosUsername: string | null;
  ensName: string | null;
  stealthAddresses: string[];
  totalEarnings: number;
  privacyRating: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXPERT';
  lastActive: string;
}

export function Stats() {
  const [stats, setStats] = useState<AppStats>({ invitesSent: 0, stealthPaymentsSent: 0, endpoints: 0 });
  const [proxy402Stats, setProxy402Stats] = useState<Proxy402ActivityStats | null>(null);
  const [proxy402EndpointsCount, setProxy402EndpointsCount] = useState<number>(0);
  const [privacyStats, setPrivacyStats] = useState<PrivacyActionStats>({
    stealthAddressRegistrations: 0,
    stealthPaymentsSent: 0,
    stealthPaymentsReceived: 0,
    umbraPayments: 0,
    veilCashDeposits: 0,
    veilCashWithdrawals: 0,
    zkProofsGenerated: 0,
    privacyScore: 0,
    lastPrivacyAction: null
  });
  const [paymentUrlStats, setPaymentUrlStats] = useState<PaymentUrlStats>({
    x402Links: 0,
    x402Purchases: 0,
    x402Revenue: 0,
    directPaymentLinks: 0,
    directPayments: 0,
    directRevenue: 0,
    subscriptionLinks: 0,
    subscriptionRevenue: 0,
    tipJarLinks: 0,
    tipJarRevenue: 0,
    lastUpdated: new Date().toISOString()
  });
  const [userDetails, setUserDetails] = useState<UserAccountDetails>({
    fkeyId: null,
    convosUsername: null,
    ensName: null,
    stealthAddresses: [],
    totalEarnings: 0,
    privacyRating: 'LOW',
    lastActive: new Date().toISOString()
  });
  
  const { address, isConnected } = useAccount();

  // Get user-specific storage keys
  const getEndpointsKey = (userAddress: string) => `proxy402_endpoints_${userAddress.toLowerCase()}`;
  const getActivityStatsKey = (userAddress: string) => `proxy402_activity_stats_${userAddress.toLowerCase()}`;
  const getPrivacyStatsKey = (userAddress: string) => `privacy_stats_${userAddress.toLowerCase()}`;
  const getPaymentUrlStatsKey = (userAddress: string) => `payment_url_stats_${userAddress.toLowerCase()}`;
  const getUserDetailsKey = (userAddress: string) => `user_details_${userAddress.toLowerCase()}`;

  // Save privacy action (helper function for other components to use)
  const savePrivacyAction = (actionType: keyof PrivacyActionStats, increment: number = 1) => {
    if (!isConnected || !address) return;

    const key = getPrivacyStatsKey(address);
    const existing = localStorage.getItem(key);
    let currentStats = privacyStats;

    if (existing) {
      try {
        currentStats = JSON.parse(existing);
      } catch (error) {
        console.error('Failed to parse privacy stats:', error);
      }
    }

    const updatedStats = {
      ...currentStats,
      [actionType]: (currentStats[actionType] as number) + increment,
      lastPrivacyAction: new Date().toISOString(),
      privacyScore: calculatePrivacyScore({
        ...currentStats,
        [actionType]: (currentStats[actionType] as number) + increment
      })
    };

    localStorage.setItem(key, JSON.stringify(updatedStats));
    setPrivacyStats(updatedStats);

    // Dispatch custom event for other components
    window.dispatchEvent(new CustomEvent('privacyActionSaved', {
      detail: { address: address.toLowerCase(), actionType, increment }
    }));
  };

  // Calculate privacy score based on actions
  const calculatePrivacyScore = (stats: PrivacyActionStats): number => {
    const weights = {
      stealthAddressRegistrations: 20,
      stealthPaymentsSent: 15,
      stealthPaymentsReceived: 10,
      umbraPayments: 25,
      veilCashDeposits: 30,
      veilCashWithdrawals: 25,
      zkProofsGenerated: 10
    };

    let score = 0;
    Object.entries(weights).forEach(([key, weight]) => {
      score += (stats[key as keyof PrivacyActionStats] as number) * weight;
    });

    return Math.min(score, 1000); // Cap at 1000
  };

  // Calculate privacy rating
  const getPrivacyRating = (score: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'EXPERT' => {
    if (score >= 500) return 'EXPERT';
    if (score >= 200) return 'HIGH';
    if (score >= 50) return 'MEDIUM';
    return 'LOW';
  };

  // Load all stats data
  const loadAllStats = () => {
    // Load existing app stats
    setStats(storage.getStats());

    // Load user-specific stats if wallet is connected
    if (isConnected && address) {
      const endpointsKey = getEndpointsKey(address);
      const activityStatsKey = getActivityStatsKey(address);
      const privacyStatsKey = getPrivacyStatsKey(address);
      const paymentUrlStatsKey = getPaymentUrlStatsKey(address);
      const userDetailsKey = getUserDetailsKey(address);
      
      // Load Proxy402 stats
      const endpoints = localStorage.getItem(endpointsKey);
      const activityStats = localStorage.getItem(activityStatsKey);
      
      if (endpoints) {
        setProxy402EndpointsCount(parseInt(endpoints, 10) || 0);
      } else {
        setProxy402EndpointsCount(0);
      }
      
      if (activityStats) {
        try {
          const parsedStats = JSON.parse(activityStats);
          setProxy402Stats(parsedStats);
        } catch (error) {
          console.error('Failed to parse Proxy402 activity stats:', error);
          setProxy402Stats(null);
        }
      } else {
        setProxy402Stats(null);
      }

      // Load privacy stats
      const privacyData = localStorage.getItem(privacyStatsKey);
      if (privacyData) {
        try {
          const parsedPrivacyStats = JSON.parse(privacyData);
          setPrivacyStats(parsedPrivacyStats);
        } catch (error) {
          console.error('Failed to parse privacy stats:', error);
        }
      }

      // Load payment URL stats
      const paymentUrlData = localStorage.getItem(paymentUrlStatsKey);
      if (paymentUrlData) {
        try {
          const parsedPaymentUrlStats = JSON.parse(paymentUrlData);
          setPaymentUrlStats(parsedPaymentUrlStats);
        } catch (error) {
          console.error('Failed to parse payment URL stats:', error);
        }
      }

      // Load user details
      const userDetailsData = localStorage.getItem(userDetailsKey);
      if (userDetailsData) {
        try {
          const parsedUserDetails = JSON.parse(userDetailsData);
          setUserDetails({
            ...parsedUserDetails,
            privacyRating: getPrivacyRating(privacyStats.privacyScore)
          });
        } catch (error) {
          console.error('Failed to parse user details:', error);
        }
      } else {
        // Initialize user details for new user
        const initialUserDetails: UserAccountDetails = {
          fkeyId: null,
          convosUsername: null,
          ensName: null,
          stealthAddresses: [],
          totalEarnings: 0,
          privacyRating: getPrivacyRating(privacyStats.privacyScore),
          lastActive: new Date().toISOString()
        };
        setUserDetails(initialUserDetails);
        localStorage.setItem(userDetailsKey, JSON.stringify(initialUserDetails));
      }
    } else {
      // Clear user-specific stats when wallet disconnected
      setProxy402EndpointsCount(0);
      setProxy402Stats(null);
      setPrivacyStats({
        stealthAddressRegistrations: 0,
        stealthPaymentsSent: 0,
        stealthPaymentsReceived: 0,
        umbraPayments: 0,
        veilCashDeposits: 0,
        veilCashWithdrawals: 0,
        zkProofsGenerated: 0,
        privacyScore: 0,
        lastPrivacyAction: null
      });
      setPaymentUrlStats({
        x402Links: 0,
        x402Purchases: 0,
        x402Revenue: 0,
        directPaymentLinks: 0,
        directPayments: 0,
        directRevenue: 0,
        subscriptionLinks: 0,
        subscriptionRevenue: 0,
        tipJarLinks: 0,
        tipJarRevenue: 0,
        lastUpdated: new Date().toISOString()
      });
    }
  };

  useEffect(() => {
    // Load initial stats
    loadAllStats();

    // Listen for storage changes from other components
    const handleStorageChange = (e: StorageEvent) => {
      // Reload general stats if they changed
      if (e.key === 'xmtp-mini-stats') {
        setStats(storage.getStats());
      }
      
      // Reload user-specific stats if they changed for this wallet
      if (address && (
        e.key === getEndpointsKey(address) || 
        e.key === getActivityStatsKey(address) ||
        e.key === getPrivacyStatsKey(address) ||
        e.key === getPaymentUrlStatsKey(address) ||
        e.key === getUserDetailsKey(address)
      )) {
        loadAllStats();
      }
    };

    // Listen for custom events
    const handleProxy402JWTSaved = (e: CustomEvent) => {
      if (e.detail.address === address?.toLowerCase()) {
        loadAllStats();
      }
    };

    const handlePrivacyActionSaved = (e: CustomEvent) => {
      if (e.detail.address === address?.toLowerCase()) {
        loadAllStats();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('proxy402JWTSaved', handleProxy402JWTSaved as EventListener);
    window.addEventListener('privacyActionSaved', handlePrivacyActionSaved as EventListener);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('proxy402JWTSaved', handleProxy402JWTSaved as EventListener);
      window.removeEventListener('privacyActionSaved', handlePrivacyActionSaved as EventListener);
    };
  }, [address, isConnected]);

  // Expose savePrivacyAction globally for other components
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).savePrivacyAction = savePrivacyAction;
    }
  }, [savePrivacyAction]);

  // Calculate totals
  const hasProxy402Data = isConnected && address && (proxy402Stats || proxy402EndpointsCount > 0);
  const totalPaymentLinks = proxy402EndpointsCount + paymentUrlStats.directPaymentLinks + paymentUrlStats.tipJarLinks;
  const totalPurchases = (proxy402Stats?.totalPurchases || 0) + paymentUrlStats.x402Purchases + paymentUrlStats.directPayments;
  const totalRevenue = ((proxy402Stats?.totalRevenue || 0) / 100) + paymentUrlStats.x402Revenue + paymentUrlStats.directRevenue + paymentUrlStats.tipJarRevenue;

  return (
    <div className="w-full space-y-4">
      {/* User Account Details */}
      {isConnected && address && (
        <div className="bg-gradient-to-r from-blue-900/20 to-purple-900/20 border border-blue-600/30 rounded-lg p-4">
          <h4 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Account Profile
          </h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-400">Wallet:</span>
              <div className="text-white font-mono text-xs">{address.slice(0, 6)}...{address.slice(-4)}</div>
            </div>
            <div>
              <span className="text-gray-400">Privacy Rating:</span>
              <div className={`font-semibold ${
                userDetails.privacyRating === 'EXPERT' ? 'text-purple-400' :
                userDetails.privacyRating === 'HIGH' ? 'text-green-400' :
                userDetails.privacyRating === 'MEDIUM' ? 'text-yellow-400' : 'text-red-400'
              }`}>
                {userDetails.privacyRating}
              </div>
            </div>
            <div>
              <span className="text-gray-400">fkey.id:</span>
              <div className="text-white">{userDetails.fkeyId || 'Not set'}</div>
            </div>
            <div>
              <span className="text-gray-400">Total Earnings:</span>
              <div className="text-green-400 font-semibold">${totalRevenue.toFixed(2)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Privacy & Stealth Actions */}
      <div className="bg-gray-900/50 border border-gray-600/30 rounded-lg p-4">
        <h4 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <Shield className="w-5 h-5" />
          Privacy Actions
        </h4>
        <div className="grid grid-cols-3 gap-3 text-center text-sm">
          <div>
            <div className="text-xl font-bold text-purple-400">{privacyStats.stealthAddressRegistrations}</div>
            <div className="text-xs text-gray-400">Stealth Addresses</div>
          </div>
          <div>
            <div className="text-xl font-bold text-blue-400">{privacyStats.umbraPayments}</div>
            <div className="text-xs text-gray-400">Umbra Payments</div>
          </div>
          <div>
            <div className="text-xl font-bold text-green-400">{privacyStats.veilCashDeposits + privacyStats.veilCashWithdrawals}</div>
            <div className="text-xs text-gray-400">Veil Operations</div>
          </div>
          <div>
            <div className="text-xl font-bold text-cyan-400">{privacyStats.zkProofsGenerated}</div>
            <div className="text-xs text-gray-400">ZK Proofs</div>
          </div>
          <div>
            <div className="text-xl font-bold text-yellow-400">{privacyStats.privacyScore}</div>
            <div className="text-xs text-gray-400">Privacy Score</div>
          </div>
          <div>
            <div className="text-xl font-bold text-pink-400">{privacyStats.stealthPaymentsSent + privacyStats.stealthPaymentsReceived}</div>
            <div className="text-xs text-gray-400">Stealth Payments</div>
          </div>
        </div>
        {privacyStats.lastPrivacyAction && (
          <div className="mt-3 text-center text-xs text-gray-500">
            Last action: {new Date(privacyStats.lastPrivacyAction).toLocaleDateString()}
          </div>
        )}
      </div>

      {/* Payment URL Statistics */}
      <div className="bg-gray-900/50 border border-gray-600/30 rounded-lg p-4">
        <h4 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <Wallet className="w-5 h-5" />
          Payment URLs & Revenue
        </h4>
        <div className="space-y-3">
          {/* X402 Links */}
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-orange-400" />
              <span className="text-gray-300">X402 Links</span>
            </div>
            <div className="text-right">
              <div className="text-white font-semibold">{proxy402EndpointsCount} links</div>
              <div className="text-orange-400 text-sm">${((proxy402Stats?.totalRevenue || 0) / 100).toFixed(2)}</div>
            </div>
          </div>
          
          {/* Direct Payment Links */}
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-blue-400" />
              <span className="text-gray-300">Direct Payments</span>
            </div>
            <div className="text-right">
              <div className="text-white font-semibold">{paymentUrlStats.directPaymentLinks} links</div>
              <div className="text-blue-400 text-sm">${paymentUrlStats.directRevenue.toFixed(2)}</div>
            </div>
          </div>
          
          {/* Tip Jar Links */}
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="text-yellow-400">💰</span>
              <span className="text-gray-300">Tip Jars</span>
            </div>
            <div className="text-right">
              <div className="text-white font-semibold">{paymentUrlStats.tipJarLinks} links</div>
              <div className="text-yellow-400 text-sm">${paymentUrlStats.tipJarRevenue.toFixed(2)}</div>
            </div>
          </div>
        </div>

        {/* Total Summary */}
        <div className="mt-4 pt-3 border-t border-gray-700 flex justify-between items-center">
          <span className="text-gray-300 font-medium">Total</span>
          <div className="text-right">
            <div className="text-white font-bold text-lg">{totalPaymentLinks} links</div>
            <div className="text-green-400 font-bold text-lg">${totalRevenue.toFixed(2)}</div>
          </div>
        </div>
      </div>

      {/* Main Activity Stats */}
      <div className="bg-gray-900/50 border border-gray-600/30 rounded-lg p-4">
        <h4 className="text-lg font-semibold text-white mb-3">Activity Overview</h4>
        <div className="grid grid-cols-2 gap-3 text-center">
          <div>
            <div className="text-xl font-bold text-blue-500">{stats.invitesSent}</div>
            <div className="text-xs text-gray-400">Invites Sent</div>
          </div>
          <div>
            <div className="text-xl font-bold text-green-500">{stats.stealthPaymentsSent}</div>
            <div className="text-xs text-gray-400">Stealth Payments</div>
          </div>
          <div>
            <div className="text-xl font-bold text-purple-500">{totalPurchases}</div>
            <div className="text-xs text-gray-400">Total Purchases</div>
          </div>
          <div>
            <div className="text-xl font-bold text-yellow-500">{totalPaymentLinks}</div>
            <div className="text-xs text-gray-400">Payment Links</div>
          </div>
        </div>
      </div>

      {/* X402 Content Test */}
      <div className="bg-gray-900/50 border border-gray-600/30 rounded-lg p-4">
        <h4 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <Eye className="w-5 w-5" />
          Test X402 Content
        </h4>
        <div className="grid grid-cols-2 gap-2">
          <Link
            href="/viewer?content=article-001"
            className="text-center p-2 bg-gray-800 hover:bg-gray-700 rounded text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            📄 DeFi Article
          </Link>
          <Link
            href="/viewer?content=video-002"
            className="text-center p-2 bg-gray-800 hover:bg-gray-700 rounded text-xs text-green-400 hover:text-green-300 transition-colors"
          >
            🎥 Web3 Tutorial
          </Link>
          <Link
            href="/viewer?content=audio-003"
            className="text-center p-2 bg-gray-800 hover:bg-gray-700 rounded text-xs text-purple-400 hover:text-purple-300 transition-colors"
          >
            🎵 Crypto Podcast
          </Link>
          <Link
            href="/viewer?content=premium-insights"
            className="text-center p-2 bg-gray-800 hover:bg-gray-700 rounded text-xs text-orange-400 hover:text-orange-300 transition-colors"
          >
            🔐 Privacy Insights
          </Link>
        </div>
      </div>

      {/* Connect wallet message */}
      {!isConnected && (
        <div className="bg-gray-900/50 border border-gray-600/30 rounded-lg p-4 text-center">
          <div className="text-sm text-gray-500">
            Connect wallet to see detailed activity stats and privacy metrics
          </div>
        </div>
      )}
    </div>
  );
} 