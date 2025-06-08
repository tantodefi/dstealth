import { useEffect, useState, useCallback } from 'react';
import { TokenSelectDropdown, type Token } from '@coinbase/onchainkit/token';
import { Transaction } from '@coinbase/onchainkit/transaction';
import { getPortfolios } from '@coinbase/onchainkit/api';
import { useAccount } from 'wagmi';
import { useChainId } from 'wagmi';
import { parseEther } from 'viem';

interface TokenData {
  name: string;
  symbol: string;
  address: string;
  decimals: number;
  image?: string;
  chainId?: number;
  balance?: string;
}

export const TokenDropdown: React.FC<{
  fkeyId?: string; // The resolved .fkey.id address
  onTokenSelect?: (token: Token) => void;
  onReset?: () => void;
  onError?: (error: Error) => void;
}> = ({ fkeyId, onTokenSelect, onReset, onError }) => {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const [tokens, setTokens] = useState<Token[]>([]);
  const [selectedToken, setSelectedToken] = useState<Token | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Fetch portfolio with retry logic
  const fetchPortfolio = useCallback(async () => {
    if (!address) {
      setTokens([]);
      setError(null);
      return;
    }
    
    setLoading(true);
    setError(null);
    try {
      console.log("Fetching portfolio for address:", address);
      const response = await getPortfolios({
        addresses: [address],
      });
      
      if ('portfolios' in response && response.portfolios?.[0]) {
        console.log("Portfolio response:", response.portfolios[0]);
        // Extract tokens from the response, handling both possible formats
        const rawTokens = (response.portfolios[0] as any).tokens || 
                        (response.portfolios[0] as any).assets || [];
        
        const portfolioTokens = rawTokens
          .filter((token: TokenData): token is TokenData => 
            !!token && typeof token.address === 'string' && 
            typeof token.symbol === 'string' && 
            typeof token.decimals === 'number'
          )
          .map((token: TokenData) => ({
            name: token.name || token.symbol,
            symbol: token.symbol,
            address: token.address as `0x${string}`,
            decimals: token.decimals,
            image: token.image || null,
            chainId: token.chainId || chainId || 1, // Use connected chain or default to mainnet
            balance: token.balance || "0",
          } as Token));
        
        console.log("Processed tokens:", portfolioTokens);
        setTokens(portfolioTokens);
        setError(null);
        setRetryCount(0); // Reset retry count on success
      } else {
        throw new Error("Invalid portfolio response format");
      }
    } catch (err) {
      console.error("Error fetching portfolio:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch portfolio";
      const error = new Error(errorMessage);
      setError(error);
      
      // Retry logic
      if (retryCount < 3) {
        console.log(`Retrying portfolio fetch (attempt ${retryCount + 1}/3)...`);
        setRetryCount(prev => prev + 1);
        setTimeout(() => {
          fetchPortfolio();
        }, 2000 * (retryCount + 1)); // Exponential backoff
      } else {
        if (onError) {
          onError(error);
        }
        setTokens([]);
      }
    } finally {
      setLoading(false);
    }
  }, [address, onError, retryCount, chainId]);

  // Fetch portfolio when address changes
  useEffect(() => {
    setRetryCount(0); // Reset retry count when address changes
    fetchPortfolio();
  }, [address, fetchPortfolio]);

  // Reset when fkeyId changes
  useEffect(() => {
    setSelectedToken(undefined);
    if (onReset) {
      onReset();
    }
  }, [fkeyId, onReset]);

  const handleTokenSelect = (token: Token | undefined) => {
    setSelectedToken(token);
    if (onTokenSelect && token) {
      onTokenSelect(token);
    }
  };

  const handleRetry = () => {
    setRetryCount(0);
    fetchPortfolio();
  };

  // Check if we can show the transaction component
  const canShowTransaction = isConnected && selectedToken && fkeyId && fkeyId.startsWith('0x');

  if (!fkeyId) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      {!loading && isConnected && (
        <TokenSelectDropdown
          token={selectedToken}
          setToken={handleTokenSelect}
          options={tokens}
        />
      )}

      {error && (
        <div className="flex flex-col gap-2">
          <div className="text-sm text-red-600">
            Error: {error.message}
          </div>
          <button
            onClick={handleRetry}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Retry loading tokens
          </button>
        </div>
      )}

      {canShowTransaction ? (
        <Transaction
          chainId={selectedToken.chainId}
          calls={[{
            to: fkeyId as `0x${string}`,
            value: parseEther("0.01"), // Default small amount, should be configurable
            data: '0x',
          }]}
          isSponsored={true}
        >
          <div className="flex flex-col gap-2">
            <div className="text-sm text-gray-600">
              Sending 0.01 {selectedToken.symbol}
            </div>
            <div className="text-sm text-gray-600">
              To: {fkeyId}
            </div>
          </div>
        </Transaction>
      ) : (
        <div className="text-sm text-gray-600">
          {!isConnected ? (
            "Connect wallet to send"
          ) : !selectedToken ? (
            "Select a token to send"
          ) : !fkeyId.startsWith('0x') ? (
            "Invalid recipient address"
          ) : (
            "Preparing transaction..."
          )}
        </div>
      )}

      {loading && (
        <div className="text-sm text-gray-600">
          Loading tokens...
        </div>
      )}
    </div>
  );
}; 