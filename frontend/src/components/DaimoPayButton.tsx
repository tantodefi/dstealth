"use client";

import React, { useState } from 'react';
import { DaimoPayButton as DaimoPay } from '@daimo/pay';
import { getAddress } from 'viem';
import { base, polygon, optimism, arbitrum } from 'wagmi/chains';
import { env } from '@/lib/env';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useSwitchChain } from 'wagmi';

// Define baseUSDC configuration directly (since @daimo/pay-common may not exist)
const baseUSDC = {
  chainId: base.id, // Base chain ID (8453)
  token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base
};

// Interface for completed stealth payments stored as ZK receipts
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

interface DaimoPayButtonProps {
  toAddress: `0x${string}`;
  onPaymentStarted?: (event: any) => void;
  onPaymentCompleted?: (event: any) => void;
  onPaymentBounced?: (event: any) => void;
  disabled?: boolean;
  metadata?: Record<string, any>;
  memo?: string;
  // New props for ZK proof integration
  zkProofs?: {fkey?: any, convos?: any};
  zkVerification?: {fkey?: any, convos?: any};
  username?: string;
  onLinkGenerated?: (linkData: any) => void;
}

// 🔥 NEW: Add Coinbase Wallet request link generation
const generateCoinbaseWalletLink = (toAddress: string, amount: string, tokenSymbol: string = 'USDC') => {
  try {
    // USDC contract address on Base
    const usdcContractBase = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
    
    // Convert amount to smallest unit (USDC has 6 decimals)
    const amountInSmallestUnit = Math.floor(parseFloat(amount) * 1000000).toString();
    
    // Construct EIP-681 URI for Base network
    const eip681Uri = `ethereum:${usdcContractBase}@8453/transfer?address=${toAddress}&uint256=${amountInSmallestUnit}`;
    
    // URL encode the EIP-681 URI
    const encodedUri = encodeURIComponent(eip681Uri);
    
    // Construct Coinbase Wallet request URL
    const coinbaseWalletUrl = `https://go.cb-w.com/pay-request?EIP681Link=${encodedUri}`;
    
    return coinbaseWalletUrl;
  } catch (error) {
    console.error('Error generating Coinbase Wallet link:', error);
    return '';
  }
};

