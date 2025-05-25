import { useState, useEffect } from "react";
import { getPortfolios } from '@coinbase/onchainkit/api';
import { formatUnits } from 'viem';
import { useXMTP } from '@/context/xmtp-context';
import ConvosChat from "./ConvosChat";
import { storage } from "@/lib/storage";
import { Stats } from "./Stats";
import { CollapsibleConnectionInfo } from "./CollapsibleConnectionInfo";

interface Token {
  symbol: string;
  name: string;
  balance: string;
  decimals: number;
  address?: string;
  value: number;
}

interface PortfolioToken {
  symbol: string;
  name: string;
  balance: string;
  decimals: number;
  address?: string;
  value?: number;
}

interface FkeyProfile {
  address: string;
  qrCode?: string;
  name?: string;
  isRegistered: boolean;
  error?: string;
}

const DEFAULT_TOKENS: Token[] = [
  {
    symbol: 'ETH',
    name: 'Ethereum',
    balance: '0',
    decimals: 18,
    value: 0
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    balance: '0',
    decimals: 6,
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Base USDC
    value: 0
  }
];

export function FkeySearch() {
  const { client } = useXMTP();
  const [username, setUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<FkeyProfile | null>(null);
  const [amount, setAmount] = useState('');
  const [selectedToken, setSelectedToken] = useState<Token>(DEFAULT_TOKENS[0]);
  const [availableTokens, setAvailableTokens] = useState<Token[]>(DEFAULT_TOKENS);
  const [isLoadingTokens, setIsLoadingTokens] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [convosData, setConvosData] = useState<{
    xmtpId: string;
    username: string;
    url: string;
    profile: {
      name: string;
      username: string;
      description: string | null;
      avatar: string;
      address: string;
    };
  } | null>(null);

  useEffect(() => {
    async function fetchPortfolio() {
      if (!client?.signer) return;

      try {
        setIsLoadingTokens(true);
        // Get the address from the XMTP client's signer identifier
        const identifier = await client.signer.getIdentifier();
        if (identifier.identifierKind === 'Ethereum') {
          const response = await getPortfolios({
            addresses: [identifier.identifier as `0x${string}`],
          });

          // Check if response is an error
          if ('error' in response) {
            console.error('API Error:', response.error);
            return;
          }

          const portfolio = response.portfolios?.[0];
          if (portfolio?.tokens) {
            const userTokens = portfolio.tokens.map((token: PortfolioToken) => ({
              symbol: token.symbol,
              name: token.name,
              balance: token.balance,
              decimals: token.decimals,
              address: token.address,
              value: token.value || 0
            }));

            // Merge with default tokens, preferring user balances when available
            const mergedTokens = DEFAULT_TOKENS.map(defaultToken => {
              const userToken = userTokens.find((t: Token) => t.symbol === defaultToken.symbol);
              return userToken || defaultToken;
            });

            // Add any additional tokens the user has
            const additionalTokens = userTokens.filter(
              (token: Token) => !DEFAULT_TOKENS.some(d => d.symbol === token.symbol)
            );

            setAvailableTokens([...mergedTokens, ...additionalTokens]);
          }
        } else {
          console.error('Unexpected identifier kind:', identifier.identifierKind);
        }
      } catch (error) {
        console.error('Error fetching portfolio:', error);
      } finally {
        setIsLoadingTokens(false);
      }
    }

    fetchPortfolio();
  }, [client]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username) return;

    setIsLoading(true);
    setError(null);
    setProfile(null);
    setConvosData(null); // Reset convos data when starting new search

    try {
      // First try fkey.id lookup
      let fkeyProfile = null;
      try {
        const response = await fetch(`/api/fkey/lookup/${username}`);
        const data = await response.json();
        
        if (response.ok && data.address) {
          fkeyProfile = data;
          setProfile(data);
        }
      } catch (fkeyError) {
        console.error('fkey.id lookup error:', fkeyError);
        // Don't set error - we'll continue with convos lookup
      }

      // Always try convos lookup
      try {
        const convosResponse = await fetch(`/api/convos/lookup/${username}`);
        const convosData = await convosResponse.json();
        
        if (convosData.success && convosData.xmtpId) {
          const convosProfile = {
            xmtpId: convosData.xmtpId,
            username: convosData.username,
            url: convosData.url,
            profile: convosData.profile
          };
          setConvosData(convosProfile);

          // If no fkey profile was found, show the suggestion message
          if (!fkeyProfile) {
            setError("fluidkey user not found");
            // Create personalized invite message
            const inviteMessage = `👋 hey ${convosProfile.profile.name || convosProfile.username}, check out fluidkey.com for better web3 privacy`;
            
            console.log("Dispatching invite message:", inviteMessage);
            
            // Dispatch event to pre-fill the message input
            window.dispatchEvent(new CustomEvent('setInviteMessage', { 
              detail: { message: inviteMessage }
            }));

            // Double-check event dispatch with a timeout
            setTimeout(() => {
              console.log("Re-dispatching invite message after delay");
              window.dispatchEvent(new CustomEvent('setInviteMessage', { 
                detail: { message: inviteMessage }
              }));
            }, 1000); // Try again after 1 second
          }
        } else if (!fkeyProfile) {
          // Only show error if neither lookup succeeded
          setError("No profile found on fkey.id or convos.org");
        }
      } catch (convosError) {
        console.error('Error looking up convos:', convosError);
        if (!fkeyProfile) {
          setError("Failed to lookup profiles");
        }
      }

    } catch (error) {
      console.error('Search error:', error);
      setError(error instanceof Error ? error.message : 'Failed to lookup profile');
      setProfile(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.address) return;
    
    try {
      // TODO: Implement send transaction
      console.log('Sending', amount, selectedToken.symbol, 'to', profile.address);
      
      // For now, simulate a successful payment
      // In real implementation, this would be after transaction confirmation
      storage.incrementStealthPayments();
    } catch (error) {
      console.error('Payment error:', error);
    }
  };

  return (
    <div className="w-full flex flex-col gap-3">
      <CollapsibleConnectionInfo onConnectionChange={setIsConnected} />
      <Stats />
      <div className="w-full max-w-md mx-auto p-4">
        <div className={`bg-gray-900 rounded-lg p-6 border ${error?.includes('💡') ? 'border-yellow-500' : error ? 'border-red-500' : profile?.address ? 'border-green-500' : 'border-gray-800'}`}>
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="flex items-center">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  placeholder="username"
                  className="w-full bg-gray-800 border border-gray-700 rounded-l-md px-3 py-2 text-white pr-16"
                />
                <span className="absolute right-0 top-0 bottom-0 flex items-center px-3 text-gray-400 bg-gray-800 border-l border-gray-700">
                  .fkey.id
                </span>
              </div>
              <button
                type="submit"
                disabled={!username || isLoading}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-r-md">
                {isLoading ? '...' : 'Search'}
              </button>
            </div>

            {error && (
              <div className={`text-sm mt-2 ${error.includes('💡') ? 'text-yellow-500' : 'text-red-500'}`}>
                {error}
              </div>
            )}

            {profile?.address && (
              <div className="mt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-white font-medium flex items-center gap-2">
                      {profile.name || username}
                      <span className="text-green-500 text-lg">✓</span>
                      <span className="text-gray-400 text-sm">.fkey.id</span>
                    </h3>
                    <p className="text-gray-400 text-sm break-all">
                      {profile.address}
                    </p>
                  </div>
                  {profile.qrCode && (
                    <img
                      src={profile.qrCode}
                      alt="QR Code"
                      className="w-24 h-24"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Token
                  </label>
                  <select
                    value={selectedToken.symbol}
                    onChange={(e) => {
                      const token = availableTokens.find(t => t.symbol === e.target.value);
                      if (token) setSelectedToken(token);
                    }}
                    className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-white">
                    {availableTokens.map((token) => (
                      <option key={token.symbol} value={token.symbol}>
                        {token.symbol} - Balance: {formatUnits(BigInt(token.balance || '0'), token.decimals)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Amount
                  </label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-white"
                    step="any"
                  />
                </div>

                <button
                  onClick={handlePaymentSubmit}
                  disabled={!amount || isLoadingTokens || !client}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white font-bold py-2 px-4 rounded">
                  {isLoadingTokens ? 'Loading Tokens...' : client ? 'Send Payment' : 'Connect Wallet to Send'}
                </button>
              </div>
            )}
          </form>
        </div>
      </div>

      {/* Render ConvosChat if we have convos data */}
      {convosData && (
        <>
          {!profile?.address && (
            <div className="w-full max-w-md mx-auto px-4 mb-2">
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 text-sm text-yellow-200">
                <p>💡 Click the message input below to send an invite to {convosData.profile.name || convosData.username}</p>
              </div>
            </div>
          )}
          <ConvosChat
            xmtpId={convosData.xmtpId}
            username={convosData.username}
            url={convosData.url}
            profile={convosData.profile}
          />
        </>
      )}
    </div>
  );
} 