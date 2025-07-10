"use client";

import React, { useState, useEffect } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { Copy, Check, ExternalLink, ChevronDown, ChevronUp, Trash2, RefreshCw, AlertTriangle } from "lucide-react";

interface StealthPayment {
  timestamp: number;
  amount: string;
  token: string;
  recipientAddress: string;
  txHash: string;
  txUrl: string;
  zkProofUrl: string;
  fkeyId: string;
  proof?: {
    claimData: {
      provider: string;
      parameters: string;
      owner: string;
      timestampS: number;
      context: string;
      identifier: string;
      epoch: number;
    };
    identifier: string;
    signatures: string[];
    witnesses: {
      id: string;
      url: string;
    }[];
  };
}

// Interface for generated payment links stored as ZK receipts
interface GeneratedPaymentLink {
  id: string;
  timestamp: number;
  amount: string;
  token: string;
  recipientAddress: string;
  paymentUrl: string;
  memo: string;
  fkeyId: string;
  isCompleted: boolean;
  completedTxHash?: string;
  completedTxUrl?: string;
  lastChecked?: number;
  // ZK proof data used to generate this link
  zkProof?: {
    fkey?: any;
    convos?: any;
    verificationResults?: {
      fkey?: any;
      convos?: any;
    };
  };
}

function CopyButton({ text, className = "" }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`text-gray-400 hover:text-blue-400 transition-colors ${className}`}
      title="Copy to clipboard"
    >
      {copied ? (
        <Check className="h-4 w-4 text-green-400" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </button>
  );
}

