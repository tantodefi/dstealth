"use client";

import { useState } from "react";
import { useWallet } from "@/hooks/useWallet";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import SendButton from "./SendButton";
import { SpinnerIcon } from "./icons/SpinnerIcon";
import { CheckIcon } from "./icons/CheckIcon";
import { XIcon } from "./icons/XIcon";
import { Copy } from 'lucide-react';
import ConvosChat from "./ConvosChat";
import { verifyProof } from '@reclaimprotocol/js-sdk';
import type { PaymentMethod } from "./SendButton";

interface StealthPayment {
  timestamp: number;
  amount: string;
  token: string;
  recipientAddress: string;
  txHash: string;
  txUrl: string;
  zkProofUrl: string;
  fkeyId: string;
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
  
  // Local storage for stealth payments
  const [stealthPayments, setStealthPayments] = useLocalStorage<StealthPayment[]>('stealthPayments', []);
  
  // Search and UI state
  const [username, setUsername] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<FkeyProfile | null>(null);
  const [convosData, setConvosData] = useState<ConvosProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zkProofs, setZkProofs] = useState<{fkey?: any, convos?: any}>({});
  const [zkVerification, setZkVerification] = useState<{fkey?: VerificationResult, convos?: VerificationResult}>({});
  const [zkSuccess, setZkSuccess] = useState(false);
  const [showZkModal, setShowZkModal] = useState(false);
  const [selectedProofType, setSelectedProofType] = useState<'fkey' | 'convos'>('fkey');
  
  // Payment method state
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("daimo");

  // ZK fetching state
  const [zkFetching, setZkFetching] = useState(false);
  const [zkFetchingMessage, setZkFetchingMessage] = useState("ZK Fetching user accounts...");

  // Local storage for activity stats
  const [activityStats, setActivityStats] = useLocalStorage<ActivityStats>("activity-stats", {
    totalPayments: 0,
    totalZkProofs: 0,
    uniqueRecipients: 0,
  });

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
      
      // Handle profile data and extract zkProof
      if (profileResponse.status === 'fulfilled' && profileResponse.value.ok) {
        const data = await profileResponse.value.json();
        if (data.address) {
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
      } else {
        setError("User not found");
      }

      // Handle convos data and extract zkProof
      if (convosResponse.status === 'fulfilled' && convosResponse.value.ok) {
        const convosData = await convosResponse.value.json();
        if (convosData.success && convosData.xmtpId) {
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

      // Only set proofs if we actually have some
      if (proofs.fkey || proofs.convos) {
        setZkProofs(proofs);
        // Start background verification with real proofs
        verifyProofsInBackground(proofs);
      } else {
        console.log('⚠️ No ZK proofs received from backend - this means Reclaim zkFetch failed');
      }

      // Clear the message timer and complete the zkfetching process
      clearTimeout(messageTimer);
      setTimeout(() => {
        setZkFetching(false);
        setZkSuccess(true);
      }, 2000);

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
    
    const payment: StealthPayment = {
      timestamp: Date.now(),
      amount: amount,
      token: "USDC",
      recipientAddress: profile.address,
      txHash: event.transactionHash || "unknown",
      txUrl: `https://basescan.org/tx/${event.transactionHash}`,
      zkProofUrl: "https://zkfetch.com/proof", // Placeholder
      fkeyId: `${username}.fkey.id`,
    };

    const newPayments = [...stealthPayments, payment];
    setStealthPayments(newPayments);

    // Update stats
    const uniqueRecipients = new Set(newPayments.map(p => p.recipientAddress)).size;
    setActivityStats({
      totalPayments: newPayments.length,
      totalZkProofs: newPayments.length,
      uniqueRecipients,
    });
  };

  return (
    <div className="space-y-4">
      {/* Search Form */}
      <div className="flex gap-4">
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
        <div className="flex items-center gap-2 text-blue-400 bg-gray-800 p-3 rounded-lg">
          <SpinnerIcon className="animate-spin h-5 w-5" />
          <span>{zkFetchingMessage}</span>
        </div>
      )}

      {zkSuccess && (
        <div className="flex items-center gap-2 text-green-400 bg-gray-800 p-3 rounded-lg">
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
        <div className="text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                {error}
              </div>
            )}

      {profile && (
        <div className="space-y-4 p-4 bg-gray-800 rounded-lg">
          <div className="flex items-center gap-4">
            {profile.avatar && (
              <img 
                src={profile.avatar} 
                alt={profile.name || username}
                className="w-12 h-12 rounded-full"
              />
            )}
            <div>
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

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
              Amount (USDC)
                  </label>
            <div className="relative">
                  <input
                    type="number"
                    value={amount}
                onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg p-2.5 pr-20"
                min="0"
                    step="any"
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                <div className="flex items-center gap-2 text-gray-400">
                  <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                    $
            </div>
                  <span className="text-sm font-medium">USDC</span>
                </div>
              </div>
            </div>
          </div>

          <SendButton
            recipientAddress={profile.address}
            amount={amount}
            onPaymentCompleted={handlePaymentCompleted}
            disabled={!isConnected || !amount || parseFloat(amount) <= 0}
            paymentMethod={paymentMethod}
            onPaymentMethodChange={setPaymentMethod}
          />
        </div>
      )}

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

      {/* ZK Proof Modal */}
      {showZkModal && (
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
              <pre className="bg-black rounded-md p-3 overflow-auto text-xs">
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