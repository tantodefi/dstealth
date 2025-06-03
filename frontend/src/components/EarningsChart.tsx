"use client";

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useAccount } from 'wagmi';

interface DailyStats {
  date: string;
  test_earnings: number;
  test_count: number;
  real_earnings: number;
  real_count: number;
}

interface DashboardStats {
  total_earnings?: number;
  total_purchases?: number;
  test_earnings: number;
  test_purchases: number;
  real_earnings: number;
  real_purchases: number;
  daily_purchases: DailyStats[];
}

interface EarningsChartProps {
  onClose: () => void;
}

export function EarningsChart({ onClose }: EarningsChartProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  const { address, isConnected } = useAccount();

  // Get user-specific JWT key
  const getJWTKey = (userAddress: string) => `proxy402_jwt_${userAddress.toLowerCase()}`;

  useEffect(() => {
    fetchEarningsData();
  }, [address, isConnected]);

  const fetchEarningsData = async () => {
    try {
      if (!isConnected || !address) {
        setError('Please connect your wallet first.');
        setLoading(false);
        return;
      }

      const jwtKey = getJWTKey(address);
      const jwt = localStorage.getItem(jwtKey);
      
      if (!jwt) {
        setError('No JWT token found for this wallet. Please configure Proxy402 in settings.');
        setLoading(false);
        return;
      }

      const response = await fetch('/api/proxy402/dashboard/stats', {
        headers: {
          'Authorization': `Bearer ${jwt}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch earnings data:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch earnings data');
    } finally {
      setLoading(false);
    }
  };

  const renderChart = () => {
    if (!stats || !stats.daily_purchases || stats.daily_purchases.length === 0) {
      return (
        <div className="text-center text-gray-400 py-8">
          No earnings data available
        </div>
      );
    }

    const data = stats.daily_purchases;
    const maxEarnings = Math.max(...data.map(d => d.test_earnings + d.real_earnings));
    const chartWidth = 320;
    const chartHeight = 160;
    const padding = 30;

    if (maxEarnings === 0) {
      return (
        <div className="text-center text-gray-400 py-8">
          No earnings to display
        </div>
      );
    }

    return (
      <div className="w-full">
        <svg width={chartWidth} height={chartHeight + padding * 2} viewBox={`0 0 ${chartWidth} ${chartHeight + padding * 2}`} className="w-full max-w-full">
          {/* Chart background */}
          <rect x={0} y={0} width={chartWidth} height={chartHeight + padding * 2} fill="transparent" />
          
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
            const y = padding + (chartHeight * ratio);
            return (
              <g key={i}>
                <line 
                  x1={padding} 
                  y1={y} 
                  x2={chartWidth - padding} 
                  y2={y} 
                  stroke="#374151" 
                  strokeWidth="1"
                  strokeDasharray={i === 0 ? "none" : "2,2"}
                />
                <text 
                  x={padding - 5} 
                  y={y + 4} 
                  fill="#9CA3AF" 
                  fontSize="9" 
                  textAnchor="end"
                >
                  ${(maxEarnings * (1 - ratio)).toFixed(2)}
                </text>
              </g>
            );
          })}

          {/* Bars */}
          {data.map((day, index) => {
            const totalEarnings = day.test_earnings + day.real_earnings;
            const barWidth = (chartWidth - padding * 2) / data.length * 0.8;
            const barHeight = (totalEarnings / maxEarnings) * chartHeight;
            const x = padding + (index * (chartWidth - padding * 2) / data.length) + (barWidth * 0.1);
            const y = padding + chartHeight - barHeight;

            return (
              <g key={day.date}>
                {/* Test earnings (lighter color) */}
                {day.test_earnings > 0 && (
                  <rect
                    x={x}
                    y={y + (day.real_earnings / totalEarnings) * barHeight}
                    width={barWidth}
                    height={(day.test_earnings / totalEarnings) * barHeight}
                    fill="#60A5FA"
                    opacity={0.7}
                  />
                )}
                
                {/* Real earnings (darker color) */}
                {day.real_earnings > 0 && (
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={(day.real_earnings / totalEarnings) * barHeight}
                    fill="#10B981"
                  />
                )}
                
                {/* Date label */}
                <text
                  x={x + barWidth / 2}
                  y={padding + chartHeight + 15}
                  fill="#9CA3AF"
                  fontSize="8"
                  textAnchor="middle"
                  transform={`rotate(-45, ${x + barWidth / 2}, ${padding + chartHeight + 15})`}
                >
                  {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Legend */}
        <div className="flex justify-center gap-3 mt-3 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-green-500 rounded"></div>
            <span className="text-gray-300">Real Earnings</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-blue-400 rounded opacity-70"></div>
            <span className="text-gray-300">Test Earnings</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 max-h-[70vh] overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div>
          <h3 className="text-lg font-semibold text-white">Earnings Dashboard</h3>
          <p className="text-gray-400 text-sm">Last 7 days earnings from Proxy402</p>
          {address && (
            <p className="text-gray-500 text-xs">
              Wallet: {address.slice(0, 6)}...{address.slice(-4)}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white p-1"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="p-4">
        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
            <p className="text-gray-400 mt-2">Loading earnings data...</p>
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-red-400 mb-2">❌ {error}</p>
            <button
              onClick={fetchEarningsData}
              className="text-blue-400 hover:text-blue-300 underline"
            >
              Try Again
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary Stats */}
            {stats && (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-900 rounded p-3 text-center">
                  <div className="text-lg font-bold text-green-400">
                    ${((stats.real_earnings || 0) / 100).toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-400">Real Earnings</div>
                </div>
                <div className="bg-gray-900 rounded p-3 text-center">
                  <div className="text-lg font-bold text-blue-400">
                    ${((stats.test_earnings || 0) / 100).toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-400">Test Earnings</div>
                </div>
                <div className="bg-gray-900 rounded p-3 text-center">
                  <div className="text-lg font-bold text-white">
                    {stats.real_purchases || 0}
                  </div>
                  <div className="text-xs text-gray-400">Real Purchases</div>
                </div>
                <div className="bg-gray-900 rounded p-3 text-center">
                  <div className="text-lg font-bold text-white">
                    {stats.test_purchases || 0}
                  </div>
                  <div className="text-xs text-gray-400">Test Purchases</div>
                </div>
              </div>
            )}

            {/* Chart */}
            <div className="bg-gray-900 rounded p-3">
              <h4 className="text-md font-medium text-white mb-3">Daily Earnings</h4>
              {renderChart()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 