export default function ZkReceipts() {
  const [expandedProofs, setExpandedProofs] = useState<{[key: string]: boolean}>({});
  const [stealthPayments, setStealthPayments] = useLocalStorage<StealthPayment[]>("stealth-payments", []);
  const [generatedPaymentLinks, setGeneratedPaymentLinks] = useLocalStorage<GeneratedPaymentLink[]>("generated-payment-links", []);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [checkingPayments, setCheckingPayments] = useState<{[key: string]: boolean}>({});
  const [agentZkReceipts, setAgentZkReceipts] = useState<any[]>([]);
  const [loadingAgentReceipts, setLoadingAgentReceipts] = useState(false);

  // Fetch ZK receipts from agent database
  const fetchAgentZkReceipts = async () => {
    try {
      // Get user's wallet address from local storage or connection
      const walletAddress = localStorage.getItem('wallet_address') || 
                           window?.ethereum?.selectedAddress ||
                           '0x0000000000000000000000000000000000000000'; // fallback
      
      if (!walletAddress || walletAddress === '0x0000000000000000000000000000000000000000') {
        console.log('⚠️ No wallet address available for fetching agent ZK receipts');
        return;
      }

      setLoadingAgentReceipts(true);
      const response = await fetch(`/api/zkreceipts?userAddress=${walletAddress}`);
      
      if (response.ok) {
        const data = await response.json();
        setAgentZkReceipts(data.zkReceipts || []);
        console.log(`✅ Fetched ${data.zkReceipts?.length || 0} ZK receipts from agent database`);
      } else {
        console.warn('⚠️ Failed to fetch agent ZK receipts:', response.status);
      }
    } catch (error) {
      console.error('❌ Error fetching agent ZK receipts:', error);
    } finally {
      setLoadingAgentReceipts(false);
    }
  };

  // Fetch agent ZK receipts on component mount
  useEffect(() => {
    fetchAgentZkReceipts();
  }, []);

  // Removed hardcoded demo payment - only show real completed payments from Daimo Pay

  const toggleProof = (index: number) => {
    setExpandedProofs(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const checkPaymentStatus = async (linkId: string) => {
    setCheckingPayments(prev => ({ ...prev, [linkId]: true }));
    
    try {
      const link = generatedPaymentLinks.find(l => l.id === linkId);
      if (!link) {
        setCheckingPayments(prev => ({ ...prev, [linkId]: false }));
        return;
      }

      console.log('🔍 Checking payment status for:', {
        linkId,
        recipient: link.recipientAddress,
        amount: link.amount,
        token: link.token
      });

      // Check Base network for USDC transfers to the recipient address
      const hasPayment = await checkBaseUSDCTransfer(
        link.recipientAddress,
        parseFloat(link.amount),
        link.timestamp
      );

      if (hasPayment) {
        // Mark link as completed
        const updatedLinks = generatedPaymentLinks.map(l => 
          l.id === linkId 
            ? { 
                ...l, 
                isCompleted: true,
                completedTxHash: hasPayment.txHash,
                completedTxUrl: `https://basescan.org/tx/${hasPayment.txHash}`,
                lastChecked: Date.now()
              }
            : l
        );
        setGeneratedPaymentLinks(updatedLinks);
        console.log('✅ Payment found and link marked as completed:', hasPayment);
      } else {
        // Just update lastChecked timestamp
        const updatedLinks = generatedPaymentLinks.map(l => 
          l.id === linkId 
            ? { ...l, lastChecked: Date.now() }
            : l
        );
        setGeneratedPaymentLinks(updatedLinks);
        console.log('⏳ No payment found yet for link:', linkId);
      }

    } catch (error) {
      console.error('❌ Error checking payment status:', error);
      
      // Still update lastChecked even on error
      const updatedLinks = generatedPaymentLinks.map(l => 
        l.id === linkId 
          ? { ...l, lastChecked: Date.now() }
          : l
      );
      setGeneratedPaymentLinks(updatedLinks);
    } finally {
      setCheckingPayments(prev => ({ ...prev, [linkId]: false }));
    }
  };

  // Check Base network for USDC transfers to a specific address
  const checkBaseUSDCTransfer = async (
    recipientAddress: string, 
    expectedAmount: number, 
    afterTimestamp: number
  ): Promise<{txHash: string, amount: string} | null> => {
    try {
      // Base mainnet RPC endpoint
      const baseRpcUrl = 'https://mainnet.base.org';
      
      // USDC contract address on Base
      const usdcAddress = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
      
      // Get recent blocks to check (last ~24 hours worth)
      const latestBlockResponse = await fetch(baseRpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_blockNumber',
          params: [],
          id: 1
        })
      });
      
      const latestBlockData = await latestBlockResponse.json();
      const latestBlock = parseInt(latestBlockData.result, 16);
      
      // Check last ~1000 blocks (roughly 30 minutes on Base)
      const fromBlock = Math.max(0, latestBlock - 1000);
      
      console.log('🔍 Checking Base blocks', fromBlock, 'to', latestBlock, 'for USDC transfers to', recipientAddress);
      
      // Get USDC transfer logs to the recipient address
      const logsResponse = await fetch(baseRpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getLogs',
          params: [{
            fromBlock: `0x${fromBlock.toString(16)}`,
            toBlock: 'latest',
            address: usdcAddress,
            topics: [
              '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', // Transfer event signature
              null, // from address (any)
              `0x000000000000000000000000${recipientAddress.slice(2).toLowerCase()}` // to address (padded)
            ]
          }],
          id: 2
        })
      });
      
      const logsData = await logsResponse.json();
      
      if (logsData.result && logsData.result.length > 0) {
        console.log('📋 Found', logsData.result.length, 'USDC transfer(s) to address');
        
        // Check each transfer for amount match
        for (const log of logsData.result) {
          // Decode the transfer amount (USDC has 6 decimals)
          const amountHex = log.data;
          const amountWei = parseInt(amountHex, 16);
          const amountUSDC = amountWei / 1e6; // USDC has 6 decimals
          
          console.log('💰 Transfer found:', {
            txHash: log.transactionHash,
            amount: amountUSDC,
            expected: expectedAmount,
            blockNumber: parseInt(log.blockNumber, 16)
          });
          
          // Check if amount matches (with small tolerance for rounding)
          const amountDiff = Math.abs(amountUSDC - expectedAmount);
          if (amountDiff < 0.01) { // Within 1 cent tolerance
            
            // Get block timestamp to verify it's after link creation
            const blockResponse = await fetch(baseRpcUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'eth_getBlockByNumber',
                params: [log.blockNumber, false],
                id: 3
              })
            });
            
            const blockData = await blockResponse.json();
            const blockTimestamp = parseInt(blockData.result.timestamp, 16) * 1000; // Convert to milliseconds
            
            if (blockTimestamp > afterTimestamp) {
              return {
                txHash: log.transactionHash,
                amount: amountUSDC.toString()
              };
            }
          }
        }
      }
      
      return null;
      
    } catch (error) {
      console.error('❌ Error checking Base USDC transfers:', error);
      return null;
    }
  };

  const deletePaymentLink = (linkId: string) => {
    const updatedLinks = generatedPaymentLinks.filter(link => link.id !== linkId);
    setGeneratedPaymentLinks(updatedLinks);
    setShowDeleteConfirm(null);
    console.log('🗑️ Deleted payment link:', linkId);
  };

  const confirmDelete = (linkId: string) => {
    setShowDeleteConfirm(linkId);
  };

  if (stealthPayments.length === 0 && generatedPaymentLinks.length === 0 && agentZkReceipts.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white">ZK Receipts</h2>
        <div className="p-8 bg-gray-800 rounded-lg text-center">
          <p className="text-gray-400">No payment receipts yet</p>
          <p className="text-gray-500 text-sm mt-2">
            Completed stealth payments, generated payment links, and ZK receipts from agent interactions will appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 mobile-scroll hide-scrollbar overflow-y-auto">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 border border-purple-600/30 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold">📋</span>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">ZK Receipts</h2>
            <p className="text-gray-400 text-sm">Privacy-preserving payment receipts</p>
          </div>
        </div>
      </div>
      {/* Completed Payments Section */}
      {stealthPayments.length > 0 && (
      <div className="space-y-3">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            ✅ Completed Payments ({stealthPayments.length})
          </h3>
        {stealthPayments.map((payment, index) => (
          <div key={index} className="bg-gray-800 rounded-lg overflow-hidden">
            {/* Payment Header */}
            <div className="p-4">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-white font-medium">{payment.fkeyId}</p>
                    <CopyButton text={payment.fkeyId} />
                  </div>
                  <p className="text-green-400 font-mono">
                    {payment.amount} {payment.token}
                  </p>
                  <p className="text-gray-400 text-sm">
                    {new Date(payment.timestamp).toLocaleString()}
                  </p>
                  
                  {/* Recipient Address */}
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-gray-500">To:</span>
                    <span className="text-xs text-gray-300 font-mono">
                      {payment.recipientAddress.slice(0, 6)}...{payment.recipientAddress.slice(-4)}
                    </span>
                    <CopyButton text={payment.recipientAddress} />
                  </div>
                </div>

                <div className="flex flex-col gap-2 ml-4">
                  <a
                    href={payment.txUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-blue-400 hover:text-blue-300 text-sm"
                  >
                    Transaction <ExternalLink className="h-3 w-3" />
                  </a>
                  <button
                    onClick={() => toggleProof(index)}
                    className="flex items-center gap-1 text-purple-400 hover:text-purple-300 text-sm"
                  >
                    ZK Proof {expandedProofs[index] ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Collapsible Proof Section */}
            {expandedProofs[index] && payment.proof && (
              <div className="border-t border-gray-700 bg-gray-900 p-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Provider</span>
                    <span className="text-white">{payment.proof.claimData.provider}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Owner</span>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-mono">
                        {payment.proof.claimData.owner.slice(0, 6)}...{payment.proof.claimData.owner.slice(-4)}
                      </span>
                      <CopyButton text={payment.proof.claimData.owner} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Timestamp</span>
                    <span className="text-white">
                      {new Date(payment.proof.claimData.timestampS * 1000).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Identifier</span>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-mono text-xs">
                        {payment.proof.identifier.slice(0, 6)}...{payment.proof.identifier.slice(-4)}
                      </span>
                      <CopyButton text={payment.proof.identifier} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Witnesses</span>
                    <span className="text-white">{payment.proof.witnesses.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Signatures</span>
                    <span className="text-white">{payment.proof.signatures.length}</span>
                  </div>

                  {/* Full Proof Data */}
                  <div className="mt-4 pt-4 border-t border-gray-700">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-400">Full Proof Data</span>
                      <CopyButton text={JSON.stringify(payment.proof, null, 2)} />
                    </div>
                    <pre className="bg-black rounded p-3 overflow-x-auto text-xs">
                      <code className="text-gray-300">
                        {JSON.stringify(payment.proof, null, 2)}
                      </code>
                    </pre>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      )}

      {/* Generated Payment Links Section */}
      {generatedPaymentLinks.length > 0 && (
        <div className="space-y-3 mt-8">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            🔗 ZK Payment Links ({generatedPaymentLinks.length})
          </h3>
          {generatedPaymentLinks.map((link, index) => (
            <div key={link.id} className="bg-gray-800 rounded-lg overflow-hidden relative">
              {/* Red X Delete Button for Pending Links */}
              {!link.isCompleted && (
                <button
                  onClick={() => confirmDelete(link.id)}
                  className="absolute top-3 right-3 w-6 h-6 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center text-white text-sm font-bold transition-colors z-10"
                  title="Delete payment link"
                >
                  ×
                </button>
              )}

              {/* Payment Link Header */}
              <div className="p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-white font-medium">{link.fkeyId}</p>
                      <CopyButton text={link.fkeyId} />
                      {!link.isCompleted && (
                        <span className="px-2 py-1 bg-yellow-600 text-yellow-100 text-xs rounded">
                          Pending
                        </span>
                      )}
                      {link.isCompleted && (
                        <span className="px-2 py-1 bg-green-600 text-green-100 text-xs rounded">
                          Completed
                        </span>
                      )}
                    </div>
                    <p className="text-blue-400 font-mono">
                      {link.amount} {link.token}
                    </p>
                    <p className="text-gray-400 text-sm">
                      {new Date(link.timestamp).toLocaleString()}
                    </p>
                    
                    {/* Recipient Address - Same styling as completed payments */}
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-gray-500">To:</span>
                      <span className="text-xs text-gray-300 font-mono">
                        {link.recipientAddress.slice(0, 6)}...{link.recipientAddress.slice(-4)}
                      </span>
                      <CopyButton text={link.recipientAddress} />
                    </div>

                    {/* Payment URL - Additional field for links */}
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-gray-500">Link:</span>
                      <span className="text-xs text-gray-300 font-mono">
                        {link.paymentUrl.slice(0, 30)}...
                      </span>
                      <CopyButton text={link.paymentUrl} />
                      <a
                        href={link.paymentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 ml-4">
                    {!link.isCompleted && (
                      <button
                        onClick={() => checkPaymentStatus(link.id)}
                        disabled={checkingPayments[link.id]}
                        className="flex items-center gap-1 text-blue-400 hover:text-blue-300 text-sm disabled:opacity-50"
                      >
                        {checkingPayments[link.id] ? (
                          <>
                            <RefreshCw className="h-3 w-3 animate-spin" /> Checking...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="h-3 w-3" /> Check Status
                          </>
                        )}
                      </button>
                    )}
                    {link.isCompleted && link.completedTxUrl && (
                      <a
                        href={link.completedTxUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-blue-400 hover:text-blue-300 text-sm"
                      >
                        Transaction <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    <button
                      onClick={() => setExpandedProofs(prev => ({
                        ...prev,
                        [`link_${index}`]: !prev[`link_${index}`]
                      }))}
                      className="flex items-center gap-1 text-purple-400 hover:text-purple-300 text-sm"
                    >
                      ZK Proof {expandedProofs[`link_${index}`] ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Collapsible ZK Proof Section - Same styling as completed payments */}
              {expandedProofs[`link_${index}`] && link.zkProof && (
                <div className="border-t border-gray-700 bg-gray-900 p-4">
                  <div className="space-y-3">
                    {/* Determine which proof to display (prioritize fkey, fallback to convos) */}
                    {(() => {
                      const activeProof = link.zkProof.fkey || link.zkProof.convos;
                      const proofType = link.zkProof.fkey ? 'fkey' : 'convos';
                      
                      if (!activeProof) return null;

                      return (
                        <>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-400">Provider</span>
                            <span className="text-white">{activeProof.claimData?.provider || 'N/A'}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-400">Owner</span>
                            <div className="flex items-center gap-2">
                              <span className="text-white font-mono">
                                {activeProof.claimData?.owner ? 
                                  `${activeProof.claimData.owner.slice(0, 6)}...${activeProof.claimData.owner.slice(-4)}` : 
                                  'N/A'
                                }
                              </span>
                              {activeProof.claimData?.owner && (
                                <CopyButton text={activeProof.claimData.owner} />
                              )}
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-400">Timestamp</span>
                            <span className="text-white">
                              {activeProof.claimData?.timestampS ? 
                                new Date(activeProof.claimData.timestampS * 1000).toLocaleString() : 
                                'N/A'
                              }
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-400">Identifier</span>
                            <div className="flex items-center gap-2">
                              <span className="text-white font-mono text-xs">
                                {activeProof.identifier ? 
                                  `${activeProof.identifier.slice(0, 6)}...${activeProof.identifier.slice(-4)}` : 
                                  'N/A'
                                }
                              </span>
                              {activeProof.identifier && (
                                <CopyButton text={activeProof.identifier} />
                              )}
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-400">Witnesses</span>
                            <span className="text-white">{activeProof.witnesses?.length || 0}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-400">Signatures</span>
                            <span className="text-white">{activeProof.signatures?.length || 0}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-400">Verification Status</span>
                            <span className={link.zkProof.verificationResults?.[proofType]?.isValid ? 'text-green-400' : 'text-red-400'}>
                              {link.zkProof.verificationResults?.[proofType]?.isValid ? '✅ Verified' : '❌ Unverified'}
                            </span>
                          </div>

                          {/* Full Proof Data */}
                          <div className="mt-4 pt-4 border-t border-gray-700">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm text-gray-400">Full Proof Data</span>
                              <CopyButton text={JSON.stringify(activeProof, null, 2)} />
                            </div>
                            <pre className="bg-black rounded p-3 overflow-x-auto text-xs">
                              <code className="text-gray-300">
                                {JSON.stringify(activeProof, null, 2)}
                              </code>
                            </pre>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Agent ZK Receipts Section */}
      {agentZkReceipts.length > 0 && (
        <div className="space-y-3 mt-8">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            🤖 Agent ZK Receipts ({agentZkReceipts.length})
            {loadingAgentReceipts && <RefreshCw className="h-4 w-4 animate-spin" />}
          </h3>
          {agentZkReceipts.map((receipt, index) => (
            <div key={receipt.id} className="bg-gray-800 rounded-lg overflow-hidden">
              {/* Receipt Header */}
              <div className="p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-white font-medium">{receipt.fkeyId}</p>
                      <CopyButton text={receipt.fkeyId} />
                      <span className="px-2 py-1 bg-purple-600 text-purple-100 text-xs rounded">
                        Agent Generated
                      </span>
                    </div>
                    <p className="text-green-400 font-mono">
                      {receipt.amount} {receipt.currency}
                    </p>
                    <p className="text-gray-400 text-sm">
                      {new Date(receipt.timestamp).toLocaleString()}
                    </p>
                    
                    {/* Recipient Address */}
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-gray-500">To:</span>
                      <span className="text-xs text-gray-300 font-mono">
                        {receipt.recipientAddress.slice(0, 6)}...{receipt.recipientAddress.slice(-4)}
                      </span>
                      <CopyButton text={receipt.recipientAddress} />
                    </div>

                    {/* Transaction Hash if available */}
                    {receipt.transactionHash && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-xs text-gray-500">Tx:</span>
                        <span className="text-xs text-gray-300 font-mono">
                          {receipt.transactionHash.slice(0, 8)}...{receipt.transactionHash.slice(-6)}
                        </span>
                        <CopyButton text={receipt.transactionHash} />
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 ml-4">
                    {receipt.transactionHash && (
                      <a
                        href={`https://${receipt.networkId === 'base' ? 'basescan.org' : 'etherscan.io'}/tx/${receipt.transactionHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-blue-400 hover:text-blue-300 text-sm"
                      >
                        Transaction <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    <button
                      onClick={() => setExpandedProofs(prev => ({
                        ...prev,
                        [`agent_${index}`]: !prev[`agent_${index}`]
                      }))}
                      className="flex items-center gap-1 text-purple-400 hover:text-purple-300 text-sm"
                    >
                      ZK Proof {expandedProofs[`agent_${index}`] ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Collapsible ZK Proof Section */}
              {expandedProofs[`agent_${index}`] && receipt.zkProof && (
                <div className="border-t border-gray-700 bg-gray-900 p-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-400">Provider</span>
                      <span className="text-white">{receipt.zkProof.claimData?.provider || 'Agent Generated'}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-400">Owner</span>
                      <div className="flex items-center gap-2">
                        <span className="text-white font-mono">
                          {receipt.zkProof.claimData?.owner ? 
                            `${receipt.zkProof.claimData.owner.slice(0, 6)}...${receipt.zkProof.claimData.owner.slice(-4)}` : 
                            'N/A'
                          }
                        </span>
                        {receipt.zkProof.claimData?.owner && (
                          <CopyButton text={receipt.zkProof.claimData.owner} />
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-400">Timestamp</span>
                      <span className="text-white">
                        {receipt.zkProof.claimData?.timestampS ? 
                          new Date(receipt.zkProof.claimData.timestampS * 1000).toLocaleString() : 
                          new Date(receipt.timestamp).toLocaleString()
                        }
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-400">Status</span>
                      <span className="text-green-400">✅ Verified by Agent</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-400">Source</span>
                      <span className="text-purple-400">dStealth Agent</span>
                    </div>

                    {/* Full Proof Data */}
                    <div className="mt-4 pt-4 border-t border-gray-700">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-400">Full ZK Proof</span>
                        <CopyButton text={JSON.stringify(receipt.zkProof, null, 2)} />
                      </div>
                      <pre className="bg-black rounded p-3 overflow-x-auto text-xs">
                        <code className="text-gray-300">
                          {JSON.stringify(receipt.zkProof, null, 2)}
                        </code>
                      </pre>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="h-6 w-6 text-red-400" />
              <h3 className="text-white text-lg font-semibold">Delete ZK Receipt</h3>
            </div>
            <p className="text-gray-300 mb-6">
              Are you sure you want to delete this ZK receipt? 
              <span className="text-red-300 font-medium block mt-2">
                ⚠️ This will permanently delete the ZK proof forever. Are you sure?
              </span>
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => deletePaymentLink(showDeleteConfirm)}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
              >
                Yes, Delete Forever
              </button>
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 