"use client";

import { useState, useEffect } from "react";
import { useAccount } from 'wagmi';
import { Button } from "@/components/Button";
import { CheckIcon } from "@/components/icons/CheckIcon";
import { ArrowLeft, Mail, AlertCircle, ExternalLink } from 'lucide-react';
import NotificationModal from './NotificationModal';
import Link from 'next/link';

interface ClaimStatus {
  isAvailable: boolean;
  claimedBy?: string;
  claimedAt?: string;
}

export default function FkeyClaimInterface() {
  const { address, isConnected } = useAccount();
  const [desiredFkey, setDesiredFkey] = useState('');
  const [claimStatus, setClaimStatus] = useState<ClaimStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [userClaim, setUserClaim] = useState<string | null>(null);
  const [notification, setNotification] = useState<{
    isOpen: boolean;
    type: 'success' | 'error' | 'loading';
    title: string;
    message: string;
  }>({
    isOpen: false,
    type: 'success',
    title: '',
    message: ''
  });

  // Storage key for user claims
  const getUserClaimKey = (userAddress: string) => `fkey_claim_${userAddress.toLowerCase()}`;
  const getFkeyClaimsKey = () => 'fkey_claims_registry';

  // Check if user has already claimed a fkey.id
  useEffect(() => {
    if (!isConnected || !address) {
      setUserClaim(null);
      return;
    }

    const claimKey = getUserClaimKey(address);
    const existingClaim = localStorage.getItem(claimKey);
    
    if (existingClaim) {
      setUserClaim(existingClaim);
    }
  }, [address, isConnected]);

  // Check availability of desired fkey
  const checkAvailability = async () => {
    if (!desiredFkey.trim()) {
      setClaimStatus(null);
      return;
    }

    // Validate fkey format (alphanumeric, 3-20 characters)
    const fkeyRegex = /^[a-zA-Z0-9]{3,20}$/;
    if (!fkeyRegex.test(desiredFkey)) {
      setClaimStatus({ isAvailable: false });
      setNotification({
        isOpen: true,
        type: 'error',
        title: 'Invalid Format',
        message: 'fkey.id must be 3-20 characters long and contain only letters and numbers.'
      });
      return;
    }

    setLoading(true);

    // Simulate checking availability (in real app, this would be an API call)
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check localStorage registry for claims
    const claimsRegistry = JSON.parse(localStorage.getItem(getFkeyClaimsKey()) || '{}');
    const normalizedFkey = desiredFkey.toLowerCase();
    
    if (claimsRegistry[normalizedFkey]) {
      setClaimStatus({
        isAvailable: false,
        claimedBy: claimsRegistry[normalizedFkey].address,
        claimedAt: claimsRegistry[normalizedFkey].claimedAt
      });
    } else {
      setClaimStatus({ isAvailable: true });
    }

    setLoading(false);
  };

  // Claim the fkey.id
  const claimFkey = async () => {
    if (!isConnected || !address || !claimStatus?.isAvailable || userClaim) {
      return;
    }

    setClaiming(true);

    setNotification({
      isOpen: true,
      type: 'loading',
      title: 'Claiming Your .fkey.id',
      message: `Registering ${desiredFkey}.fkey.id to your wallet...`
    });

    try {
      // Simulate blockchain transaction (in real app, this would interact with smart contract)
      await new Promise(resolve => setTimeout(resolve, 3000));

      const normalizedFkey = desiredFkey.toLowerCase();
      const claimData = {
        address: address,
        claimedAt: new Date().toISOString(),
        fkeyId: `${normalizedFkey}.fkey.id`
      };

      // Update claims registry
      const claimsRegistry = JSON.parse(localStorage.getItem(getFkeyClaimsKey()) || '{}');
      claimsRegistry[normalizedFkey] = claimData;
      localStorage.setItem(getFkeyClaimsKey(), JSON.stringify(claimsRegistry));

      // Update user's claim
      const userClaimKey = getUserClaimKey(address);
      localStorage.setItem(userClaimKey, `${normalizedFkey}.fkey.id`);
      setUserClaim(`${normalizedFkey}.fkey.id`);

      // Reset form
      setDesiredFkey('');
      setClaimStatus(null);

      setNotification({
        isOpen: true,
        type: 'success',
        title: '🎉 Claim Successful!',
        message: `${normalizedFkey}.fkey.id has been claimed and linked to your wallet!`
      });

    } catch (error) {
      setNotification({
        isOpen: true,
        type: 'error',
        title: 'Claim Failed',
        message: 'Failed to claim fkey.id. Please try again.'
      });
    } finally {
      setClaiming(false);
    }
  };

  // Handle input change with real-time validation
  const handleInputChange = (value: string) => {
    setDesiredFkey(value);
    setClaimStatus(null);
  };

  const getStatusColor = () => {
    if (!claimStatus) return 'border-gray-600';
    return claimStatus.isAvailable ? 'border-green-600' : 'border-red-600';
  };

  const getStatusIcon = () => {
    if (loading) {
      return <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-400"></div>;
    }
    if (!claimStatus) return null;
    return claimStatus.isAvailable ? 
      <CheckIcon className="h-5 w-5 text-green-400" /> : 
      <AlertCircle className="h-5 w-5 text-red-400" />;
  };

  return (
    <div className="min-h-screen">
      {/* Notification Modal */}
      <NotificationModal
        isOpen={notification.isOpen}
        onClose={() => setNotification(prev => ({ ...prev, isOpen: false }))}
        type={notification.type}
        title={notification.title}
        message={notification.message}
      />

      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/" className="text-gray-400 hover:text-white">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-3xl font-bold text-white">Claim Your .fkey.id</h1>
        </div>

        {/* Existing Claim Display */}
        {userClaim && (
          <div className="bg-green-900/20 border border-green-600/30 rounded-lg p-6 mb-8">
            <div className="flex items-center gap-3 mb-4">
              <Mail className="h-6 w-6 text-green-400" />
              <h2 className="text-xl font-bold text-white">Your .fkey.id</h2>
            </div>
            
            <div className="bg-black/20 rounded-lg p-4 mb-4">
              <div className="text-2xl font-bold text-green-400 mb-2">
                📧 {userClaim}
              </div>
              <div className="text-sm text-gray-400">
                Linked to: {address}
              </div>
            </div>

            <div className="flex gap-3">
              <Link
                href={`/u/${address}`}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center gap-1"
              >
                <ExternalLink className="h-4 w-4" />
                View Profile
              </Link>
              <button
                onClick={() => navigator.clipboard.writeText(`${window.location.origin}/u/${address}`)}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg"
              >
                Share Profile
              </button>
            </div>
          </div>
        )}

        {/* Main Claiming Interface */}
        <div className="bg-gray-800 rounded-lg p-8 max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <Mail className="h-16 w-16 text-purple-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-3">
              {userClaim ? 'Already Claimed' : 'Get Your Unique Identifier'}
            </h2>
            <p className="text-gray-400">
              {userClaim ? 
                'You have already claimed your .fkey.id. Each wallet can only claim one identifier.' :
                'Claim your personalized .fkey.id for your X402 profile. Each wallet address can claim only one identifier.'
              }
            </p>
          </div>

          {!userClaim && (
            <>
              {/* Input Section */}
              <div className="mb-6">
                <label className="block text-white font-semibold mb-3">
                  Choose your .fkey.id
                </label>
                
                <div className="relative">
                  <div className={`flex items-center border-2 ${getStatusColor()} rounded-lg bg-gray-700 transition-colors`}>
                    <input
                      type="text"
                      value={desiredFkey}
                      onChange={(e) => handleInputChange(e.target.value.toLowerCase())}
                      placeholder="yourname"
                      className="flex-1 bg-transparent text-white px-4 py-3 outline-none placeholder-gray-400"
                      maxLength={20}
                      disabled={claiming}
                    />
                    <div className="px-4 py-3 text-gray-400 font-mono">
                      .fkey.id
                    </div>
                    <div className="px-4">
                      {getStatusIcon()}
                    </div>
                  </div>
                </div>

                {/* Status Messages */}
                {claimStatus && !loading && (
                  <div className={`mt-3 p-3 rounded-lg ${
                    claimStatus.isAvailable ? 
                      'bg-green-900/20 border border-green-600/30' : 
                      'bg-red-900/20 border border-red-600/30'
                  }`}>
                    {claimStatus.isAvailable ? (
                      <div className="text-green-400 text-sm">
                        ✅ {desiredFkey}.fkey.id is available!
                      </div>
                    ) : (
                      <div className="text-red-400 text-sm">
                        ❌ {desiredFkey}.fkey.id is already taken
                        {claimStatus.claimedBy && (
                          <div className="mt-1 text-xs text-gray-400">
                            Claimed by: {claimStatus.claimedBy.slice(0, 8)}...{claimStatus.claimedBy.slice(-6)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Validation Rules */}
                <div className="mt-4 text-sm text-gray-400">
                  <div className="font-semibold mb-2">Rules:</div>
                  <ul className="space-y-1 text-xs">
                    <li>• 3-20 characters long</li>
                    <li>• Letters and numbers only</li>
                    <li>• Case insensitive (converted to lowercase)</li>
                    <li>• One claim per wallet address</li>
                    <li>• Cannot be changed once claimed</li>
                  </ul>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-4">
                <Button
                  onClick={checkAvailability}
                  disabled={!desiredFkey.trim() || loading || claiming}
                  className="w-full bg-blue-600 hover:bg-blue-700 py-3"
                >
                  {loading ? 'Checking...' : 'Check Availability'}
                </Button>

                {claimStatus?.isAvailable && isConnected && (
                  <Button
                    onClick={claimFkey}
                    disabled={claiming}
                    className="w-full bg-green-600 hover:bg-green-700 py-3"
                  >
                    {claiming ? 'Claiming...' : `Claim ${desiredFkey}.fkey.id`}
                  </Button>
                )}

                {!isConnected && (
                  <div className="text-center text-yellow-400 bg-yellow-900/20 border border-yellow-600/30 rounded-lg p-4">
                    <p className="text-sm">Connect your wallet to claim a .fkey.id</p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Info Section */}
          <div className="mt-8 bg-gray-700/50 rounded-lg p-6">
            <h3 className="text-white font-semibold mb-3">What is .fkey.id?</h3>
            <div className="text-gray-400 text-sm space-y-2">
              <p>• A unique identifier linked to your Ethereum address</p>
              <p>• Makes your X402 profile more discoverable and memorable</p>
              <p>• Appears on your profile and in social sharing</p>
              <p>• Helps build your reputation in the X402 ecosystem</p>
              <p>• Free to claim, one per wallet forever</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 