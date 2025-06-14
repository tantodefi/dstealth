"use client";

import { useEffect, useState } from 'react';
import { DollarSign, TrendingUp, Eye, EyeOff, RefreshCw, Plus } from 'lucide-react';
import { useAccount } from 'wagmi';
import { useXMTP } from '@/context/xmtp-context';
import { database } from '@/lib/database';

interface DashboardStats {
  total_earnings?: number;
  total_purchases?: number;
  test_earnings: number;
  test_purchases: number;
  real_earnings: number;
  real_purchases: number;
}

interface Proxy402BalanceProps {
  onShowChart?: () => void;
  compact?: boolean; // For header display
}

export function Proxy402Balance({ onShowChart, compact = false }: Proxy402BalanceProps) {
  const { address, isConnected } = useAccount();
  const { client, connectionType } = useXMTP();
  const [balance, setBalance] = useState<string>('0.00');
  const [change24h, setChange24h] = useState<number>(0);
  const [isHidden, setIsHidden] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [totalLinks, setTotalLinks] = useState<number>(0);
  const [totalPurchases, setTotalPurchases] = useState<number>(0);

  // For ephemeral connections, get address from XMTP client
  const effectiveAddress = address || (connectionType === "ephemeral" && client?.inboxId ? `ephemeral_${client.inboxId}` : undefined);
  const isAnyConnectionType = isConnected || (connectionType === "ephemeral" && client);

  // Fetch comprehensive earnings data
  const fetchEarningsData = async () => {
    if (!effectiveAddress) return;

    setLoading(true);
    setError(null);

    try {
      // Get user data from database
      const userData = database.getUser(effectiveAddress);
      let jwtToken = userData?.jwtToken;

      // If not in database, try localStorage
      if (!jwtToken) {
        const jwtKey = `proxy402_jwt_${effectiveAddress.toLowerCase()}`;
        jwtToken = localStorage.getItem(jwtKey);
      }

      // Get current database stats
      const earningsStats = database.getEarningsStats(effectiveAddress);
      const calculatedStats = database.calculateUserStats(effectiveAddress);
      
      setTotalLinks(calculatedStats.totalLinks);
      setTotalPurchases(calculatedStats.totalPurchases);

      if (jwtToken) {
        try {
          // Fetch latest proxy402 data
          const response = await fetch('/api/proxy402/dashboard/stats', {
            headers: {
              'Authorization': `Bearer ${jwtToken}`
            }
          });

          if (response.ok) {
            const stats: DashboardStats = await response.json();
            const proxy402Revenue = (stats.total_earnings || 0) / 100;
            
            // Update database with latest proxy402 data
            database.updateEarningsStats(effectiveAddress, {
              proxy402Revenue,
              totalPurchases: stats.total_purchases || 0,
            });

            // Recalculate total with updated data
            const updatedStats = database.calculateUserStats(effectiveAddress);
            const newBalance = updatedStats.totalEarnings.toFixed(2);
            setBalance(newBalance);
            setTotalPurchases(updatedStats.totalPurchases);
            
            // Calculate 24h change using the new balance
            const previousBalance = parseFloat(localStorage.getItem(`prev_balance_${effectiveAddress}`) || '0');
            const currentBalance = parseFloat(newBalance);
            const change = currentBalance - previousBalance;
            setChange24h(change);
            
            // Store current balance for next comparison
            localStorage.setItem(`prev_balance_${effectiveAddress}`, currentBalance.toString());
          } else {
            // Use database data if API fails
            const dbBalance = calculatedStats.totalEarnings.toFixed(2);
            setBalance(dbBalance);
            
            // Calculate 24h change using database balance
            const previousBalance = parseFloat(localStorage.getItem(`prev_balance_${effectiveAddress}`) || '0');
            const currentBalance = parseFloat(dbBalance);
            const change = currentBalance - previousBalance;
            setChange24h(change);
            
            // Store current balance for next comparison
            localStorage.setItem(`prev_balance_${effectiveAddress}`, currentBalance.toString());
          }
        } catch (apiError) {
          console.warn('Proxy402 API error, using database data:', apiError);
          const dbBalance = calculatedStats.totalEarnings.toFixed(2);
          setBalance(dbBalance);
          
          // Calculate 24h change using database balance
          const previousBalance = parseFloat(localStorage.getItem(`prev_balance_${effectiveAddress}`) || '0');
          const currentBalance = parseFloat(dbBalance);
          const change = currentBalance - previousBalance;
          setChange24h(change);
          
          // Store current balance for next comparison
          localStorage.setItem(`prev_balance_${effectiveAddress}`, currentBalance.toString());
        }
      } else {
        // No JWT, use database data only
        const dbBalance = calculatedStats.totalEarnings.toFixed(2);
        setBalance(dbBalance);
        
        // Calculate 24h change using database balance
        const previousBalance = parseFloat(localStorage.getItem(`prev_balance_${effectiveAddress}`) || '0');
        const currentBalance = parseFloat(dbBalance);
        const change = currentBalance - previousBalance;
        setChange24h(change);
        
        // Store current balance for next comparison
        localStorage.setItem(`prev_balance_${effectiveAddress}`, currentBalance.toString());
      }

      setLastFetched(new Date());
    } catch (err) {
      console.error('Error fetching earnings:', err);
      setError('Failed to fetch earnings data');
      
      // Fallback to database
      const calculatedStats = database.calculateUserStats(effectiveAddress);
      const dbBalance = calculatedStats.totalEarnings.toFixed(2);
      setBalance(dbBalance);
      setTotalLinks(calculatedStats.totalLinks);
      setTotalPurchases(calculatedStats.totalPurchases);
      
      // Calculate 24h change using database balance
      const previousBalance = parseFloat(localStorage.getItem(`prev_balance_${effectiveAddress}`) || '0');
      const currentBalance = parseFloat(dbBalance);
      const change = currentBalance - previousBalance;
      setChange24h(change);
      
      // Store current balance for next comparison
      localStorage.setItem(`prev_balance_${effectiveAddress}`, currentBalance.toString());
    } finally {
      setLoading(false);
    }
  };

  // Auto-fetch data on component mount and when address changes
  useEffect(() => {
    if (effectiveAddress) {
      fetchEarningsData();
    }
  }, [effectiveAddress]);

  // Also fetch when user data in database changes (e.g., JWT token updated)
  useEffect(() => {
    if (effectiveAddress) {
      const userData = database.getUser(effectiveAddress);
      if (userData?.jwtToken) {
        // If there's a JWT token, refetch the data
        fetchEarningsData();
      }
    }
  }, [effectiveAddress]);

  // Listen for custom refresh events
  useEffect(() => {
    const handleRefreshEvent = () => {
      if (effectiveAddress) {
        console.log('Earnings refresh event received');
        fetchEarningsData();
      }
    };

    window.addEventListener('proxy402-earnings-refresh', handleRefreshEvent);
    return () => {
      window.removeEventListener('proxy402-earnings-refresh', handleRefreshEvent);
    };
  }, [effectiveAddress]);

  // Refresh data every 5 minutes
  useEffect(() => {
    if (effectiveAddress && !compact) { // Only auto-refresh for non-compact version
      const interval = setInterval(fetchEarningsData, 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [effectiveAddress, compact]);

  // Handle manual refresh
  const handleRefresh = () => {
    fetchEarningsData();
  };

  // Handle earnings display toggle
  const toggleVisibility = () => {
    setIsHidden(!isHidden);
  };

  // Handle show chart
  const handleShowChart = () => {
    if (onShowChart) {
      onShowChart();
    }
  };

  if (!isAnyConnectionType) {
    return compact ? (
      <div className="bg-gradient-to-r from-green-900/20 to-emerald-900/20 border border-green-600/30 rounded-lg px-3 py-2">
        <div className="flex items-center text-gray-400 text-sm">
          <DollarSign className="h-4 w-4 mr-1" />
          <span>Connect wallet</span>
        </div>
      </div>
    ) : (
      <div className="bg-gradient-to-r from-green-900/20 to-emerald-900/20 border border-green-600/30 rounded-lg p-4">
        <div className="flex items-center justify-center text-gray-400">
          <span className="text-sm">Connect wallet to view earnings</span>
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="bg-gradient-to-r from-green-900/20 to-emerald-900/20 border border-green-600/30 rounded-lg px-3 py-2">
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-green-400" />
          <span className="text-green-400 font-semibold text-sm">
            {isHidden ? '••••••' : `$${balance}`}
          </span>
          <button
            onClick={toggleVisibility}
            className="text-green-400 hover:text-green-300 transition-colors"
            title={isHidden ? 'Show amount' : 'Hide amount'}
          >
            {isHidden ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          </button>
          
          {change24h !== 0 && (
            <div className="flex items-center gap-1 text-xs">
              <TrendingUp className={`h-3 w-3 ${change24h >= 0 ? 'text-green-400' : 'text-red-400'}`} />
              <span className={change24h >= 0 ? 'text-green-400' : 'text-red-400'}>
                {change24h >= 0 ? '+' : ''}{change24h.toFixed(2)}
              </span>
            </div>
          )}
          
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="text-green-400 hover:text-green-300 transition-colors disabled:opacity-50"
            title="Refresh earnings"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          </button>
          
          <button
            onClick={handleShowChart}
            className="bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded text-xs font-semibold transition-colors flex items-center gap-1"
          >
            <Plus className="h-3 w-3" />
            View
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-green-900/20 to-emerald-900/20 border border-green-600/30 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-green-400" />
            <span className="text-green-400 font-semibold">
              {isHidden ? '••••••' : `$${balance}`}
            </span>
            <button
              onClick={toggleVisibility}
              className="text-green-400 hover:text-green-300 transition-colors"
              title={isHidden ? 'Show amount' : 'Hide amount'}
            >
              {isHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
          </div>
          
          <div className="flex items-center gap-1 text-sm">
            <TrendingUp className={`h-4 w-4 ${change24h >= 0 ? 'text-green-400' : 'text-red-400'}`} />
            <span className={change24h >= 0 ? 'text-green-400' : 'text-red-400'}>
              {change24h >= 0 ? '+' : ''}{change24h.toFixed(2)}
            </span>
            <span className="text-gray-400">24h</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Refresh button */}
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="text-green-400 hover:text-green-300 transition-colors disabled:opacity-50"
            title="Refresh earnings data"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {/* Show chart button */}
    <button
            onClick={handleShowChart}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2"
          >
            <DollarSign className="h-4 w-4" />
            Earnings
          </button>
        </div>
      </div>

      {/* Extended stats for non-compact version */}
      <div className="mt-3 grid grid-cols-3 gap-4 text-xs">
        <div className="text-center">
          <div className="text-green-400 font-semibold">{totalLinks}</div>
          <div className="text-gray-500">Links Created</div>
        </div>
        <div className="text-center">
          <div className="text-green-400 font-semibold">{totalPurchases}</div>
          <div className="text-gray-500">Total Purchases</div>
        </div>
        <div className="text-center">
          <div className="text-green-400 font-semibold">
            {lastFetched ? lastFetched.toLocaleTimeString() : 'Never'}
          </div>
          <div className="text-gray-500">Last Updated</div>
        </div>
      </div>

      {/* Status info */}
      <div className="mt-3 flex items-center justify-between text-xs">
        <div className="flex items-center gap-4">
          {error && (
            <span className="text-red-400">
              {error}
            </span>
          )}
        </div>
        
        {client?.inboxId && (
          <span className="text-gray-500">
            XMTP: {client.inboxId.slice(0, 8)}...
          </span>
        )}
      </div>
    </div>
  );
} 