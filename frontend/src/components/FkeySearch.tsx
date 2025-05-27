import { useState, useEffect } from "react";
import { getPortfolios } from '@coinbase/onchainkit/api';
import { formatUnits } from 'viem';
import { useXMTP } from '@/context/xmtp-context';
import ConvosChat from "./ConvosChat";
import { storage } from "@/lib/storage";
import { Stats } from "./Stats";
import { CollapsibleConnectionInfo } from "./CollapsibleConnectionInfo";
import { Copy, Check, X } from 'lucide-react';
import { verifyProof } from '@reclaimprotocol/js-sdk';
import { useWalletClient, useAccount, useChainId } from 'wagmi';
import { type Token } from '@coinbase/onchainkit/token';
import { PublicEndpoints } from './PublicEndpoints';
import { TokenChip } from '@coinbase/onchainkit/token';
import { Transaction } from '@coinbase/onchainkit/transaction';

interface ClaimData {
  provider: string;
  parameters: string;
  owner: string;
  timestampS: number;
  context: string;
  identifier: string;
  epoch: number;
}

interface Proof {
  claimData: ClaimData;
  identifier: string;
  signatures: any[];
  witnesses: any[];
}

interface ProofData {
  proof: Proof | null;
  isVerifying: boolean;
  isVerified: boolean;
  verificationResult: string | null;
}

interface PortfolioToken {
  symbol: string;
  name: string;
  address: `0x${string}`;
  decimals: number;
  image?: string;
}

interface FkeyProfile {
  address: string;
  name: string;
  username: string;
  description: string | undefined;
  avatar: string;
  qrCode?: string;
}

interface NewEndpoint {
  resourceUrl: string;  // The resource URL to save and serve via zkfetch
  endpointName: string; // The route name for zkfetch proof+verification
  price: number;        // Price for x402 payment
  description: string;  // Description of the resource
}

interface TokenSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (token: Token) => void;
  tokens: Token[];
}

