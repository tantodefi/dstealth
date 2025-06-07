'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { Shield, Eye, Wallet, RefreshCw, ExternalLink, Copy, Check } from 'lucide-react';
import { createPublicClient, http, parseAbi, formatEther, formatUnits } from 'viem';
import { base, baseSepolia } from 'viem/chains';

// Stealth Address Contract Addresses (from https://stealthaddress.dev/contracts/deployments)
const STEALTH_CONTRACTS = {
  ERC5564Announcer: '0x55649E01B5Df198D18D95b5cc5051630cfD45564' as `0x${string}`,
  ERC6538Registry: '0x6538E6bf4B0eBd30A8Ea093027Ac2422ce5d6538' as `0x${string}`
};

// Veil Cash contract addresses (estimated based on Base deployment patterns)
const VEIL_CONTRACTS = {
  VeilCash: '0x', // To be updated with actual Veil Cash contract address
  VeilToken: '0x'  // To be updated with actual VEIL token address
};

// Umbra Protocol contract addresses (from https://github.com/ScopeLift/umbra-protocol)
const UMBRA_CONTRACTS = {
  Umbra: '0xFb2dc580Eed955B528407b4d36FfaFe3da685401' as `0x${string}`,
  StealthKeyRegistry: '0x31fe56609C65Cd0C510E7125f051D440424D38f3' as `0x${string}`
};

// FluidKey Score Contract (Base mainnet)
const FKS_TOKEN_CONTRACT = '0x894c663757f6953544548EFA1aebc0846AC08bEa' as `0x${string}`;
const FKS_DISTRIBUTOR_CONTRACT = '0x83Da511603C650bF3c7FF8d02FC6423AF455535F' as `0x${string}`;

// ERC20 ABI for FKS token balance queries
const ERC20_ABI = [
  {
    constant: true,
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    type: 'function'
  },
  {
    constant: true,
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    type: 'function'
  },
  {
    constant: true,
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    type: 'function'
  }
] as const;

// Contract ABIs for stealth operations
const ANNOUNCER_ABI = parseAbi([
  'event Announcement(uint256 indexed schemeId, address indexed stealthAddress, address indexed caller, bytes ephemeralPubKey, bytes metadata)',
  'function announce(uint256 schemeId, address stealthAddress, bytes calldata ephemeralPubKey, bytes calldata metadata) external'
]);

const REGISTRY_ABI = parseAbi([
  'event StealthMetaAddressSet(address indexed registrant, uint256 indexed schemeId, bytes stealthMetaAddress)',
  'function stealthMetaAddressOf(address registrant, uint256 schemeId) external view returns (bytes memory)'
]);

// Umbra Protocol ABIs (from their contracts)
const UMBRA_ABI = parseAbi([
  'event Announcement(address indexed receiver, uint256 amount, address indexed token, bytes16 indexed pkx, bytes32 ciphertext)',
  'function send(address _receiver, uint256 _amount, address _token, bytes16 _pkx, bytes32 _ciphertext) external payable',
  'function withdraw(uint256 _amount, address _receiver, address _token, uint256 _pkx, uint256 _ciphertext) external'
]);

const UMBRA_REGISTRY_ABI = parseAbi([
  'event StealthKeyChanged(address indexed registrant, uint256 spendingPubKeyPrefix, uint256 spendingPubKey, uint256 viewingPubKeyPrefix, uint256 viewingPubKey)',
  'function getStealthKeys(address _registrant) external view returns (uint256, uint256, uint256, uint256)'
]);

interface StealthActivity {
  type: 'announcement' | 'registration' | 'veil_deposit' | 'veil_withdrawal' | 'umbra_send' | 'umbra_withdraw' | 'umbra_key_registration';
  txHash: string;
  blockNumber: number;
  timestamp: number;
  amount?: string;
  stealthAddress?: string;
  metadata?: string;
  ephemeralPubKey?: string;
  token?: string;
  protocol?: 'ERC5564' | 'Umbra' | 'Veil';
}

interface StealthMetaData {
  registrations: number;
  announcements: number;
  veilDeposits: number;
  veilWithdrawals: number;
  umbraOperations: number;
  totalPrivacyScore: number;
  fksTokenBalance: number;
  fksStaking: number;
  fluidKeyScore: number;
}

