import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { storage } from "@/lib/storage";

interface Endpoint {
  url: string;
  price: number;
  description: string;
  endpointId?: string;
}

interface NewEndpoint {
  url: string;
  price: number;
  description: string;
}

export const MyEndpoints: React.FC<{
  fkeyId?: string;
  onClaimMe?: () => void;
}> = ({ fkeyId, onClaimMe }) => {
  const { address } = useAccount();
  const [isExpanded, setIsExpanded] = useState(true);
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [storedFkeyId, setStoredFkeyId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newEndpoint, setNewEndpoint] = useState<NewEndpoint>({
    url: '',
    price: 0.01,
    description: ''
  });

  // Load stored fkey.id and endpoints on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('fkey:id');
      if (stored) {
        setStoredFkeyId(stored);
        void fetchEndpoints(stored);
      }
    } catch (e) {
      console.error('Error loading stored fkey.id:', e);
    }
  }, []);

  const fetchEndpoints = async (owner: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';
      const response = await fetch(`${backendUrl}/api/personal-data/endpoints/${owner}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch endpoints');
      }
      
      setEndpoints(data.endpoints || []);
    } catch (e) {
      console.error('Error fetching endpoints:', e);
      setError(e instanceof Error ? e.message : 'Failed to fetch endpoints');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateEndpoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address) return;

    try {
      setIsLoading(true);
      setError(null);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';
      const response = await fetch(`${backendUrl}/api/personal-data/endpoints`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...newEndpoint,
          owner: address
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to create endpoint');
      }

      // Increment endpoints stat
      storage.incrementEndpoints();

      // Reset form and refresh endpoints
      setNewEndpoint({
        url: '',
        price: 0.01,
        description: ''
      });
      await fetchEndpoints(address);
    } catch (e) {
      console.error('Error creating endpoint:', e);
      setError(e instanceof Error ? e.message : 'Failed to create endpoint');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle claiming this fkey.id as mine
  const handleClaimMe = async () => {
    if (!fkeyId || !address) return;

    try {
      localStorage.setItem('fkey:id', fkeyId);
      setStoredFkeyId(fkeyId);
      
      // Create default endpoints
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';
      await Promise.all([
        fetch(`${backendUrl}/api/personal-data/endpoints`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: `/api/address/${address}/stealth`,
            price: 0.01,
            description: 'Stealth pay me URL',
            owner: address
          })
        }).then(() => storage.incrementEndpoints()),
        fetch(`${backendUrl}/api/personal-data/endpoints`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: `/api/address/${address}/fkey`,
            price: 0.01,
            description: 'Public data endpoint',
            owner: address
          })
        }).then(() => storage.incrementEndpoints())
      ]);

      // Refresh endpoints
      await fetchEndpoints(address);

      if (onClaimMe) {
        onClaimMe();
      }
    } catch (e) {
      console.error('Error storing fkey.id:', e);
      setError(e instanceof Error ? e.message : 'Failed to claim fkey.id');
    }
  };

  if (!fkeyId) {
    return null;
  }

  const isMe = storedFkeyId === fkeyId;

  return (
    <div className="mt-4">
      {!isMe && (
        <button
          onClick={handleClaimMe}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          This is me
        </button>
      )}

      {isMe && (
        <div className="border rounded-lg overflow-hidden">
          <div
            className="flex items-center justify-between p-4 bg-gray-50 cursor-pointer"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <h3 className="text-lg font-medium">My Endpoints</h3>
            <button className="text-gray-500">
              {isExpanded ? '▼' : '▶'}
            </button>
          </div>

          {isExpanded && (
            <div className="p-4">
              {error && (
                <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
                  {error}
                </div>
              )}

              {/* Create new endpoint form */}
              <form onSubmit={handleCreateEndpoint} className="mb-6 p-4 bg-gray-50 rounded">
                <h4 className="text-sm font-medium mb-4">Create New Endpoint</h4>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      URL
                    </label>
                    <input
                      type="text"
                      value={newEndpoint.url}
                      onChange={(e) => setNewEndpoint(prev => ({ ...prev, url: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border rounded"
                      placeholder="https://example.com/api/data"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Price (USD)
                    </label>
                    <input
                      type="number"
                      value={newEndpoint.price}
                      onChange={(e) => setNewEndpoint(prev => ({ ...prev, price: parseFloat(e.target.value) }))}
                      className="w-full px-3 py-2 text-sm border rounded"
                      min="0.01"
                      step="0.01"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <input
                      type="text"
                      value={newEndpoint.description}
                      onChange={(e) => setNewEndpoint(prev => ({ ...prev, description: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border rounded"
                      placeholder="Describe what this endpoint provides"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                  >
                    {isLoading ? 'Creating...' : 'Create Endpoint'}
                  </button>
                </div>
              </form>

              {/* Existing endpoints list */}
              {isLoading ? (
                <div className="animate-pulse space-y-4">
                  <div className="h-20 bg-gray-100 rounded"></div>
                  <div className="h-20 bg-gray-100 rounded"></div>
                </div>
              ) : endpoints.length > 0 ? (
                endpoints.map((endpoint, index) => (
                  <div key={endpoint.endpointId || index} className="mb-4 last:mb-0">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-medium">{endpoint.description}</div>
                      <div className="text-sm text-gray-500">${endpoint.price.toFixed(2)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={endpoint.url}
                        readOnly
                        className="flex-1 px-3 py-2 text-sm bg-gray-50 rounded border"
                      />
                      <button
                        onClick={() => navigator.clipboard.writeText(endpoint.url)}
                        className="px-3 py-2 text-sm text-blue-600 hover:text-blue-800"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-gray-500">
                  No endpoints created yet. Use the form above to create one.
                </div>
              )}

              <div className="mt-4 text-sm text-gray-500">
                Endpoints are priced per request and payments are processed using the x402 protocol.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}; 