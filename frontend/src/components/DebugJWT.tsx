'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { database } from '@/lib/database';
import { Button } from '@/components/Button';
import { ChevronDown, ChevronUp } from 'lucide-react';

export function DebugJWT() {
  const { address, isConnected } = useAccount();
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [testJWT, setTestJWT] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  const refreshDebugInfo = () => {
    if (!address) return;
    
    const userData = database.getUser(address);
    const earningsStats = database.getEarningsStats(address);
    const allLocalStorageKeys = Object.keys(localStorage).filter(key => 
      key.includes('xmtp_app_') && key.includes(address.toLowerCase())
    );
    
    setDebugInfo({
      address,
      addressLowerCase: address.toLowerCase(),
      userData,
      earningsStats,
      jwtFromLocalStorage: localStorage.getItem('fkey:jwt'),
      allRelatedKeys: allLocalStorageKeys,
    });
  };

  useEffect(() => {
    if (address) {
      refreshDebugInfo();
    }
  }, [address]);

  const saveTestJWT = async () => {
    if (!address || !testJWT) return;
    
    try {
      await database.createOrUpdateUser({
        address,
        jwtToken: testJWT,
      });
      
      // Also save to localStorage for backward compatibility
      localStorage.setItem('fkey:jwt', testJWT);
      
      console.log('✅ Test JWT saved successfully');
      refreshDebugInfo();
    } catch (error) {
      console.error('❌ Error saving test JWT:', error);
    }
  };

  const clearData = () => {
    if (!address) return;
    
    database.clearUserData(address);
    localStorage.removeItem('fkey:jwt');
    localStorage.removeItem('fkey:username');
    localStorage.removeItem('convos:username');
    
    refreshDebugInfo();
  };

  if (!isConnected) {
    return null;
  }

  return (
    <div className="bg-gray-800 border border-gray-600 rounded-lg m-4 max-w-4xl">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-gray-700/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-white text-lg font-semibold">🔍 JWT Debug Panel</span>
          <span className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded">Developer Tools</span>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-5 w-5 text-gray-400" />
        ) : (
          <ChevronDown className="h-5 w-5 text-gray-400" />
        )}
      </button>

      {/* Expandable Content */}
      {isExpanded && (
        <div className="p-4 border-t border-gray-600 space-y-4">
          {/* Test JWT Input */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Test JWT Token
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={testJWT}
                onChange={(e) => setTestJWT(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                className="flex-1 p-2 bg-gray-700 border border-gray-600 rounded text-white text-sm"
              />
              <Button
                onClick={saveTestJWT}
                disabled={!testJWT}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm"
              >
                Save Test JWT
              </Button>
            </div>
          </div>

          {/* Debug Information */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <h4 className="text-white font-medium">Debug Information</h4>
              <div className="space-x-2">
                <Button
                  onClick={refreshDebugInfo}
                  className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm"
                >
                  Refresh
                </Button>
                <Button
                  onClick={clearData}
                  className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm"
                >
                  Clear Data
                </Button>
              </div>
            </div>
            
            {debugInfo && (
              <pre className="bg-gray-900 border border-gray-700 rounded p-3 text-xs text-gray-300 overflow-auto max-h-96">
                {JSON.stringify(debugInfo, null, 2)}
              </pre>
            )}
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-gray-700 rounded p-3">
              <h5 className="text-white font-medium mb-1">Current Status</h5>
              <p className="text-gray-300">
                Address: {address?.slice(0, 8)}...{address?.slice(-4)}
              </p>
              <p className="text-gray-300">
                JWT in DB: {debugInfo?.userData?.jwtToken ? '✅ Found' : '❌ Missing'}
              </p>
              <p className="text-gray-300">
                JWT in localStorage: {debugInfo?.jwtFromLocalStorage ? '✅ Found' : '❌ Missing'}
              </p>
            </div>
            
            <div className="bg-gray-700 rounded p-3">
              <h5 className="text-white font-medium mb-1">Related Keys</h5>
              <p className="text-gray-300">
                DB Keys: {debugInfo?.allRelatedKeys?.length || 0}
              </p>
              <p className="text-gray-300">
                Earnings Stats: {debugInfo?.earningsStats ? '✅ Found' : '❌ Missing'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 