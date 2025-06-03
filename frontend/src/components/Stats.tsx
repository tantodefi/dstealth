import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { storage } from '@/lib/storage';
import { useAccount } from 'wagmi';

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

export function Stats() {
  const [isOpen, setIsOpen] = useState(false);
  const [stats, setStats] = useState<AppStats>({ invitesSent: 0, stealthPaymentsSent: 0, endpoints: 0 });
  const [proxy402Stats, setProxy402Stats] = useState<Proxy402ActivityStats | null>(null);
  const [proxy402EndpointsCount, setProxy402EndpointsCount] = useState<number>(0);
  
  const { address, isConnected } = useAccount();

  // Get user-specific storage keys
  const getEndpointsKey = (userAddress: string) => `proxy402_endpoints_${userAddress.toLowerCase()}`;
  const getActivityStatsKey = (userAddress: string) => `proxy402_activity_stats_${userAddress.toLowerCase()}`;

  // Load all stats data
  const loadAllStats = () => {
    // Load existing app stats
    setStats(storage.getStats());

    // Load Proxy402 stats if wallet is connected
    if (isConnected && address) {
      const endpointsKey = getEndpointsKey(address);
      const activityStatsKey = getActivityStatsKey(address);
      
      const endpoints = localStorage.getItem(endpointsKey);
      const activityStats = localStorage.getItem(activityStatsKey);
      
      // Load endpoints count
      if (endpoints) {
        setProxy402EndpointsCount(parseInt(endpoints, 10) || 0);
      } else {
        setProxy402EndpointsCount(0);
      }
      
      // Load activity stats
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
    } else {
      // Clear Proxy402 stats when wallet disconnected
      setProxy402EndpointsCount(0);
      setProxy402Stats(null);
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
      
      // Reload Proxy402 stats if they changed for this wallet
      if (address && (
        e.key === getEndpointsKey(address) || 
        e.key === getActivityStatsKey(address)
      )) {
        loadAllStats();
      }
    };

    // Listen for custom Proxy402 events
    const handleProxy402JWTSaved = (e: CustomEvent) => {
      if (e.detail.address === address?.toLowerCase()) {
        loadAllStats();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('proxy402JWTSaved', handleProxy402JWTSaved as EventListener);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('proxy402JWTSaved', handleProxy402JWTSaved as EventListener);
    };
  }, [address, isConnected]);

  // Calculate totals
  const hasProxy402Data = isConnected && address && (proxy402Stats || proxy402EndpointsCount > 0);
  const totalPaymentLinks = proxy402EndpointsCount;
  const totalPurchases = (proxy402Stats?.totalPurchases || 0);
  const totalRevenue = (proxy402Stats?.totalRevenue || 0);

  return (
    <div className="w-full max-w-md mx-auto">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-2 bg-gray-900 hover:bg-gray-800 rounded-md text-sm text-gray-300"
      >
        <span>Activity Stats</span>
        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {isOpen && (
        <div className="mt-2 p-4 bg-gray-900 rounded-md space-y-4">
          {/* Main Activity Stats */}
          <div>
            <h4 className="text-sm font-medium text-gray-300 mb-3">Activity Overview</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center">
                <div className="text-xl font-bold text-blue-500">{stats.invitesSent}</div>
                <div className="text-xs text-gray-400">Invites Sent</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-green-500">{stats.stealthPaymentsSent}</div>
                <div className="text-xs text-gray-400">Stealth Payments</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-purple-500">{totalPaymentLinks}</div>
                <div className="text-xs text-gray-400">Payment Links</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-yellow-500">{totalPurchases}</div>
                <div className="text-xs text-gray-400">Total Purchases</div>
              </div>
            </div>
          </div>

          {/* Revenue Summary */}
          {hasProxy402Data && totalRevenue > 0 && (
            <div className="border-t border-gray-700 pt-4">
              <h4 className="text-sm font-medium text-gray-300 mb-2">Revenue Summary</h4>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-400">${totalRevenue.toFixed(2)}</div>
                <div className="text-xs text-gray-400">Total Earnings</div>
              </div>
              {proxy402Stats?.lastUpdated && (
                <div className="mt-2 text-center">
                  <div className="text-xs text-gray-500">
                    Last updated: {new Date(proxy402Stats.lastUpdated).toLocaleDateString()}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Connect wallet message */}
          {!isConnected && (
            <div className="border-t border-gray-700 pt-4 text-center">
              <div className="text-xs text-gray-500">
                Connect wallet to see payment link activity
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
} 