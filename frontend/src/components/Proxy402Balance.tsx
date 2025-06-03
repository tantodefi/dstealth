"use client";

import { useEffect, useState } from 'react';
import { DollarSign, TrendingUp } from 'lucide-react';
import { useAccount } from 'wagmi';
import { useXMTP } from '@/context/xmtp-context';

interface DashboardStats {
  total_earnings?: number;
  total_purchases?: number;
  test_earnings: number;
  test_purchases: number;
  real_earnings: number;
  real_purchases: number;
}

interface ActivityStats {
  totalLinks: number;
  totalPurchases: number;
  totalRevenue: number;
  lastUpdated: string;
}

interface Proxy402BalanceProps {
  onShowChart?: () => void;
}

export function Proxy402Balance({ onShowChart }: Proxy402BalanceProps) {
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [hasJWT, setHasJWT] = useState(false);
  const [endpointsCount, setEndpointsCount] = useState<number>(0);
  const [activityStats, setActivityStats] = useState<ActivityStats | null>(null);
  
  const { address, isConnected } = useAccount();
  const { client } = useXMTP();

  // Get user-specific storage keys
  const getJWTKey = (userAddress: string) => `proxy402_jwt_${userAddress.toLowerCase()}`;
  const getEndpointsKey = (userAddress: string) => `proxy402_endpoints_${userAddress.toLowerCase()}`;
  const getActivityStatsKey = (userAddress: string) => `proxy402_activity_stats_${userAddress.toLowerCase()}`;

  // Check for JWT and load all stored data
  const checkJWTAndLoadData = async () => {
    if (!isConnected || !address) {
      setHasJWT(false);
      setBalance(0);
      setError("");
      setEndpointsCount(0);
      setActivityStats(null);
      return;
    }

    const jwtKey = getJWTKey(address);
    const endpointsKey = getEndpointsKey(address);
    const activityStatsKey = getActivityStatsKey(address);
    
    const jwt = localStorage.getItem(jwtKey);
    const endpoints = localStorage.getItem(endpointsKey);
    const stats = localStorage.getItem(activityStatsKey);
    
    console.log('Loading Proxy402 data for wallet:', address);
    console.log('JWT exists:', !!jwt);
    console.log('Endpoints count:', endpoints);
    console.log('Activity stats:', stats);
    
    // Load endpoints count
    if (endpoints) {
      setEndpointsCount(parseInt(endpoints, 10) || 0);
    } else {
      setEndpointsCount(0);
    }
    
    // Load activity stats
    if (stats) {
      try {
        const parsedStats = JSON.parse(stats);
        setActivityStats(parsedStats);
      } catch (error) {
        console.error('Failed to parse activity stats:', error);
        setActivityStats(null);
      }
    } else {
      setActivityStats(null);
    }
    
    // Load JWT and fetch balance
    if (jwt) {
      setHasJWT(true);
      await fetchBalance(jwt);
    } else {
      setHasJWT(false);
      setBalance(0);
      setError("");
    }
  };

  useEffect(() => {
    checkJWTAndLoadData();

    // Listen for custom events when JWT is saved
    const handleJWTSaved = (e: CustomEvent) => {
      if (e.detail.address === address?.toLowerCase()) {
        console.log('JWT saved event received for address:', address);
        checkJWTAndLoadData();
      }
    };

    // Listen for storage changes (for other tabs)
    const handleStorageChange = (e: StorageEvent) => {
      if (address && (
        e.key === getJWTKey(address) || 
        e.key === getEndpointsKey(address) || 
        e.key === getActivityStatsKey(address)
      )) {
        console.log('Storage change detected for Proxy402 data');
        checkJWTAndLoadData();
      }
    };

    // Add event listeners
    window.addEventListener('proxy402JWTSaved', handleJWTSaved as EventListener);
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('proxy402JWTSaved', handleJWTSaved as EventListener);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [isConnected, address]);

  const fetchBalance = async (jwt?: string) => {
    try {
      setLoading(true);
      setError("");

      if (!address) {
        setError('No wallet connected');
        return;
      }

      const jwtToken = jwt || localStorage.getItem(getJWTKey(address));
      if (!jwtToken) {
        setError('No JWT found for this wallet');
        return;
      }

      console.log('Fetching balance for address:', address);
      const response = await fetch('/api/proxy402/dashboard/stats', {
        headers: {
          'Authorization': `Bearer ${jwtToken}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data: DashboardStats = await response.json();
      
      // Calculate total balance (real + test earnings, converted from cents to dollars)
      const totalBalance = ((data.real_earnings || 0) + (data.test_earnings || 0)) / 100;
      setBalance(totalBalance);
      setError("");
      console.log('Balance updated:', totalBalance);
    } catch (error) {
      console.error('Failed to fetch Proxy402 balance:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch balance');
    } finally {
      setLoading(false);
    }
  };

  const handleClick = () => {
    console.log('Balance button clicked, hasJWT:', hasJWT, 'error:', error);
    if (hasJWT && !error && onShowChart) {
      onShowChart();
    }
  };

  // Don't render if no wallet is connected
  if (!isConnected || !address) {
    return null;
  }

  console.log('Proxy402Balance render:', { 
    hasJWT, 
    loading, 
    error, 
    balance, 
    endpointsCount, 
    activityStats 
  });

  return (
    <button
      onClick={handleClick}
      disabled={loading || !hasJWT}
      className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      title={
        !hasJWT 
          ? 'Configure Proxy402 JWT in settings to view earnings' 
          : error 
            ? error 
            : `Click to view earnings dashboard (${endpointsCount} links)`
      }
    >
      <DollarSign className="w-4 h-4 text-white" />
      <span className="text-white font-medium">
        {loading ? (
          <span className="flex items-center gap-1">
            <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></div>
            Loading...
          </span>
        ) : !hasJWT ? (
          "$0.00"
        ) : error ? (
          <span className="text-red-200">Error</span>
        ) : (
          `$${balance.toFixed(2)}`
        )}
      </span>
      {!loading && hasJWT && !error && (
        <TrendingUp className="w-4 h-4 text-white" />
      )}
    </button>
  );
} 