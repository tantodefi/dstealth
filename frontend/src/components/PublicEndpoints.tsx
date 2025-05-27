import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';

interface Endpoint {
  url: string;
  price: number;
  description: string;
  owner: string;
  endpointId: string;
}

export const PublicEndpoints: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [claimedFkeyId, setClaimedFkeyId] = useState<string | null>(null);

  useEffect(() => {
    // Check for claimed fkey.id
    const fkeyId = localStorage.getItem('fkey:id');
    setClaimedFkeyId(fkeyId);
  }, []);

  useEffect(() => {
    const fetchEndpoints = async () => {
      // Only fetch if wallet is connected and has claimed fkey.id
      if (!isConnected || !address || !claimedFkeyId) {
        setEndpoints([]);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        console.log('Fetching public endpoints...');
        
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';
        const response = await fetch(`${backendUrl}/api/personal-data/endpoints/${address}`);
        const text = await response.text();
        
        try {
          // Try to parse the response as JSON
          const data = JSON.parse(text);
          console.log('Endpoints response:', data);
          
          if (!response.ok) {
            throw new Error(data.error || `HTTP error! status: ${response.status}`);
          }
          
          if (!data.success) {
            throw new Error(data.error || 'Failed to fetch endpoints');
          }
          
          setEndpoints(data.endpoints || []);
        } catch (parseError) {
          console.error('Failed to parse response:', text);
          throw new Error('Invalid response format from server');
        }
      } catch (error) {
        console.error('Error fetching endpoints:', error);
        setError(error instanceof Error ? error.message : 'Failed to fetch endpoints');
      } finally {
        setIsLoading(false);
      }
    };

    fetchEndpoints();
  }, [isConnected, address, claimedFkeyId]);

  // Don't render anything if not connected or no claimed fkey.id
  if (!isConnected || !address || !claimedFkeyId) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="bg-gray-800 rounded-lg p-4 mb-4">
        <div className="animate-pulse flex space-x-4">
          <div className="flex-1 space-y-4 py-1">
            <div className="h-4 bg-gray-700 rounded w-3/4"></div>
            <div className="space-y-2">
              <div className="h-4 bg-gray-700 rounded"></div>
              <div className="h-4 bg-gray-700 rounded w-5/6"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-500/20 rounded-lg p-4 mb-4">
        <p className="text-red-400 text-sm">Error loading endpoints: {error}</p>
      </div>
    );
  }

  if (!endpoints.length) {
    return (
      <div className="bg-gray-800 rounded-lg p-4 mb-4">
        <p className="text-gray-400 text-sm">No endpoints found for your fkey.id</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden mb-4">
      <div
        className="p-4 bg-gray-700 cursor-pointer flex justify-between items-center"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h3 className="text-white font-medium">My Endpoints for {claimedFkeyId}.fkey.id</h3>
        <span className="text-gray-400">{isExpanded ? '▼' : '▶'}</span>
      </div>
      
      {isExpanded && (
        <div className="p-4 space-y-4">
          {endpoints.map((endpoint) => (
            <div
              key={endpoint.endpointId}
              className="border border-gray-700 rounded p-3 space-y-2"
            >
              <div className="flex justify-between items-start">
                <div className="break-all">
                  <p className="text-white text-sm font-medium">{endpoint.url}</p>
                  <p className="text-gray-400 text-xs mt-1">{endpoint.description || 'No description'}</p>
                </div>
                <span className="text-green-400 text-sm font-medium ml-4">
                  ${endpoint.price.toFixed(2)}
                </span>
              </div>
              <div className="text-gray-500 text-xs">
                Owner: {endpoint.owner}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}; 