export default function StealthScanner() {
  const { address: connectedAddress, isConnected } = useAccount();
  const [scanning, setScanning] = useState(false);
  const [activities, setActivities] = useState<StealthActivity[]>([]);
  const [metadata, setMetadata] = useState<StealthMetaData>({
    registrations: 0,
    announcements: 0,
    veilDeposits: 0,
    veilWithdrawals: 0,
    umbraOperations: 0,
    totalPrivacyScore: 0,
    fksTokenBalance: 0,
    fksStaking: 0,
    fluidKeyScore: 0
  });
  const [selectedNetwork, setSelectedNetwork] = useState<'base' | 'baseSepolia'>('baseSepolia');
  const [copied, setCopied] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanningProtocol, setScanningProtocol] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [inputAddress, setInputAddress] = useState<string>(connectedAddress || '');

  // Create public clients with more reliable RPC endpoints
  const clients = {
    base: createPublicClient({
      chain: base,
      transport: http('https://base.llamarpc.com') // More reliable RPC
    }),
    baseSepolia: createPublicClient({
      chain: baseSepolia,
      transport: http('https://sepolia.base.org')
    })
  };

  // WebSocket for real-time Flashblocks updates (Base Sepolia)
  const connectWebSocket = useCallback(() => {
    if (selectedNetwork === 'baseSepolia') {
      try {
        // Note: This would need the actual Flashblocks WebSocket endpoint
        const ws = new WebSocket('wss://sepolia.base.org/ws'); // Placeholder endpoint
        
        ws.onopen = () => {
          console.log('🔌 Connected to Flashblocks WebSocket');
          setWsConnected(true);
          
          // Subscribe to stealth-related events
          ws.send(JSON.stringify({
            method: 'subscribe',
            params: {
              addresses: [STEALTH_CONTRACTS.ERC5564Announcer, STEALTH_CONTRACTS.ERC6538Registry],
              topics: ['stealth', 'privacy']
            }
          }));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'stealth_event') {
              handleRealtimeStealthEvent(data);
            }
          } catch (error) {
            console.error('WebSocket message parsing error:', error);
          }
        };

        ws.onclose = () => {
          console.log('🔌 Disconnected from Flashblocks WebSocket');
          setWsConnected(false);
        };

        return () => ws.close();
      } catch (error) {
        console.error('WebSocket connection failed:', error);
        setWsConnected(false);
      }
    }
  }, [selectedNetwork]);

  const handleRealtimeStealthEvent = (eventData: any) => {
    console.log('📡 Real-time stealth event:', eventData);
    // Process real-time stealth events and update activities
    // This would parse the WebSocket data and add new activities
  };

  // Scan stealth address activities using Ponder API
  const scanStealthActivities = async () => {
    const addressToScan = inputAddress || connectedAddress;
    if (!addressToScan || !isConnected) return;

    setScanning(true);
    setScanProgress(0);
    const newActivities: StealthActivity[] = [];
    
    try {
      console.log(`🔍 Scanning stealth activities for ${addressToScan} using Ponder indexer`);

      // Use Ponder API for fast indexed data instead of slow RPC calls
      setScanningProtocol('Querying Ponder Indexer');
      setScanProgress(20);

      const response = await fetch(`/api/stealth/scan/${addressToScan}`);
      
      if (!response.ok) {
        throw new Error(`Ponder API error: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      setScanProgress(60);

      // Process the indexed data
      setScanningProtocol('Processing Indexed Data');
      
      // Add activities from Ponder
      newActivities.push(...data.activities);

      setScanProgress(80);

      // Set metadata from Ponder response
      const metadata: StealthMetaData = {
        registrations: data.metadata.registrations,
        announcements: data.metadata.announcements,
        veilDeposits: data.metadata.veilDeposits,
        veilWithdrawals: data.metadata.veilWithdrawals,
        umbraOperations: data.metadata.umbraOperations,
        totalPrivacyScore: data.metadata.totalPrivacyScore,
        fksTokenBalance: data.metadata.fksTokenBalance,
        fksStaking: data.metadata.fksStaking,
        fluidKeyScore: data.metadata.fluidKeyScore,
      };

      setScanProgress(90);

      // WebSocket for real-time updates (if supported)
      if (data.realTimeSupported && selectedNetwork === 'baseSepolia') {
        try {
          setScanningProtocol('Connecting to Real-time Updates');
          connectWebSocket();
        } catch (error) {
          console.warn('Real-time updates unavailable:', error);
        }
      }

      setScanProgress(100);

      // Update UI with results
      setActivities(newActivities);
      setMetadata(metadata);

      console.log(`✅ Scan complete: Found ${newActivities.length} activities`);
      console.log(`📊 Privacy Score: ${metadata.totalPrivacyScore}/100`);
      console.log(`🔑 FluidKey Score: ${metadata.fluidKeyScore}`);

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('❌ Stealth scan failed:', errorMessage);
      setError(errorMessage);
      
      // Fallback to direct RPC if Ponder fails
      console.log('🔄 Falling back to direct RPC scanning...');
      await fallbackToRpcScanning();
    } finally {
      setScanning(false);
      setScanProgress(0);
      setScanningProtocol('');
    }
  };

  // Fallback to original RPC scanning if Ponder fails
  const fallbackToRpcScanning = async () => {
    const addressToScan = inputAddress || connectedAddress;
    if (!addressToScan || !isConnected) return;

    const client = clients[selectedNetwork];
    const newActivities: StealthActivity[] = [];
    
    try {
      setScanningProtocol('RPC Fallback: ERC-5564');
      setScanProgress(10);
      
      // Minimal RPC fallback - just get recent events
      const recentBlocks = 1000; // Last 1000 blocks only
      const latestBlock = await client.getBlockNumber();
      const fromBlock = latestBlock - BigInt(recentBlocks);

      const announcementLogs = await client.getLogs({
        address: STEALTH_CONTRACTS.ERC5564Announcer,
        event: ANNOUNCER_ABI.find(item => item.type === 'event' && item.name === 'Announcement')!,
        fromBlock,
        toBlock: 'latest'
      });

      setScanProgress(50);

      for (const log of announcementLogs.slice(0, 20)) { // Limit to 20 recent events
        const block = await client.getBlock({ blockNumber: log.blockNumber });
        newActivities.push({
          type: 'announcement',
          txHash: log.transactionHash,
          blockNumber: Number(log.blockNumber),
          timestamp: Number(block.timestamp),
          stealthAddress: log.args.stealthAddress,
          ephemeralPubKey: log.args.ephemeralPubKey,
          metadata: log.args.metadata,
          protocol: 'ERC5564'
        });
      }

      setScanProgress(90);

      // Basic metadata for fallback
      const metadata: StealthMetaData = {
        registrations: 0,
        announcements: newActivities.length,
        veilDeposits: 0,
        veilWithdrawals: 0,
        umbraOperations: 0,
        totalPrivacyScore: newActivities.length * 5, // Basic scoring
        fksTokenBalance: 0,
        fksStaking: 0,
        fluidKeyScore: 0,
      };

      setActivities(newActivities);
      setMetadata(metadata);

      console.log(`⚠️ Fallback scan complete: ${newActivities.length} recent activities`);

    } catch (fallbackError) {
      console.error('❌ Fallback scan also failed:', fallbackError);
      setError('Both Ponder API and RPC fallback failed. Please try again later.');
    }
  };

  // Copy to clipboard
  const copyToClipboard = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  // Format timestamp
  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  // Get activity icon
  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'announcement': return '📢';
      case 'registration': return '📝';
      case 'umbra_send': return '🌙';
      case 'umbra_withdraw': return '🌕';
      case 'umbra_key_registration': return '🔐';
      case 'veil_deposit': return '🏦';
      case 'veil_withdrawal': return '💸';
      default: return '🔒';
    }
  };

  // Get protocol badge color
  const getProtocolBadge = (protocol?: string) => {
    switch (protocol) {
      case 'ERC5564': return 'bg-blue-600 text-white';
      case 'Umbra': return 'bg-purple-600 text-white';
      case 'Veil': return 'bg-green-600 text-white';
      default: return 'bg-gray-600 text-white';
    }
  };

  // Connect WebSocket on mount
  useEffect(() => {
    const cleanup = connectWebSocket();
    return cleanup;
  }, [connectWebSocket]);

  // Sync input address with connected address when wallet connects
  useEffect(() => {
    if (connectedAddress && !inputAddress) {
      setInputAddress(connectedAddress);
    }
  }, [connectedAddress, inputAddress]);

  // Auto-scan when address or network changes
  useEffect(() => {
    if (connectedAddress && isConnected) {
      scanStealthActivities();
    }
  }, [connectedAddress, isConnected, selectedNetwork]);

  if (!isConnected) {
    return (
      <div className="bg-gray-900 rounded-lg p-6 text-center">
        <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">Stealth Address Scanner</h2>
        <p className="text-gray-400">Connect your wallet to scan for stealth address activities</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with centered emoji and clean design */}
      <div className="text-center mb-6">
        <div className="flex flex-col items-center gap-3 mb-4">
          <div className="text-4xl">🛡️</div>
          <h1 className="text-2xl font-bold text-white">Privacy Scanner</h1>
          <p className="text-gray-400 text-sm max-w-2xl mx-auto">
            Scan stealth activities, privacy transactions, and FluidKey scores across Base network
          </p>
        </div>
      </div>

      {/* Address Input Section - Prominently Featured */}
      <div className="bg-gray-800 border border-gray-600 rounded-lg p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold">🔍</span>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Enter Address to Scan</h2>
            <p className="text-gray-400 text-sm">
              Scan any Ethereum address for stealth activities and FluidKey Score
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Ethereum Address or ENS Name
            </label>
            <input
              type="text"
              value={inputAddress}
              onChange={(e) => setInputAddress(e.target.value)}
              placeholder="0x... or vitalik.eth"
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-300">Network:</label>
                <select
                  value={selectedNetwork}
                  onChange={(e) => setSelectedNetwork(e.target.value as keyof typeof clients)}
                  className="px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="mainnet">Mainnet</option>
                  <option value="sepolia">Sepolia</option>
                  <option value="baseSepolia">Base Sepolia</option>
                </select>
              </div>

              {wsConnected && (
                <div className="flex items-center gap-2 text-green-400 text-sm">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  Real-time
                </div>
              )}
            </div>

            <button
              onClick={scanStealthActivities}
              disabled={!inputAddress || !isConnected || scanning}
              className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition-all duration-200 flex items-center gap-2 font-medium"
            >
              {scanning ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Scanning...
                </>
              ) : (
                <>
                  <span>🔍</span>
                  Scan Privacy
                </>
              )}
            </button>
          </div>

          {/* Scanner Features - Row 1 */}
          <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-700">
            <div className="text-center">
              <div className="text-2xl mb-2">⚡</div>
              <div className="text-green-400 font-semibold">Fast</div>
              <div className="text-xs text-gray-400">Indexed data</div>
            </div>
            <div className="text-center">
              <div className="text-2xl mb-2">🔄</div>
              <div className="text-blue-400 font-semibold">Real-time</div>
              <div className="text-xs text-gray-400">Live updates</div>
            </div>
            <div className="text-center">
              <div className="text-2xl mb-2">🌐</div>
              <div className="text-purple-400 font-semibold">Multi-chain</div>
              <div className="text-xs text-gray-400">Base network</div>
            </div>
            <div className="text-center">
              <div className="text-2xl mb-2">🏆</div>
              <div className="text-yellow-400 font-semibold">Accurate</div>
              <div className="text-xs text-gray-400">Reliable data</div>
            </div>
          </div>
        </div>
      </div>

      {/* Privacy Metrics - Reorganized into two clean rows */}
      <div className="space-y-4">
        {/* Row 1 - Main Privacy Stats */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-gray-900/50 border border-gray-600/30 rounded-lg p-4 text-center">
            <div className="text-2xl mb-2">🔑</div>
            <div className="text-2xl font-bold text-purple-400">{metadata.registrations}</div>
            <div className="text-sm text-gray-400">Key Registrations</div>
          </div>
          <div className="bg-gray-900/50 border border-gray-600/30 rounded-lg p-4 text-center">
            <div className="text-2xl mb-2">📤</div>
            <div className="text-2xl font-bold text-blue-400">{metadata.announcements}</div>
            <div className="text-sm text-gray-400">ERC-5564 Sends</div>
          </div>
          <div className="bg-gray-900/50 border border-gray-600/30 rounded-lg p-4 text-center">
            <div className="text-2xl mb-2">💰</div>
            <div className="text-2xl font-bold text-purple-500">{metadata.umbraOperations}</div>
            <div className="text-sm text-gray-400">Umbra Payments</div>
          </div>
          <div className="bg-gray-900/50 border border-gray-600/30 rounded-lg p-4 text-center">
            <div className="text-2xl mb-2">🕶️</div>
            <div className="text-2xl font-bold text-green-400">{metadata.veilDeposits + metadata.veilWithdrawals}</div>
            <div className="text-sm text-gray-400">Veil Operations</div>
          </div>
        </div>

        {/* Row 2 - Scores */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gray-900/50 border border-gray-600/30 rounded-lg p-4 text-center">
            <div className="text-2xl mb-2">💎</div>
            <div className="text-2xl font-bold text-cyan-400">{metadata.fksTokenBalance.toFixed(0)}</div>
            <div className="text-sm text-gray-400">FluidKey Score</div>
          </div>
          <div className="bg-gray-900/50 border border-gray-600/30 rounded-lg p-4 text-center">
            <div className="text-2xl mb-2">🎯</div>
            <div className="text-2xl font-bold text-emerald-400">{metadata.fluidKeyScore.toFixed(0)}/100</div>
            <div className="text-sm text-gray-400">Privacy Rating</div>
          </div>
          <div className="bg-gray-900/50 border border-gray-600/30 rounded-lg p-4 text-center">
            <div className="text-2xl mb-2">🛡️</div>
            <div className="text-2xl font-bold text-yellow-400">{metadata.totalPrivacyScore.toFixed(0)}</div>
            <div className="text-sm text-gray-400">Total Score</div>
          </div>
        </div>
      </div>

      {/* Activities List */}
      <div className="bg-gray-900/50 border border-gray-600/30 rounded-lg p-6">
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Eye className="h-5 w-5" />
          Stealth Activities ({activities.length})
        </h3>
        
        {activities.length === 0 ? (
          <div className="text-center py-8">
            <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-400">
              {scanning ? 'Scanning for stealth activities...' : 'No stealth activities found'}
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Try using stealth addresses or Veil Cash to generate privacy activities
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {activities.map((activity, index) => (
              <div key={index} className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{getActivityIcon(activity.type)}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-white capitalize">
                          {activity.type.replace(/_/g, ' ')}
                        </h4>
                        {activity.protocol && (
                          <span className={`px-2 py-1 text-xs rounded-full ${getProtocolBadge(activity.protocol)}`}>
                            {activity.protocol}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-400">
                        Block {activity.blockNumber} • {formatTimestamp(activity.timestamp)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => copyToClipboard(activity.txHash, `tx-${index}`)}
                      className="p-1 text-gray-400 hover:text-white transition-colors"
                    >
                      {copied === `tx-${index}` ? (
                        <Check className="h-4 w-4 text-green-400" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                    <a
                      href={`https://${selectedNetwork === 'base' ? 'basescan.org' : 'sepolia.basescan.org'}/tx/${activity.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 text-gray-400 hover:text-white transition-colors"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </div>
                </div>
                
                {activity.stealthAddress && (
                  <div className="text-sm text-gray-300 mb-1">
                    <span className="text-gray-400">Stealth Address:</span> {activity.stealthAddress}
                  </div>
                )}
                
                {activity.amount && (
                  <div className="text-sm text-gray-300 mb-1">
                    <span className="text-gray-400">Amount:</span> {activity.amount} ETH
                  </div>
                )}

                {activity.token && activity.token !== '0x0000000000000000000000000000000000000000' && (
                  <div className="text-sm text-gray-300 mb-1">
                    <span className="text-gray-400">Token:</span> {activity.token}
                  </div>
                )}

                {activity.ephemeralPubKey && (
                  <div className="text-sm text-gray-300 mb-1">
                    <span className="text-gray-400">Ephemeral Key:</span> {activity.ephemeralPubKey}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Integration Links */}
      <div className="bg-gray-900/50 border border-gray-600/30 rounded-lg p-6">
        <h3 className="text-xl font-bold text-white mb-4">Privacy Protocol Integration</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <a
            href="https://stealthaddress.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-4 bg-gray-800/50 rounded-lg hover:bg-gray-700/50 transition-colors"
          >
            <Shield className="h-6 w-6 text-blue-400" />
            <div>
              <h4 className="font-medium text-white">Stealth Addresses</h4>
              <p className="text-sm text-gray-400">ERC-5564 & ERC-6538 Implementation</p>
            </div>
            <ExternalLink className="h-4 w-4 text-gray-400 ml-auto" />
          </a>

          <a
            href="https://app.umbra.cash"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-4 bg-gray-800/50 rounded-lg hover:bg-gray-700/50 transition-colors"
          >
            <Eye className="h-6 w-6 text-purple-400" />
            <div>
              <h4 className="font-medium text-white">Umbra Protocol</h4>
              <p className="text-sm text-gray-400">Privacy-Preserving Payments</p>
            </div>
            <ExternalLink className="h-4 w-4 text-gray-400 ml-auto" />
          </a>
          
          <a
            href="https://docs.veil.cash"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-4 bg-gray-800/50 rounded-lg hover:bg-gray-700/50 transition-colors"
          >
            <Wallet className="h-6 w-6 text-green-400" />
            <div>
              <h4 className="font-medium text-white">Veil Cash</h4>
              <p className="text-sm text-gray-400">zkSNARKs Privacy Protocol</p>
            </div>
            <ExternalLink className="h-4 w-4 text-gray-400 ml-auto" />
          </a>
        </div>
      </div>
    </div>
  );
} 