function TokenSelectorModal({ isOpen, onClose, onSelect, tokens }: TokenSelectorModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-lg p-4 max-w-md w-full">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-200">Select Token</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-300">
            <X size={20} />
          </button>
        </div>
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {tokens.map((token) => (
            <div
              key={token.address}
              onClick={() => {
                onSelect(token);
                onClose();
              }}
              className="w-full flex items-center p-3 hover:bg-gray-800 rounded-lg cursor-pointer transition-colors"
            >
              <div className="flex items-center flex-1 gap-3">
                <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-800 flex items-center justify-center">
                  <img
                    src={token.image}
                    alt={token.symbol}
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      // Fallback for failed image loads
                      (e.target as HTMLImageElement).src = `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/${token.address}/logo.png`;
                    }}
                  />
                </div>
                <div>
                  <div className="font-medium text-gray-200">{token.symbol}</div>
                  <div className="text-sm text-gray-400">{token.name}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const DEFAULT_TOKENS: Token[] = [
  {
    name: 'Ethereum',
    symbol: 'ETH',
    address: '0x4200000000000000000000000000000000000006' as `0x${string}`, // Base ETH
    decimals: 18,
    chainId: 8453, // Base mainnet
    image: 'https://wallet-api-production.s3.amazonaws.com/uploads/tokens/eth_288.png'
  },
  {
    name: 'USD Coin',
    symbol: 'USDC',
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`, // Base USDC
    decimals: 6,
    chainId: 8453, // Base mainnet
    image: 'https://d3r81g40ycuhqg.cloudfront.net/wallet/wais/44/2b/442b80bd16af0c0d9b22e03a16753823fe826e5bfd457292b55fa0ba8c1ba213-ZWUzYjJmZGUtMDYxNy00NDcyLTg0NjQtMWI4OGEwYjBiODE2'
  },
  {
    name: 'Dai',
    symbol: 'DAI',
    address: '0x50c5725949a6f0c72e6c4a641f24049a917db0cb' as `0x${string}`, // Base DAI
    decimals: 18,
    chainId: 8453, // Base mainnet
    image: 'https://d3r81g40ycuhqg.cloudfront.net/wallet/wais/d0/d7/d0d7784975771dbbac9a22c8c0c12928cc6f658cbcf2bbbf7c909f0fa2426dec-NmU4ZWViMDItOTQyYy00Yjk5LTkzODUtNGJlZmJiMTUxOTgy'
  }
];

// Base Sepolia test tokens
const TEST_TOKENS: Token[] = [
  {
    name: 'Ethereum',
    symbol: 'ETH',
    address: '0x4200000000000000000000000000000000000006' as `0x${string}`, // Base Sepolia ETH
    decimals: 18,
    chainId: 84532, // Base Sepolia
    image: 'https://wallet-api-production.s3.amazonaws.com/uploads/tokens/eth_288.png'
  },
  {
    name: 'USD Coin',
    symbol: 'USDC',
    address: '0x036CbD53842c5426634e7929541eC2018491cf77' as `0x${string}`, // Base Sepolia USDC
    decimals: 6,
    chainId: 84532, // Base Sepolia
    image: 'https://d3r81g40ycuhqg.cloudfront.net/wallet/wais/44/2b/442b80bd16af0c0d9b22e03a16753823fe826e5bfd457292b55fa0ba8c1ba213-ZWUzYjJmZGUtMDYxNy00NDcyLTg0NjQtMWI4OGEwYjBiODE2'
  }
];

export function FkeySearch() {
  const { client } = useXMTP();
  const { data: walletClient } = useWalletClient();
  const chainId = useChainId();
  const { isConnected: wagmiIsConnected } = useAccount();
  const [isConnected, setIsConnected] = useState(wagmiIsConnected);
  const [username, setUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<FkeyProfile | null>(null);
  const [amount, setAmount] = useState<number>(0);
  const [selectedToken, setSelectedToken] = useState<Token>(
    chainId === 84532 ? TEST_TOKENS[0] : DEFAULT_TOKENS[0]
  );
  const [availableTokens, setAvailableTokens] = useState<Token[]>(
    chainId === 84532 ? TEST_TOKENS : DEFAULT_TOKENS
  );
  const [isLoadingTokens, setIsLoadingTokens] = useState(false);
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
  const [isCopied, setIsCopied] = useState(false);
  const [showProof, setShowProof] = useState(false);
  const [selectedProofType, setSelectedProofType] = useState<'fkey' | 'convos'>('fkey');
  const [proofs, setProofs] = useState<{
    fkey: ProofData | null;
    convos: ProofData | null;
  }>({
    fkey: null,
    convos: null
  });
  const [showEndpointForm, setShowEndpointForm] = useState(false);
  const [newEndpoint, setNewEndpoint] = useState<NewEndpoint>({
    resourceUrl: '',
    endpointName: '',
    price: 0.01,
    description: ''
  });
  const [claimingFkey, setClaimingFkey] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    setIsConnected(wagmiIsConnected);
  }, [wagmiIsConnected]);

  // Update tokens when chain changes
  useEffect(() => {
    setSelectedToken(chainId === 84532 ? TEST_TOKENS[0] : DEFAULT_TOKENS[0]);
    setAvailableTokens(chainId === 84532 ? TEST_TOKENS : DEFAULT_TOKENS);
  }, [chainId]);

  // Try to fetch portfolio from Base mainnet
  useEffect(() => {
    async function fetchPortfolio() {
      if (!client?.signer || chainId !== 8453) {
        // Only attempt to fetch portfolio on Base mainnet
        if (chainId === 84532) {
          console.log('Using test tokens for Base Sepolia - getPortfolios API only works on Base mainnet');
        }
        return;
      }

      try {
        setIsLoadingTokens(true);
        const identifier = await client.signer.getIdentifier();
        if (identifier.identifierKind === 'Ethereum') {
          const response = await getPortfolios({
            addresses: [identifier.identifier as `0x${string}`],
          });

          if ('error' in response) {
            console.error('API Error:', response.error);
            return;
          }

          // Convert portfolio data to Token type
          const userTokens = Object.entries(response.portfolios?.[0] || {}).map(([symbol, data]: [string, any]) => ({
            symbol,
            name: data.name || symbol,
            address: data.address as `0x${string}`,
            decimals: data.decimals || 18,
            chainId: 8453, // Base mainnet
            image: data.image || DEFAULT_TOKENS[0].image
          }));

          // Merge with default tokens, preferring user balances when available
          const mergedTokens = DEFAULT_TOKENS.map(defaultToken => {
            const userToken = userTokens.find(t => t.symbol === defaultToken.symbol);
            return userToken || defaultToken;
          });

          // Add any additional tokens the user has
          const additionalTokens = userTokens.filter(
            token => !DEFAULT_TOKENS.some(d => d.symbol === token.symbol)
          );

          setAvailableTokens([...mergedTokens, ...additionalTokens]);
        }
      } catch (error) {
        console.error('Error fetching portfolio:', error);
        // Fallback to default tokens on error
        setAvailableTokens(DEFAULT_TOKENS);
      } finally {
        setIsLoadingTokens(false);
      }
    }

    fetchPortfolio();
  }, [client, chainId]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username) return;

    setIsLoading(true);
    setError(null);
    setProfile(null);
    setConvosData(null);
    setProofs({ fkey: null, convos: null });

    try {
      // Run both lookups in parallel
      const [fkeyResponse, convosResponse] = await Promise.all([
        fetch(`/api/fkey/lookup/${username}`),
        fetch(`/api/convos/lookup/${username}`)
      ]);

      // Process fkey.id response
      let fkeyProfile = null;
      try {
        const fkeyData = await fkeyResponse.json();
        console.log('Received fkey.id data:', fkeyData);
        
        if (fkeyResponse.ok && fkeyData.address) {
          fkeyProfile = fkeyData;
          setProfile(fkeyData);
          
          // Store fkey proof if available
          if (fkeyData.proof) {
            console.log('Received fkey.id zkfetch proof:', fkeyData.proof);
            setProofs(prev => ({
              ...prev,
              fkey: {
                proof: fkeyData.proof,
                isVerifying: false,
                isVerified: false,
                verificationResult: null
              }
            }));
          }
        }
      } catch (fkeyError) {
        console.error('fkey.id data parsing error:', fkeyError);
      }

      // Process convos.org response
      try {
        const convosData = await convosResponse.json();
        console.log('Received convos.org data:', convosData);
        
        if (convosData.success && convosData.xmtpId) {
          const convosProfile = {
            xmtpId: convosData.xmtpId,
            username: convosData.username,
            url: convosData.url,
            profile: convosData.profile
          };
          setConvosData(convosProfile);

          // Store convos proof if available
          if (convosData.proof) {
            console.log('Received convos.org zkfetch proof:', convosData.proof);
            setProofs(prev => ({
              ...prev,
              convos: {
                proof: convosData.proof,
                isVerifying: false,
                isVerified: false,
                verificationResult: null
              }
            }));
          }

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
            }, 1000);
          }
        } else if (!fkeyProfile) {
          // Only show error if neither lookup succeeded
          setError("No profile found on fkey.id or convos.org");
        }
      } catch (convosError) {
        console.error('convos.org data parsing error:', convosError);
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
    if (!profile?.address || !isConnected || !walletClient) return;
    
    try {
      setIsLoading(true);
      // TODO: Implement send transaction
      console.log('Sending', amount, selectedToken.symbol, 'to', profile.address);
      
      // For now, simulate a successful payment
      // In real implementation, this would be after transaction confirmation
      storage.incrementStealthPayments();
    } catch (error) {
      console.error('Payment error:', error);
      setError(error instanceof Error ? error.message : 'Failed to send payment');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(`${username}.fkey.id`);
    setIsCopied(true);
    setTimeout(() => {
      setIsCopied(false);
    }, 2000);
  };

  const verifyProofInBackground = async (proofData: any, proofType: 'fkey' | 'convos') => {
    try {
      setProofs(prev => ({
        ...prev,
        [proofType]: {
          ...prev[proofType]!,
          isVerifying: true
        }
      }));
      
      console.log(`\n=== Starting ${proofType} proof verification ===`);
      console.log('Proof data:', proofData);
      
      // Validate proof structure
      if (!proofData?.claimData || !proofData?.signatures?.length || !proofData?.witnesses?.length) {
        console.error('Proof is missing required fields:', {
          hasClaimData: !!proofData?.claimData,
          signatureCount: proofData?.signatures?.length,
          witnessCount: proofData?.witnesses?.length
        });
        throw new Error('Invalid proof structure');
      }
      
      console.log('\nAttempting proof verification...');
      const isProofVerified = await verifyProof(proofData);
      console.log(`Verification completed. Result: ${isProofVerified ? 'SUCCESS' : 'FAILED'}`);
      
      setProofs(prev => ({
        ...prev,
        [proofType]: {
          ...prev[proofType]!,
          isVerifying: false,
          isVerified: isProofVerified,
          verificationResult: isProofVerified ? '✓ Proof verified successfully' : '❌ Proof verification failed'
        }
      }));

      console.log(`=== ${proofType} proof verification complete ===\n`);
    } catch (error) {
      console.error(`\n❌ ${proofType} verification error:`, error);
      console.error('Error details:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      
      setProofs(prev => ({
        ...prev,
        [proofType]: {
          ...prev[proofType]!,
          isVerifying: false,
          isVerified: false,
          verificationResult: `❌ Error verifying proof: ${error instanceof Error ? error.message : String(error)}`
        }
      }));
    }
  };

  useEffect(() => {
    const fkeyProof = proofs.fkey?.proof;
    const convosProof = proofs.convos?.proof;
    
    if (fkeyProof && !proofs.fkey?.isVerifying && !proofs.fkey?.isVerified) {
      verifyProofInBackground(fkeyProof, 'fkey');
    }
    
    if (convosProof && !proofs.convos?.isVerifying && !proofs.convos?.isVerified) {
      verifyProofInBackground(convosProof, 'convos');
    }
  }, [proofs.fkey?.proof, proofs.convos?.proof]);

  const handleShowProof = () => {
    setShowProof(true);
  };

  const handleClaimFkey = async () => {
    if (!walletClient) {
      console.error('Wallet not connected');
      return;
    }

    if (!profile?.address || !convosData?.xmtpId) {
      console.error('Both fkey.id and convos.org profiles are required');
      setError('Both fkey.id and convos.org profiles must be found before claiming');
      return;
    }

    // Verify that both proofs are successful
    if (!proofs.fkey?.isVerified || !proofs.convos?.isVerified) {
      console.error('Both proofs must be verified');
      setError('Please wait for both proofs to be verified before claiming');
      return;
    }

    try {
      setClaimingFkey(true);
      setError(null);
      
      // First claim the fkey.id
      const claimResponse = await fetch('/api/fkey/claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fkeyId: username,
          owner: walletClient.account.address,
          convosUsername: convosData.username,
          convosXmtpId: convosData.xmtpId,
          fkeyProof: proofs.fkey.proof,
          convosProof: proofs.convos.proof
        })
      });

      if (!claimResponse.ok) {
        const errorData = await claimResponse.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${claimResponse.status}`);
      }

      const claimData = await claimResponse.json();
      if (!claimData.success) {
        throw new Error(claimData.error || 'Failed to claim .fkey.id');
      }

      // Store the fkey.id in localStorage
      localStorage.setItem('fkey:id', username);

      // Create the public endpoint
      const endpointResponse = await fetch('/api/personal-data/endpoints', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: `/api/fkey/public/${username}`,
          price: 0.01,
          description: `Public endpoint for ${username}.fkey.id`,
          owner: walletClient.account.address
        })
      });

      if (!endpointResponse.ok) {
        const errorData = await endpointResponse.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${endpointResponse.status}`);
      }

      const endpointData = await endpointResponse.json();
      if (!endpointData.success) {
        throw new Error(endpointData.error || 'Failed to create endpoint');
      }

      // Increment the endpoints stat
      storage.incrementEndpoints();

      console.log('Successfully claimed .fkey.id and created endpoint');
      setClaimingFkey(false);
      setUsername('');
      setProfile(null);
      setConvosData(null);
      setProofs({ fkey: null, convos: null });

      // Show success message
      setError('✓ Successfully claimed .fkey.id and created public endpoint');
      setTimeout(() => setError(null), 5000);
    } catch (error) {
      console.error('Error claiming .fkey.id:', error);
      setClaimingFkey(false);
      setError(error instanceof Error ? error.message : 'Failed to claim .fkey.id');
    }
  };

  const handleCreateEndpoint = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!walletClient) {
      console.error('Wallet not connected');
      return;
    }

    // Validate required fields
    if (!newEndpoint.resourceUrl || !newEndpoint.endpointName) {
      setError('Resource URL and Endpoint Name are required');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // Create the protected endpoint
      const response = await fetch('/api/personal-data/endpoints', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          resourceUrl: newEndpoint.resourceUrl,
          endpointPath: `/api/${newEndpoint.endpointName}`,
          price: newEndpoint.price,
          description: newEndpoint.description,
          owner: walletClient.account.address,
          requiresZkfetch: true
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        // Increment the endpoints stat
        storage.incrementEndpoints();
        
        console.log('Successfully created protected endpoint');
        setShowEndpointForm(false);
        setNewEndpoint({
          resourceUrl: '',
          endpointName: '',
          price: 0.01,
          description: ''
        });

        // Show success message
        setError(`✓ Successfully created protected endpoint at /api/${newEndpoint.endpointName}`);
        setTimeout(() => setError(null), 5000);
      } else {
        throw new Error(data.error || 'Failed to create endpoint');
      }
    } catch (error) {
      console.error('Error creating endpoint:', error);
      setError(error instanceof Error ? error.message : 'Failed to create endpoint');
    } finally {
      setIsLoading(false);
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
                      <span>{profile.name || username}</span>
                      <span className="text-gray-400 text-sm">.fkey.id</span>
                      <span className="text-green-500 text-lg">✓</span>
                      <button
                        onClick={handleCopy}
                        title={isCopied ? "Copied!" : "Copy fkey.id"}
                        className="text-gray-400 hover:text-gray-300 p-1 rounded-md hover:bg-gray-800 transition-colors"
                        type="button"
                      >
                        {isCopied ? (
                          <Check size={14} className="text-green-500" />
                        ) : (
                          <Copy size={14} />
                        )}
                      </button>
                      <button
                        onClick={handleShowProof}
                        className="text-gray-400 hover:text-gray-300 text-sm underline ml-1 flex items-center gap-1"
                        type="button"
                      >
                        <span>zkfetch proof</span>
                        {proofs.fkey?.isVerifying && (
                          <span className="animate-spin text-blue-400">⚡</span>
                        )}
                        {proofs.fkey?.isVerified && (
                          <Check size={14} className="text-green-500" />
                        )}
                      </button>
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
                  <TokenChip
                    token={selectedToken}
                    onClick={() => setIsModalOpen(true)}
                  />
                  <TokenSelectorModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    onSelect={setSelectedToken}
                    tokens={availableTokens}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Amount
                  </label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(parseFloat(e.target.value))}
                    placeholder="0.00"
                    className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-white"
                    step="any"
                  />
                </div>

                <Transaction
                  chainId={8453} // Base mainnet
                  calls={[{
                    abi: [{
                      name: 'transfer',
                      type: 'function',
                      stateMutability: 'nonpayable',
                      inputs: [
                        { name: 'recipient', type: 'address' },
                        { name: 'amount', type: 'uint256' }
                      ],
                      outputs: [{ type: 'bool' }]
                    }],
                    address: selectedToken.address as `0x${string}`,
                    args: [
                      profile.address as `0x${string}`,
                      // Convert amount to token decimals
                      BigInt(Math.floor(amount * 10 ** selectedToken.decimals))
                    ],
                    functionName: 'transfer'
                  }]}
                  className={`w-full ${!isConnected ? 'bg-gray-600 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'} text-white font-bold py-2 px-4 rounded mb-4`}
                >
                  {!isConnected ? 'Connect Wallet to Send' : `Send ${selectedToken.symbol}`}
                </Transaction>

                {/* Claim .fkey.id button */}
                {walletClient && (
                  <button
                    onClick={handleClaimFkey}
                    disabled={claimingFkey}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-bold py-2 px-4 rounded mb-4">
                    {claimingFkey ? 'Claiming...' : 'Claim .fkey.id'}
                  </button>
                )}

                {/* Create new endpoint button */}
                {walletClient && (
                  <button
                    onClick={() => setShowEndpointForm(!showEndpointForm)}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded mb-4">
                    {showEndpointForm ? 'Cancel' : 'Create New Endpoint'}
                  </button>
                )}
              </div>
            )}
          </form>
        </div>
      </div>

      {/* Endpoint creation form */}
      {showEndpointForm && profile?.address && (
        <div className="mt-4">
          <div className="flex flex-col gap-4 p-4 bg-gray-800 rounded border border-gray-700">
            <div>
              <label className="block text-sm font-medium text-gray-300">Resource URL</label>
              <input
                type="url"
                value={newEndpoint.resourceUrl}
                onChange={(e) => setNewEndpoint({ ...newEndpoint, resourceUrl: e.target.value })}
                className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white focus:border-blue-500 focus:ring-blue-500"
                placeholder="https://api.example.com/resource-to-protect"
                required
              />
              <p className="mt-1 text-sm text-gray-400">The resource that will be protected and served via zkfetch</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300">Endpoint Name</label>
              <div className="mt-1 flex rounded-md shadow-sm">
                <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-600 bg-gray-700 text-gray-400 sm:text-sm">
                  /api/
                </span>
                <input
                  type="text"
                  value={newEndpoint.endpointName}
                  onChange={(e) => setNewEndpoint({ ...newEndpoint, endpointName: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
                  className="flex-1 block w-full rounded-none rounded-r-md bg-gray-700 border-gray-600 text-white focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  placeholder="my-protected-endpoint"
                  required
                />
              </div>
              <p className="mt-1 text-sm text-gray-400">The endpoint path where zkfetch will verify and serve the resource</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300">Price (in USD)</label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-gray-400 sm:text-sm">$</span>
                </div>
                <input
                  type="number"
                  value={newEndpoint.price}
                  onChange={(e) => setNewEndpoint({ ...newEndpoint, price: parseFloat(e.target.value) })}
                  className="block w-full pl-7 rounded-md bg-gray-700 border-gray-600 text-white focus:border-blue-500 focus:ring-blue-500"
                  min="0.01"
                  step="0.01"
                  required
                />
              </div>
              <p className="mt-1 text-sm text-gray-400">Price in USD for x402 payment to access the resource</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300">Description</label>
              <textarea
                value={newEndpoint.description}
                onChange={(e) => setNewEndpoint({ ...newEndpoint, description: e.target.value })}
                className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white focus:border-blue-500 focus:ring-blue-500"
                rows={3}
                placeholder="Describe what data this endpoint provides and any usage instructions..."
                required
              />
            </div>

            <button
              onClick={handleCreateEndpoint}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-colors">
              Create Protected Endpoint
            </button>
          </div>
        </div>
      )}

      {/* Add PublicEndpoints component */}
      <div className="w-full max-w-md mx-auto px-4">
        <PublicEndpoints />
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

      {/* Proof Modal */}
      {showProof && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 z-50">
          <div className="bg-gray-900 rounded-lg p-4 w-full max-w-md mx-auto max-h-[90vh] overflow-auto">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-4">
                <h3 className="text-white text-sm font-medium">ZKfetch Proof</h3>
                <div className="flex rounded-md overflow-hidden border border-gray-700">
                  <button
                    onClick={() => setSelectedProofType('fkey')}
                    className={`px-3 py-1 text-xs ${
                      selectedProofType === 'fkey'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    fkey.id
                    {proofs.fkey?.isVerified && (
                      <Check size={12} className="inline ml-1 text-green-500" />
                    )}
                  </button>
                  <button
                    onClick={() => setSelectedProofType('convos')}
                    className={`px-3 py-1 text-xs ${
                      selectedProofType === 'convos'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    convos.org
                    {proofs.convos?.isVerified && (
                      <Check size={12} className="inline ml-1 text-green-500" />
                    )}
                  </button>
                </div>
              </div>
              <button
                onClick={() => setShowProof(false)}
                className="text-gray-400 hover:text-gray-300"
                type="button"
              >
                <X size={16} />
              </button>
            </div>
            
            {proofs[selectedProofType]?.isVerifying ? (
              <div className="text-sm mb-3 text-center text-blue-400">
                <span className="animate-spin inline-block mr-2">⚡</span>
                Verifying {selectedProofType} proof...
              </div>
            ) : proofs[selectedProofType]?.verificationResult && (
              <div className={`text-sm mb-3 text-center ${
                proofs[selectedProofType]?.verificationResult?.includes('✓')
                  ? 'text-green-500'
                  : 'text-red-500'
              }`}>
                {proofs[selectedProofType]?.verificationResult}
              </div>
            )}

            {proofs[selectedProofType]?.proof ? (
              <pre className="bg-black rounded-md p-3 overflow-auto text-xs">
                <code className="text-gray-300 whitespace-pre-wrap break-all">
                  {JSON.stringify(proofs[selectedProofType]?.proof, null, 2)}
                </code>
              </pre>
            ) : (
              <div className="text-center text-gray-400 text-sm py-4">
                No proof available for {selectedProofType}
              </div>
            )}

            <div className="mt-3 text-center">
              <span className="text-gray-400 text-xs">
                <a
                  href="https://zkfetch.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  zkfetch
                </a>
                {" "}powered by{" "}
                <a
                  href="https://reclaimprotocol.org/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  Reclaim protocol
                </a>
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 