export default function DaimoPayButton({
  toAddress,
  onPaymentStarted,
  onPaymentCompleted,
  onPaymentBounced,
  disabled = false,
  metadata,
  memo,
  zkProofs,
  zkVerification,
  username,
  onLinkGenerated,
}: DaimoPayButtonProps) {
  const [showLinkGenerator, setShowLinkGenerator] = useState(false);
  const [customAmount, setCustomAmount] = useState('');
  const [generatedLink, setGeneratedLink] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  
  // 🔥 NEW: Payment link type toggle
  const [linkType, setLinkType] = useState<'daimo' | 'coinbase'>('daimo');
  
  // localStorage for generated payment links and completed payments
  const [generatedPaymentLinks, setGeneratedPaymentLinks] = useLocalStorage<GeneratedPaymentLink[]>('generated-payment-links', []);
  const [stealthPayments, setStealthPayments] = useLocalStorage<StealthPayment[]>('stealth-payments', []);

  // Enhanced payment completion handler that saves ZK receipt data
  const handlePaymentCompleted = async (event: any) => {
    console.log("✅ ZK Stealth Payment Completed - Full Event:", JSON.stringify(event, null, 2));
    console.log("🔍 Event structure analysis:", {
      hasValue: 'value' in event,
      hasAmount: 'amount' in event,
      hasTransactionValue: event?.transaction?.value !== undefined,
      hasUsdcAmount: 'usdcAmount' in event,
      hasTokenAmount: 'tokenAmount' in event,
      hasToAddress: 'toAddress' in event,
      hasRecipient: 'recipient' in event,
      eventKeys: Object.keys(event || {}),
      eventValues: event ? Object.entries(event).reduce((acc, [key, val]) => {
        acc[key] = typeof val === 'object' ? `[${typeof val}]` : val;
        return acc;
      }, {} as any) : {}
    });
    
    try {
      // Extract transaction data from Daimo payment event
      let txData = {
        hash: '',
        chainId: baseUSDC.chainId,
        amount: '',
        token: 'USDC',
      };

      // Multi-source transaction hash extraction
      if (event?.transactionHash) {
        txData.hash = event.transactionHash;
      } else if (event?.transaction?.hash) {
        txData.hash = event.transaction.hash;
      } else if (event?.txHash) {
        txData.hash = event.txHash;
      } else if (event?.hash) {
        txData.hash = event.hash;
      }

      // Enhanced multi-source amount detection with USDC decimal handling
      let rawAmount = '';
      
      if (event?.usdcAmount !== undefined) {
        // Direct USDC amount (already in human-readable format)
        rawAmount = event.usdcAmount.toString();
        console.log('💰 Found usdcAmount:', rawAmount);
      } else if (event?.tokenAmount !== undefined) {
        // Token amount (might need decimal conversion)
        rawAmount = event.tokenAmount.toString();
        console.log('💰 Found tokenAmount:', rawAmount);
      } else if (event?.amount !== undefined) {
        // Generic amount
        rawAmount = event.amount.toString();
        console.log('💰 Found amount:', rawAmount);
      } else if (event?.value !== undefined) {
        // Value (might be ETH value or token value)
        rawAmount = event.value.toString();
        console.log('💰 Found value:', rawAmount);
      } else if (event?.transaction?.value !== undefined) {
        // Transaction value
        rawAmount = event.transaction.value.toString();
        console.log('💰 Found transaction.value:', rawAmount);
      }

      // Handle USDC decimal conversion if needed
      if (rawAmount) {
        const numericAmount = parseFloat(rawAmount);
        
        // If the amount looks like it's in wei-style format (very large number)
        // USDC has 6 decimals, so 1 USDC = 1,000,000 raw units
        if (numericAmount > 1000 && Number.isInteger(numericAmount)) {
          // Likely raw USDC amount - convert from 6 decimals
          txData.amount = (numericAmount / 1e6).toFixed(2);
          console.log(`🔄 Converted raw USDC amount ${rawAmount} to ${txData.amount}`);
        } else {
          // Already in human-readable format
          txData.amount = numericAmount.toFixed(2);
          console.log(`✅ Using human-readable amount: ${txData.amount}`);
        }
      } else {
        console.warn('⚠️ No amount found in payment event - defaulting to 0.00');
        txData.amount = '0.00';
      }

      // Extract chainId if available
      if (event?.chainId) {
        txData.chainId = event.chainId;
      } else if (event?.transaction?.chainId) {
        txData.chainId = event.transaction.chainId;
      }

      // Generate block explorer URL based on chain
      const getBlockExplorerUrl = (chainId: number, txHash: string) => {
        const explorers: { [key: number]: string } = {
          1: 'https://etherscan.io/tx/', // Ethereum
          8453: 'https://basescan.org/tx/', // Base
          10: 'https://optimistic.etherscan.io/tx/', // Optimism
          137: 'https://polygonscan.com/tx/', // Polygon
          42161: 'https://arbiscan.io/tx/', // Arbitrum
          480: 'https://worldscan.org/tx/', // World Chain
        };
        return (explorers[chainId] || 'https://basescan.org/tx/') + txHash;
      };

      const txUrl = getBlockExplorerUrl(txData.chainId, txData.hash);

      // Extract recipient address from event or fallback to prop
      let recipientAddress = toAddress;
      if (event?.toAddress) {
        recipientAddress = event.toAddress;
        console.log('🎯 Found recipient in event.toAddress:', recipientAddress);
      } else if (event?.recipient) {
        recipientAddress = event.recipient;
        console.log('🎯 Found recipient in event.recipient:', recipientAddress);
      } else if (event?.to) {
        recipientAddress = event.to;
        console.log('🎯 Found recipient in event.to:', recipientAddress);
      } else {
        console.log('🎯 Using prop toAddress as recipient:', recipientAddress);
      }

      // Create completed payment record in same format as hardcoded demo
      const completedPayment: StealthPayment = {
        timestamp: Date.now(),
        amount: txData.amount || '0.00',
        token: txData.token,
        recipientAddress: recipientAddress,
        txHash: txData.hash,
        txUrl: txUrl,
        zkProofUrl: "https://zkfetch.com/proof", // Static for now, could be dynamic
        fkeyId: username ? `${username}.fkey.id` : `${toAddress.slice(0, 6)}...${toAddress.slice(-4)}`,
        // Include ZK proof data if available (prioritize fkey, fallback to convos)
        proof: (zkProofs?.fkey || zkProofs?.convos) ? {
          claimData: {
            provider: zkProofs?.fkey?.claimData?.provider || zkProofs?.convos?.claimData?.provider || "http",
            parameters: zkProofs?.fkey?.claimData?.parameters || zkProofs?.convos?.claimData?.parameters || "{}",
            owner: zkProofs?.fkey?.claimData?.owner || zkProofs?.convos?.claimData?.owner || toAddress,
            timestampS: zkProofs?.fkey?.claimData?.timestampS || zkProofs?.convos?.claimData?.timestampS || Math.floor(Date.now() / 1000),
            context: zkProofs?.fkey?.claimData?.context || zkProofs?.convos?.claimData?.context || "{}",
            identifier: zkProofs?.fkey?.claimData?.identifier || zkProofs?.convos?.claimData?.identifier || txData.hash,
            epoch: zkProofs?.fkey?.claimData?.epoch || zkProofs?.convos?.claimData?.epoch || 1
          },
          identifier: zkProofs?.fkey?.identifier || zkProofs?.convos?.identifier || txData.hash,
          signatures: zkProofs?.fkey?.signatures || zkProofs?.convos?.signatures || [],
          witnesses: zkProofs?.fkey?.witnesses || zkProofs?.convos?.witnesses || []
        } : undefined
      };

      // Save to localStorage as completed payment
      const updatedPayments = [...stealthPayments, completedPayment];
      setStealthPayments(updatedPayments);

      // 🔧 NEW: Save ZK receipt to Redis for successful transactions
      try {
        const zkReceiptKey = `zk_receipt:successful_payment_${txData.hash}:${recipientAddress.toLowerCase()}:${Date.now()}`;
        const zkReceiptData = {
          transactionHash: txData.hash,
          networkId: 'base',
          amount: txData.amount || '0.00',
          currency: 'USDC',
          recipientAddress: recipientAddress,
          fkeyId: username ? `${username}.fkey.id` : `${toAddress.slice(0, 6)}...${toAddress.slice(-4)}`,
          senderAddress: recipientAddress, // In this context, we're sending to the stealth address
          timestamp: Date.now(),
          status: 'completed',
          paymentUrl: txUrl,
          // Include the ZK proof from the search
          zkProof: zkProofs?.fkey || zkProofs?.convos || null,
          metadata: {
            transactionType: "Successful DaimoPayButton Transaction",
            privacyFeature: "stealth-address",
            zkProofAvailable: !!(zkProofs?.fkey || zkProofs?.convos),
            source: "frontend-daimo-pay-button",
            paymentMethod: "daimo-sdk"
          }
        };

        // Save to Redis via API call
        await fetch('/api/zkreceipts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            key: zkReceiptKey,
            data: zkReceiptData
          })
        });

        console.log('✅ ZK receipt saved to Redis for successful payment:', zkReceiptKey);
      } catch (receiptError) {
        console.warn('⚠️ Failed to save ZK receipt to Redis:', receiptError);
        // Don't fail the payment completion if receipt storage fails
      }

      // Also check if this completes any existing payment links
      // Match any pending link to same address/amount (no time limit since links could be paid much later)
      const linkToUpdate = generatedPaymentLinks.find(link => 
        link.recipientAddress.toLowerCase() === recipientAddress.toLowerCase() && 
        !link.isCompleted &&
        parseFloat(link.amount) === parseFloat(txData.amount || '0')
      );

      if (linkToUpdate) {
        const updatedLinks = generatedPaymentLinks.map(link => 
          link.id === linkToUpdate.id 
            ? { 
                ...link, 
                isCompleted: true, 
                completedTxHash: txData.hash,
                completedTxUrl: txUrl,
                lastChecked: Date.now()
              }
            : link
        );
        setGeneratedPaymentLinks(updatedLinks);
        console.log('🔗 Updated corresponding payment link as completed:', linkToUpdate.id);

        // 🔧 NEW: Update Redis ZK receipt for completed payment link
        try {
          const updateResponse = await fetch('/api/zkreceipts/update', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              pattern: `zk_receipt:payment_link_${linkToUpdate.id}:*`,
              updates: {
                transactionHash: txData.hash,
                status: 'completed',
                completedAt: Date.now(),
                txUrl: txUrl
              }
            })
          });

          if (updateResponse.ok) {
            console.log('✅ Updated Redis ZK receipt for completed payment link');
          } else {
            console.warn('⚠️ Failed to update Redis ZK receipt for completed payment link');
          }
        } catch (updateError) {
          console.warn('⚠️ Error updating Redis ZK receipt for completed payment link:', updateError);
        }
      }

    } catch (error) {
      console.error('Error saving completed payment:', error);
    }

    // Call original callback if provided
    onPaymentCompleted?.(event);
  };

  const generatePaymentLink = async () => {
    if (!customAmount || parseFloat(customAmount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    let paymentLink = '';
    
    if (linkType === 'coinbase') {
      // Generate Coinbase Wallet request link
      paymentLink = generateCoinbaseWalletLink(toAddress, customAmount, 'USDC');
    } else {
      // 🔥 FIXED: Use proven owner address from ZK proof, not toAddress
      const provenOwnerAddress = zkProofs?.fkey?.claimData?.owner || zkProofs?.convos?.claimData?.owner;
      
      if (!provenOwnerAddress) {
        alert('❌ No ZK proof found. Please search for a valid fkey.id first.');
        return;
      }

      console.log('🔑 Using proven owner address for payment lookup:', {
        provenOwner: provenOwnerAddress,
        toAddress: toAddress,
        username: username
      });

      // 🔥 NEW: Use proper Daimo Pay API instead of deprecated deep links
      try {
        const contentId = `frontend_payment_${Date.now()}`;
        const response = await fetch(`/api/content/pay?id=${contentId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userAddress: provenOwnerAddress, // ✅ Use proven owner address for stealth lookup
            amount: customAmount,
            currency: 'USDC',
          }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.paymentUrl) {
            paymentLink = data.paymentUrl;
            console.log('✅ Generated proper Daimo Pay API link:', paymentLink);
          } else {
            throw new Error('No payment URL in response');
          }
        } else {
          const errorText = await response.text();
          console.error('❌ API Response Error:', {
            status: response.status,
            statusText: response.statusText,
            errorText
          });
          throw new Error(`API error: ${response.status} - ${errorText}`);
        }
      } catch (error) {
        console.error('❌ Daimo Pay API failed:', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          type: typeof error
        });
        
        // 🔥 NO MORE FALLBACK TO DEPRECATED LINKS - Force proper API usage
        alert(`Payment link generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return; // Exit early instead of generating deprecated link
      }
    }
    
    setGeneratedLink(paymentLink);

    // Create payment link record with ZK proof data
    const linkId = `link_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const paymentLinkData: GeneratedPaymentLink = {
      id: linkId,
      timestamp: Date.now(),
      amount: parseFloat(customAmount).toString(),
      token: 'USDC',
      recipientAddress: toAddress,
      paymentUrl: paymentLink,
      memo: memo || 'ZK Stealth Payment via FluidKey',
      fkeyId: username ? `${username}.fkey.id` : `${toAddress.slice(0, 6)}...${toAddress.slice(-4)}`,
      isCompleted: false,
      lastChecked: Date.now(),
      // Include ZK proof data if available
      zkProof: (zkProofs?.fkey || zkProofs?.convos) ? {
        fkey: zkProofs?.fkey || null,
        convos: zkProofs?.convos || null,
        verificationResults: {
          fkey: zkVerification?.fkey || null,
          convos: zkVerification?.convos || null,
        }
      } : undefined,
    };

    // Save to localStorage as ZK receipt
    const updatedLinks = [...generatedPaymentLinks, paymentLinkData];
    setGeneratedPaymentLinks(updatedLinks);

    // 🔧 NEW: Save ZK receipt to Redis for payment link creation
    try {
      const zkReceiptKey = `zk_receipt:payment_link_${linkId}:${toAddress.toLowerCase()}:${Date.now()}`;
      const zkReceiptData = {
        transactionHash: '', // Will be filled when payment is completed
        networkId: 'base',
        amount: paymentLinkData.amount,
        currency: 'USDC',
        recipientAddress: toAddress,
        fkeyId: paymentLinkData.fkeyId,
        senderAddress: toAddress, // For link creation, this is the recipient address
        timestamp: Date.now(),
        status: 'pending_payment',
        paymentLinkId: linkId,
        paymentUrl: paymentLink,
        // Include the ZK proof from the search
        zkProof: zkProofs?.fkey || zkProofs?.convos || null,
        metadata: {
          transactionType: "Payment Link Created",
          privacyFeature: "stealth-address",
          zkProofAvailable: !!(zkProofs?.fkey || zkProofs?.convos),
          source: "frontend-payment-link-creation",
          paymentMethod: "daimo-pay-link",
          memo: memo || 'ZK Stealth Payment via FluidKey'
        }
      };

      // Save to Redis via API call
      await fetch('/api/zkreceipts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          key: zkReceiptKey,
          data: zkReceiptData
        })
      });

      console.log('✅ ZK receipt saved to Redis for payment link creation:', zkReceiptKey);
    } catch (receiptError) {
      console.warn('⚠️ Failed to save ZK receipt to Redis for payment link:', receiptError);
      // Don't fail the link generation if receipt storage fails
    }

    // Call callback if provided
    onLinkGenerated?.(paymentLinkData);

    // Log the generated payment link
    console.log('🔗 Payment link generated and saved as ZK receipt:', {
      linkId,
      amount: paymentLinkData.amount,
      recipient: paymentLinkData.recipientAddress,
      url: paymentLink,
      hasZkProof: !!paymentLinkData.zkProof,
      zkProofDetails: paymentLinkData.zkProof ? {
        fkeyAvailable: !!paymentLinkData.zkProof.fkey,
        convosAvailable: !!paymentLinkData.zkProof.convos,
        fkeyVerified: !!paymentLinkData.zkProof.verificationResults?.fkey?.isValid,
        convosVerified: !!paymentLinkData.zkProof.verificationResults?.convos?.isValid,
      } : null
    });
  };

  const copyLink = async () => {
    if (!generatedLink) return;
    
    try {
      await navigator.clipboard.writeText(generatedLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };

  const openLink = () => {
    if (!generatedLink) return;
    window.open(generatedLink, '_blank');
  };

  return (
    <div className="w-full flex justify-center">
      <div className="w-full max-w-sm">
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg p-1 shadow-lg">
          <div className="bg-gray-900 rounded-lg p-4">
            <style dangerouslySetInnerHTML={{
              __html: `
                .daimo-button-container button,
                .daimo-button-container button[type="button"],
                .daimo-button-container [role="button"] {
                  all: unset !important;
                  box-sizing: border-box !important;
                  background: linear-gradient(to right, #16a34a, #15803d) !important;
                  border: none !important;
                  border-radius: 8px !important;
                  color: white !important;
                  font-weight: 500 !important;
                  padding: 8px 16px !important;
                  width: 100% !important;
                  min-width: 0 !important;
                  max-width: none !important;
                  height: auto !important;
                  min-height: 36px !important;
                  transition: all 200ms ease !important;
                  font-size: 14px !important;
                  font-family: inherit !important;
                  display: flex !important;
                  align-items: center !important;
                  justify-content: center !important;
                  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05) !important;
                  transform: scale(1) !important;
                  cursor: pointer !important;
                  text-align: center !important;
                  white-space: nowrap !important;
                  user-select: none !important;
                  outline: none !important;
                }
                
                .daimo-button-container button:hover,
                .daimo-button-container button[type="button"]:hover,
                .daimo-button-container [role="button"]:hover {
                  background: linear-gradient(to right, #15803d, #166534) !important;
                  transform: scale(1.05) !important;
                  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04) !important;
                }
                
                .daimo-button-container button:active,
                .daimo-button-container button[type="button"]:active,
                .daimo-button-container [role="button"]:active {
                  transform: scale(1) !important;
                }
                
                .daimo-button-container button::before,
                .daimo-button-container button[type="button"]::before,
                .daimo-button-container [role="button"]::before {
                  content: 'Pay Now' !important;
                  font-weight: 500 !important;
                  font-size: 14px !important;
                }
                
                .daimo-button-container button > *,
                .daimo-button-container button[type="button"] > *,
                .daimo-button-container [role="button"] > * {
                  display: none !important;
                }
                
                .daimo-button-container * {
                  all: unset !important;
                }
              `
            }} />
            <div className="text-center mb-3">
              <div className="flex items-center justify-center gap-2 mb-2">
                <div className="w-8 h-8 bg-gradient-to-r from-green-400 to-blue-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-bold">D</span>
                </div>
                <span className="text-white font-semibold">Daimo Pay</span>
              </div>
              <div className="text-gray-300 text-sm">
                ZK Stealth Payment • Multi-chain • Any wallet
              </div>
            </div>
            
            {/* Action Buttons */}
            <div className="flex gap-2 mb-4">
              <div className="flex-1 daimo-button-container">
                <DaimoPay
                  // Required props using baseUSDC configuration
                  appId={env.NEXT_PUBLIC_DAIMO_APP_ID || "pay-demo"}
                  toChain={baseUSDC.chainId}
                  toAddress={getAddress(toAddress)}
                  toToken={getAddress(baseUSDC.token)}
                  
                  // Use standard intent to avoid deposit mode restrictions
                  intent="Pay"
                  
                  // Optional props - removed externalId as it's unsupported in deposit mode
                  metadata={{
                    source: 'fluidkey_miniapp',
                    protocol: 'x402',
                    version: '1.0',
                    memo: memo || '',
                    paymentType: 'zk_stealth_payment', // Add as metadata instead
                    ...metadata,
                  }}
                  
                  // Event handlers
                  onPaymentStarted={(event) => {
                    console.log("💳 ZK Stealth Payment Started:", event);
                    onPaymentStarted?.(event);
                  }}
                  onPaymentCompleted={handlePaymentCompleted}
                  onPaymentBounced={(event) => {
                    console.log("❌ ZK Stealth Payment Bounced:", event);
                    onPaymentBounced?.(event);
                  }}
                  
                  disabled={disabled}
                />
              </div>
              
              <button
                onClick={() => {
                  setShowLinkGenerator(!showLinkGenerator);
                  if (generatedLink) {
                    setGeneratedLink('');
                    setCustomAmount('');
                  }
                }}
                className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-lg font-medium text-sm transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
                disabled={disabled}
              >
                Generate Link
              </button>
            </div>

            {/* Link Generator Section */}
            {showLinkGenerator && (
              <div className="border-t border-gray-700 pt-4 mt-4">
                <div className="text-white text-sm font-medium mb-3">
                  Generate Custom {linkType === 'coinbase' ? 'CBW' : 'Daimo'} Link
                </div>
                
                {!generatedLink ? (
                  <div className="space-y-3">
                    {/* Amount Input */}
                    <div>
                      <label className="block text-gray-300 text-xs mb-1">
                        Amount (USDC)
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          placeholder="0.00"
                          value={customAmount}
                          onChange={(e) => setCustomAmount(e.target.value)}
                          className="w-full px-3 py-2 pr-20 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          step="0.01"
                          min="0"
                        />
                        <div className="absolute right-3 top-2 flex items-center gap-1 text-gray-400 text-sm">
                          <div className="w-4 h-4 rounded-full bg-blue-600 flex items-center justify-center">
                            <span className="text-white text-xs font-bold">$</span>
                          </div>
                          <span>USDC</span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Generate Button */}
                    {/* 🔥 NEW: Link Type Toggle */}
                    <div className="mb-3">
                      <label className="block text-gray-300 text-xs mb-2">
                        Payment Link Type
                      </label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setLinkType('daimo')}
                          className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                            linkType === 'daimo'
                              ? 'bg-gradient-to-r from-green-600 to-teal-600 text-white'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          Daimo Pay
                        </button>
                        <button
                          onClick={() => setLinkType('coinbase')}
                          className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                            linkType === 'coinbase'
                              ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                          }`}
                        >
                          Coinbase Wallet
                        </button>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => generatePaymentLink()}
                      disabled={!customAmount || parseFloat(customAmount) <= 0}
                      className={`w-full px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 disabled:cursor-not-allowed text-white ${
                        linkType === 'coinbase'
                          ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-700'
                          : 'bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700 disabled:from-gray-600 disabled:to-gray-700'
                      }`}
                    >
                      Generate {linkType === 'coinbase' ? 'Coinbase Wallet' : 'Daimo'} Link
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Generated Link Display */}
                    <div>
                      <label className="block text-gray-300 text-xs mb-1">
                        Generated Link ({customAmount} USDC)
                      </label>
                      <div className="bg-gray-800 border border-gray-600 rounded-lg p-3">
                        <div className="text-gray-300 text-xs break-all font-mono">
                          {generatedLink}
                        </div>
                      </div>
                    </div>
                    
                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      <button
                        onClick={openLink}
                        className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg font-medium text-sm transition-all duration-200"
                      >
                        Open Payment Link
                      </button>
                      <button
                        onClick={copyLink}
                        className={`flex-1 px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 ${
                          linkCopied 
                            ? 'bg-green-600 text-white' 
                            : 'bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white'
                        }`}
                      >
                        {linkCopied ? '✓ Copied!' : 'Copy Link'}
                      </button>
                    </div>
                    
                    {/* Generate New Link Button */}
                    <button
                      onClick={() => {
                        setGeneratedLink('');
                        setCustomAmount('');
                      }}
                      className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg font-medium text-sm transition-all duration-200"
                    >
                      Generate New Link
                    </button>
                  </div>
                )}
              </div>
            )}
            
            <div className="mt-3 text-center">
              <div className="text-xs text-gray-400">
                Powered by Daimo Pay SDK • ZK Verified • Secure
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 