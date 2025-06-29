"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@/hooks/useWallet";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { SpinnerIcon } from "./icons/SpinnerIcon";
import { CheckIcon } from "./icons/CheckIcon";
import { XIcon } from "./icons/XIcon";
import { Copy } from 'lucide-react';
import ConvosChat from "./ConvosChat";
import { verifyProof } from '@reclaimprotocol/js-sdk';
import DaimoPayButton from "./DaimoPayButton";
import { useAccount } from "wagmi";

interface StealthPayment {
  timestamp: number;
  amount: string;
  token: string;
  recipientAddress: string;
  txHash: string;
  txUrl: string;
  zkProofUrl: string;
  fkeyId: string;
  proof?: any;
}

interface ActivityStats {
  totalPayments: number;
  totalZkProofs: number;
  uniqueRecipients: number;
}

interface FkeyProfile {
  address: string;
  name?: string;
  description?: string;
  avatar?: string;
}

interface ConvosProfile {
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
}

interface VerificationResult {
  isValid: boolean;
  error?: string;
  details?: any;
}

// Verify proof using Reclaim Protocol SDK
const verifyReclaimProof = async (proof: any): Promise<VerificationResult> => {
  try {
    console.log('🔐 Starting Reclaim Protocol verification...');
    console.log('Proof structure:', {
      hasClaimData: !!proof?.claimData,
      signatureCount: proof?.signatures?.length,
      witnessCount: proof?.witnesses?.length,
      hasIdentifier: !!proof?.identifier,
      hasEpoch: !!proof?.epoch
    });

    // Basic proof structure validation first
    if (!proof || !proof.claimData || !proof.signatures || !proof.witnesses) {
      return {
        isValid: false,
        error: "Invalid proof structure: missing required fields"
      };
    }

    // Validate signatures array
    if (!Array.isArray(proof.signatures) || proof.signatures.length === 0) {
      return {
        isValid: false,
        error: "Invalid proof: no signatures found"
      };
    }

    // Validate witnesses array
    if (!Array.isArray(proof.witnesses) || proof.witnesses.length === 0) {
      return {
        isValid: false,
        error: "Invalid proof: no witnesses found"
      };
    }

    console.log('✅ Basic structure validation passed');
    console.log('🔍 Performing cryptographic verification with Reclaim SDK...');

    // Use the actual Reclaim Protocol verifyProof function
    const isProofValid = await verifyProof(proof);
    
    console.log(`🔐 Reclaim verification result: ${isProofValid ? 'VALID ✅' : 'INVALID ❌'}`);

    if (isProofValid) {
      const verificationDetails = {
        signatureCount: proof.signatures.length,
        witnessCount: proof.witnesses.length,
        provider: proof.claimData.provider,
        timestamp: new Date(proof.claimData.timestampS * 1000).toISOString(),
        identifier: proof.identifier,
        epoch: proof.epoch,
        cryptographicallyVerified: true,
        reclaimSdkVersion: '3.0.4'
      };

      return {
        isValid: true,
        details: verificationDetails
      };
    } else {
      return {
        isValid: false,
        error: "Cryptographic verification failed - proof signatures or witnesses are invalid"
      };
    }

      } catch (error) {
    console.error('❌ Reclaim verification error:', error);
    return {
      isValid: false,
      error: `Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
};

// Copy button component with animation
function CopyButton({ text, className = "", title = "Copy to clipboard" }: { text: string; className?: string; title?: string }) {
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
      title={title}
    >
      {copied ? (
        <CheckIcon className="h-4 w-4 text-green-400" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </button>
  );
}

export function FkeySearch() {
  // Wallet connection state
  const { isConnected } = useWallet();
  const { address } = useAccount();
  
  // Enhanced ephemeral wallet detection
  const isEphemeralWallet = address?.toLowerCase().startsWith('0x0') || false;
  const isWalletConnected = isConnected || !!address;
  
  // Debug logging for ephemeral wallet issues
  console.log('🔍 Enhanced Wallet Debug:', {
    isConnected,
    address,
    isEphemeralWallet,
    isWalletConnected,
    addressLength: address?.length,
    hasValidAddress: !!address && address.length > 10
  });
  
  // Local storage for stealth payments
  const [stealthPayments, setStealthPayments] = useLocalStorage<StealthPayment[]>('stealthPayments', []);
  
  // Search and UI state
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<FkeyProfile | null>(null);
  const [convosData, setConvosData] = useState<ConvosProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zkProofs, setZkProofs] = useState<{fkey?: any, convos?: any}>({});
  const [zkVerification, setZkVerification] = useState<{fkey?: VerificationResult, convos?: VerificationResult}>({});
  const [zkSuccess, setZkSuccess] = useState(false);
  const [showZkModal, setShowZkModal] = useState(false);
  const [selectedProofType, setSelectedProofType] = useState<'fkey' | 'convos'>('fkey');

  // ZK fetching state
  const [zkFetching, setZkFetching] = useState(false);
  const [zkFetchingMessage, setZkFetchingMessage] = useState("ZK Fetching user accounts...");

  // Local storage for activity stats
  const [activityStats, setActivityStats] = useLocalStorage<ActivityStats>("activity-stats", {
    totalPayments: 0,
    totalZkProofs: 0,
    uniqueRecipients: 0,
  });



  // Clear results when username changes (immediate clearing on input change)
  useEffect(() => {
    // Clear all search results when username changes
    setProfile(null);
    setConvosData(null);
    setZkProofs({});
    setZkVerification({});
    setZkSuccess(false);
    setError(null);
    setZkFetching(false);
  }, [username]);

  const handleSearch = async () => {
    if (!username) return;

    setLoading(true);
    setError("");
    setProfile(null);
    setConvosData(null);
    
    // Start ZK fetching immediately with progressive messaging
    setZkFetching(true);
    setZkSuccess(false);
    setZkProofs({});
    setZkVerification({});
    setZkFetchingMessage("ZK Fetching user accounts...");
    
    // Set up progressive messaging
    const messageTimer = setTimeout(() => {
      setZkFetchingMessage("Generating proof...");
    }, 5000); // Change message after 5 seconds
    
    try {
      // Fetch profile and convos data from backend (which includes real ZK proofs)
      const [profileResponse, convosResponse] = await Promise.allSettled([
        fetch(`/api/fkey/lookup/${username}`),
        fetch(`/api/convos/lookup/${username}`)
      ]);

      const proofs: {fkey?: any, convos?: any} = {};
      let fkeyUserExists = false;
      let convosUserExists = false;
      
      // Handle profile data and extract zkProof
      if (profileResponse.status === 'fulfilled' && profileResponse.value.ok) {
        const data = await profileResponse.value.json();
        if (data.address) {
          fkeyUserExists = true;
          setProfile(data);
          // Extract the real ZK proof from backend response
          if (data.proof) {
            console.log('🔐 Received REAL Reclaim Protocol ZK proof from backend for fkey:', data.proof);
            console.log('📊 Proof validation:', {
              hasClaimData: !!data.proof.claimData,
              hasSignatures: !!data.proof.signatures?.length,
              hasWitnesses: !!data.proof.witnesses?.length,
              signatureCount: data.proof.signatures?.length,
              witnessCount: data.proof.witnesses?.length,
              provider: data.proof.claimData?.provider,
              timestamp: data.proof.claimData?.timestampS
            });
            proofs.fkey = data.proof;
          } else {
            console.log('⚠️ No ZK proof received from backend for fkey - Reclaim zkFetch may have failed');
          }
        }
      }

      // Handle convos data and extract zkProof
      if (convosResponse.status === 'fulfilled' && convosResponse.value.ok) {
        const convosData = await convosResponse.value.json();
        if (convosData.success && convosData.xmtpId) {
          convosUserExists = true;
          setConvosData(convosData);
          // Extract the real ZK proof from backend response
          if (convosData.proof) {
            console.log('🔐 Received REAL Reclaim Protocol ZK proof from backend for convos:', convosData.proof);
            console.log('📊 Proof validation:', {
              hasClaimData: !!convosData.proof.claimData,
              hasSignatures: !!convosData.proof.signatures?.length,
              hasWitnesses: !!convosData.proof.witnesses?.length,
              signatureCount: convosData.proof.signatures?.length,
              witnessCount: convosData.proof.witnesses?.length,
              provider: convosData.proof.claimData?.provider,
              timestamp: convosData.proof.claimData?.timestampS
            });
            proofs.convos = convosData.proof;
          } else {
            console.log('⚠️ No ZK proof received from backend for convos - Reclaim zkFetch may have failed');
          }
        }
      }

      // Handle different scenarios based on what was found
      if (!fkeyUserExists && !convosUserExists) {
        // Neither fkey nor convos user exists - show generic invite
        setError(`${username}.fkey.id does not exist`);
      } else if (!fkeyUserExists && convosUserExists) {
        // Convos user found but no fkey - show special message for messaging
        setError(`${username}.fkey.id not found, but convos user found`);
      } else {
        // fkey user exists (with or without convos) - clear any error
        setError("");
      }

      // Only set proofs and show success if we have valid data
      if (proofs.fkey || proofs.convos) {
        setZkProofs(proofs);
        // Start background verification with real proofs
        verifyProofsInBackground(proofs);
        
        // Clear the message timer and complete the zkfetching process
        clearTimeout(messageTimer);
        setTimeout(() => {
          setZkFetching(false);
          setZkSuccess(true);
        }, 2000);
      } else {
        // No proofs means no valid users were found or zkFetch failed
        clearTimeout(messageTimer);
        setZkFetching(false);
        console.log('⚠️ No ZK proofs received from backend - this means Reclaim zkFetch failed or users do not exist');
      }

    } catch (error) {
      clearTimeout(messageTimer);
      setError("Search failed");
      setZkFetching(false);
    } finally {
      setLoading(false);
    }
  };

  const verifyProofsInBackground = async (proofs: {fkey?: any, convos?: any}) => {
    const verifications: {fkey?: VerificationResult, convos?: VerificationResult} = {};
    
    // Verify fkey proof
    if (proofs.fkey) {
      console.log('\n=== Starting fkey proof verification ===');
      console.log('Proof data:', proofs.fkey);
      
      try {
        const isProofVerified = await verifyReclaimProof(proofs.fkey);
        verifications.fkey = isProofVerified;
        console.log(`fkey verification completed. Result: ${isProofVerified.isValid ? 'SUCCESS' : 'FAILED'}`);
    } catch (error) {
        console.error('❌ fkey verification error:', error);
        verifications.fkey = {
          isValid: false,
          error: `Error verifying proof: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    }
    
    // Verify convos proof
    if (proofs.convos) {
      console.log('\n=== Starting convos proof verification ===');
      console.log('Proof data:', proofs.convos);
      
      try {
        const isProofVerified = await verifyReclaimProof(proofs.convos);
        verifications.convos = isProofVerified;
        console.log(`convos verification completed. Result: ${isProofVerified.isValid ? 'SUCCESS' : 'FAILED'}`);
      } catch (error) {
        console.error('❌ convos verification error:', error);
        verifications.convos = {
          isValid: false,
          error: `Error verifying proof: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    }
    
    setZkVerification(verifications);
  };

  const handlePaymentCompleted = (event: any) => {
    if (!profile) return;
    
    console.log('🎯 Processing payment completion event:', event);
    
    // Extract transaction details from Daimo SDK event
    const transactionHash = event.transactionHash || event.hash || event.txHash || `fallback_${Date.now()}`;
    const paymentAmount = event.amount || event.value || "unknown";
    const chainId = event.chainId || event.chain || 8453; // Default to Base (8453)
    const tokenAddress = event.token || event.tokenAddress;
    
    // Generate appropriate block explorer URL based on chain
    const getBlockExplorerUrl = (chainId: number, txHash: string) => {
      const explorers = {
        1: `https://etherscan.io/tx/${txHash}`, // Ethereum
        8453: `https://basescan.org/tx/${txHash}`, // Base
        10: `https://optimistic.etherscan.io/tx/${txHash}`, // Optimism
        137: `https://polygonscan.com/tx/${txHash}`, // Polygon
        42161: `https://arbiscan.io/tx/${txHash}`, // Arbitrum
        480: `https://worldscan.org/tx/${txHash}`, // World Chain
      };
      return explorers[chainId] || `https://basescan.org/tx/${txHash}`; // Default to Base
    };
    
    // Determine token symbol based on address or default
    const getTokenSymbol = (tokenAddress: string, chainId: number) => {
      if (!tokenAddress) return "USDC";
      
      // Common USDC addresses
      const usdcAddresses = {
        "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913": "USDC", // Base USDC
        "0xA0b86a33E6417Ddcf45e8DaF88C6D8AC22f7e1C": "USDC", // Ethereum USDC
        "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85": "USDC", // Optimism USDC
      };
      
      return usdcAddresses[tokenAddress] || "USDC";
    };
    
    // Combine all available ZK proofs (both fkey and convos if available)
    const combinedProof = {
      fkey: zkProofs.fkey || null,
      convos: zkProofs.convos || null,
      verificationResults: {
        fkey: zkVerification.fkey || null,
        convos: zkVerification.convos || null,
      },
      // Include metadata about which proofs are verified
      verified: {
        fkey: zkVerification.fkey?.isValid || false,
        convos: zkVerification.convos?.isValid || false,
      }
    };
    
    // Create enhanced payment record with complete transaction and ZK proof data
    const payment: StealthPayment = {
      timestamp: Date.now(),
      amount: paymentAmount.toString(),
      token: getTokenSymbol(tokenAddress, chainId),
      recipientAddress: profile.address,
      txHash: transactionHash,
      txUrl: getBlockExplorerUrl(chainId, transactionHash),
      zkProofUrl: `https://zkfetch.com/proof/${transactionHash}`,
      fkeyId: `${username}.fkey.id`,
      // Enhanced proof data with verification results
      proof: combinedProof.fkey || combinedProof.convos ? {
        ...((combinedProof.fkey || combinedProof.convos)),
        // Add metadata about this specific payment
        paymentMetadata: {
          chainId,
          tokenAddress,
          daimoPayment: true,
          timestamp: Date.now(),
          verifiedProofs: Object.keys(combinedProof.verified).filter(key => combinedProof.verified[key])
        }
      } : undefined,
    };

    // Add to localStorage (this automatically updates the ZK Receipts tab)
    const newPayments = [...stealthPayments, payment];
    setStealthPayments(newPayments);

    // Update activity stats
    const uniqueRecipients = new Set(newPayments.map(p => p.recipientAddress)).size;
    const hasValidZkProof = combinedProof.verified.fkey || combinedProof.verified.convos;
    
    setActivityStats({
      totalPayments: newPayments.length,
      totalZkProofs: hasValidZkProof ? activityStats.totalZkProofs + 1 : activityStats.totalZkProofs,
      uniqueRecipients,
    });

    // Comprehensive logging for debugging and tracking
    console.log('💰 Payment completed and saved to ZK receipts:', {
      transactionHash,
      amount: paymentAmount,
      token: getTokenSymbol(tokenAddress, chainId),
      recipient: payment.recipientAddress,
      chainId,
      blockExplorerUrl: payment.txUrl,
      hasZkProof: !!payment.proof,
      zkProofDetails: {
        fkeyAvailable: !!combinedProof.fkey,
        convosAvailable: !!combinedProof.convos,
        fkeyVerified: combinedProof.verified.fkey,
        convosVerified: combinedProof.verified.convos,
        totalVerifiedProofs: Object.values(combinedProof.verified).filter(Boolean).length
      },
      savedToLocalStorage: true,
      paymentCount: newPayments.length
    });
    
    // Optional: Show success notification to user
    console.log(`✅ Transaction ${transactionHash.slice(0, 6)}...${transactionHash.slice(-4)} saved to ZK Receipts tab!`);
  };

  return (
    <div className="space-y-4 mobile-scroll hide-scrollbar">
      {/* Search Form */}
      <div className="flex gap-4 mobile-scroll hide-scrollbar">
                <input
                  type="text"
                  value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Enter fkey.id username"
          className="flex-1 bg-gray-800 border border-gray-700 text-white rounded-lg p-2.5"
          onKeyPress={(e) => {
            if (e.key === "Enter" && !loading) {
              handleSearch();
            }
          }}
        />
              <button
          onClick={handleSearch}
          disabled={!username || loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Searching..." : "Search"}
              </button>
            </div>

      {/* Simple Loading/Status Messages */}
      {zkFetching && (
        <div className="flex items-center gap-2 text-blue-400 bg-gray-800 p-3 rounded-lg mobile-scroll hide-scrollbar">
          <SpinnerIcon className="animate-spin h-5 w-5" />
          <span>{zkFetchingMessage}</span>
        </div>
      )}

      {zkSuccess && (
        <div className="flex items-center gap-2 text-green-400 bg-gray-800 p-3 rounded-lg mobile-scroll hide-scrollbar">
          <CheckIcon className="h-5 w-5" />
          <button
            onClick={() => setShowZkModal(true)}
            className="underline hover:text-green-300 cursor-pointer"
          >
            Reclaim Protocol verification complete ✓
          </button>
        </div>
      )}

      {error && (
        <div className="mobile-scroll hide-scrollbar">
          {error === `${username}.fkey.id does not exist` ? (
            // User doesn't exist on FluidKey - show invite option
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4 space-y-3">
              <div className="text-orange-200">
                <p className="font-medium">⚠️ {username}.fkey.id does not exist</p>
                <p className="text-sm mt-1">This user hasn&apos;t joined FluidKey yet.</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      const referralUrl = "https://app.fluidkey.com/?ref=62YNSG";
                      try {
                        await navigator.clipboard.writeText(referralUrl);
                        console.log('✅ Referral link copied to clipboard');
                      } catch (err) {
                        console.error('Failed to copy referral link:', err);
                      }
                    }}
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-lg font-medium transition-colors"
                  >
                    📧 Invite them to FluidKey
                  </button>
                  <CopyButton 
                    text="https://app.fluidkey.com/?ref=62YNSG" 
                    title="Copy invite link"
                    className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
                  />
                </div>
                <div className="text-xs text-orange-300">
                  Invite link: https://app.fluidkey.com/?ref=62YNSG
                </div>
              </div>
            </div>
          ) : error === `${username}.fkey.id not found, but convos user found` ? (
            // Convos user found but no fkey - show special message
            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 space-y-3">
              <div className="text-yellow-200">
                <p className="font-medium">💬 {username}.fkey.id not found</p>
                <p className="text-sm mt-1">But {username} exists on convos! Send them a FluidKey invite.</p>
              </div>
              <div className="text-xs text-yellow-300">
                💡 Use the message box below to invite them to join FluidKey
              </div>
            </div>
          ) : (
            // Generic error
            <div className="text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              {error}
            </div>
          )}
        </div>
      )}

      {profile && (
        <div className="space-y-4 p-4 bg-gray-800 rounded-lg mobile-scroll hide-scrollbar">
          <div className="flex items-center gap-4 mobile-scroll hide-scrollbar">
            {profile.avatar && (
              <img 
                src={profile.avatar} 
                alt={profile.name || username}
                className="w-12 h-12 rounded-full"
              />
            )}
            <div className="mobile-scroll hide-scrollbar">
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold text-white">{profile.name || username}.fkey.id</h3>
                <CopyButton text={`${username}.fkey.id`} title="Copy .fkey.id address" />
              </div>
              {profile.description && (
                <p className="text-gray-400">{profile.description}</p>
              )}
              <div className="flex items-center gap-2">
                <p className="text-gray-300 text-sm mt-1">Address: {profile.address}</p>
                <CopyButton text={profile.address} title="Copy wallet address" />
              </div>
                </div>
                </div>

                          {/* Simplified Daimo Pay SDK Implementation */}
          <div className="mobile-scroll hide-scrollbar">
            {isWalletConnected ? (
              <div className="space-y-4">
                {/* Enhanced Daimo Pay Header */}
                <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs font-bold">D</span>
                    </div>
                    <span className="text-green-100 font-medium">Daimo Pay</span>
                    <span className="text-green-300 text-xs">• {isEphemeralWallet ? 'Ephemeral' : 'Connected'} Wallet</span>
                  </div>
                  
                  <div className="flex items-center justify-between text-sm">
                    <div>
                      <div className="text-white font-semibold">ZK Stealth Payment</div>
                      <div className="text-green-200">to {username}.fkey.id</div>
                    </div>
                    <div className="text-right">
                      <div className="text-green-100">Multi-Chain Support</div>
                      <div className="text-white text-xs font-mono">
                        {profile.address.slice(0, 6)}...{profile.address.slice(-4)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Daimo Pay Button with Built-in Amount Input */}
                <DaimoPayButton
                  toAddress={profile.address as `0x${string}`}
                  memo={`ZK Stealth Payment to ${username}.fkey.id`}
                  metadata={{
                    fkeyId: `${username}.fkey.id`,
                    zkProofAvailable: String(!!(zkProofs.fkey || zkProofs.convos)),
                    zkProofProvider: String(zkProofs.fkey?.claimData?.provider || zkProofs.convos?.claimData?.provider || ''),
                    isEphemeral: String(address?.startsWith('0x0')),
                    timestamp: Date.now().toString(),
                    username: username,
                  }}
                  // Pass ZK proof data for payment link generation
                  zkProofs={zkProofs}
                  zkVerification={zkVerification}
                  username={username}
                  onLinkGenerated={(linkData) => {
                    console.log('🔗 Payment link generated:', linkData);
                  }}
                  onPaymentStarted={(event) => {
                    console.log('🚀 ZK Stealth Payment started:', event);
                  }}
                  onPaymentCompleted={(event) => {
                    console.log('✅ ZK Stealth Payment completed:', event);
                    handlePaymentCompleted({
                      method: "daimo-sdk",
                      hash: event.transactionHash || `daimo_sdk_${Date.now()}`,
                      amount: event.amount || "unknown", // SDK provides amount
                      network: 'base',
                      currency: 'USDC',
                      ...event
                    });
                  }}
                  onPaymentBounced={(event) => {
                    console.error('❌ ZK Stealth Payment bounced:', event);
                  }}
                  disabled={!isWalletConnected}
                />

                {/* ZK Proof Integration Footer */}
                <div className="bg-purple-900/20 border border-purple-600/30 rounded-lg p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-purple-200">
                      🔐 {zkProofs.fkey || zkProofs.convos ? 'ZK Verified Payment' : 'Standard Payment'}
                    </span>
                    <span className="text-purple-300">
                      {isEphemeralWallet ? 'Ephemeral Burner • ' : ''}Any Chain • Any Token
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <div className="text-gray-400 text-sm mb-2">
                  Connect wallet to continue
                </div>
                <div className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg opacity-50 cursor-not-allowed">
                  Pay with Daimo
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Render ConvosChat if we have convos data */}
      {convosData && (
        <div className="mobile-scroll hide-scrollbar">
          <ConvosChat
            xmtpId={convosData.xmtpId}
            username={convosData.username}
            url={convosData.url}
            profile={convosData.profile}
            defaultMessage={!profile?.address ? `hey you should join fluidkey here: https://app.fluidkey.com/?ref=62YNSG` : undefined}
          />
        </div>
      )}

      {/* ZK Proof Modal */}
      {showZkModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 z-50">
          <div className="bg-gray-900 rounded-lg p-4 w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto mobile-scroll hide-scrollbar">
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
                    {zkVerification.fkey?.isValid && (
                      <CheckIcon className="inline ml-1 h-3 w-3 text-green-500" />
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
                    {zkVerification.convos?.isValid && (
                      <CheckIcon className="inline ml-1 h-3 w-3 text-green-500" />
                    )}
                  </button>
                </div>
              </div>
              <button
                onClick={() => setShowZkModal(false)}
                className="text-gray-400 hover:text-gray-300"
                type="button"
              >
                ×
              </button>
            </div>
            
            {zkVerification[selectedProofType] ? (
              <div className={`text-sm mb-3 text-center ${
                zkVerification[selectedProofType]?.isValid
                  ? 'text-green-500'
                  : 'text-red-500'
              }`}>
                {zkVerification[selectedProofType]?.isValid 
                  ? '✅ Cryptographically verified with Reclaim Protocol' 
                  : `❌ ${zkVerification[selectedProofType]?.error || 'Cryptographic verification failed'}`
                }
              </div>
            ) : (
              <div className="text-sm mb-3 text-center text-blue-400">
                <span className="animate-spin inline-block mr-2">🔐</span>
                Performing cryptographic verification with Reclaim SDK...
              </div>
            )}

            {zkProofs[selectedProofType] ? (
              <pre className="bg-black rounded-md p-3 overflow-auto text-xs mobile-scroll hide-scrollbar">
                <code className="text-gray-300 whitespace-pre-wrap break-all">
                  {JSON.stringify(zkProofs[selectedProofType], null, 2)}
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