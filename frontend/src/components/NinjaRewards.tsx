"use client";

import { useState, useEffect } from "react";
import { useAccount, useReadContract } from 'wagmi';
import { Button } from "@/components/Button";
import { CheckIcon } from "@/components/icons/CheckIcon";
import { ExternalLink, Gift, Trophy, Zap, Star, Wallet } from 'lucide-react';
import { formatUnits } from 'viem';
import { 
  MILESTONES, 
  checkMilestones, 
  createStevenReward,
  type Milestone,
  type StevenReward
} from '@/lib/farcaster-miniapp';
import NotificationModal from './NotificationModal';

// 🥷 Token Contract (Base Mainnet)
const STEVEN_TOKEN_CONTRACT = '0x2a810158dD24DC62477540c81194B4F817EB3944';

// FluidKey Score (FKS) Token Contract (Base Mainnet)
const FKS_TOKEN_CONTRACT = '0x894c663757f6953544548EFA1aebc0846AC08bEa';

// ERC-20 ABI (just the functions we need)
const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    name: 'symbol',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    name: 'name',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
] as const;

export default function StevenRewards() {
  const { address, isConnected } = useAccount();
  const [completedMilestones, setCompletedMilestones] = useState<string[]>([]);
  const [unclaimedRewards, setUnclaimedRewards] = useState<StevenReward[]>([]);
  const [activityStats, setActivityStats] = useState<any>({});
  const [claimingRewardId, setClaimingRewardId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  
  // Notification modal state
  const [notification, setNotification] = useState<{
    isOpen: boolean;
    type: 'success' | 'error' | 'loading';
    title: string;
    message: string;
    transactionHash?: string;
    amount?: number;
  }>({
    isOpen: false,
    type: 'success',
    title: '',
    message: ''
  });
  
  // Token balance and info
  const { data: tokenBalance, refetch: refetchBalance } = useReadContract({
    address: STEVEN_TOKEN_CONTRACT,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address }
  });

  const { data: tokenDecimals } = useReadContract({
    address: STEVEN_TOKEN_CONTRACT,
    abi: ERC20_ABI,
    functionName: 'decimals',
  });

  const { data: tokenSymbol } = useReadContract({
    address: STEVEN_TOKEN_CONTRACT,
    abi: ERC20_ABI,
    functionName: 'symbol',
  });

  const { data: tokenName } = useReadContract({
    address: STEVEN_TOKEN_CONTRACT,
    abi: ERC20_ABI,
    functionName: 'name',
  });

  // FluidKey Score (FKS) Token balance check
  const { data: fksBalance } = useReadContract({
    address: FKS_TOKEN_CONTRACT,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address }
  });

  const { data: fksDecimals } = useReadContract({
    address: FKS_TOKEN_CONTRACT,
    abi: ERC20_ABI,
    functionName: 'decimals',
  });

  // Format token balance for display
  const formattedBalance = tokenBalance && tokenDecimals 
    ? formatUnits(tokenBalance, tokenDecimals)
    : undefined;

  // Check if user has FluidKey Score tokens
  const hasFKS = fksBalance && fksDecimals && Number(formatUnits(fksBalance, fksDecimals)) > 0;

  // Get formatted FKS balance
  const formattedFKSBalance = fksBalance && fksDecimals 
    ? formatUnits(fksBalance, fksDecimals)
    : undefined;
  
  // Storage keys for user-specific data
  const getCompletedMilestonesKey = (userAddress: string) => `steven_completed_milestones_${userAddress.toLowerCase()}`;
  const getUnclaimedRewardsKey = (userAddress: string) => `steven_unclaimed_rewards_${userAddress.toLowerCase()}`;
  const getActivityStatsKey = (userAddress: string) => `proxy402_activity_stats_${userAddress.toLowerCase()}`;
  const getFKSRewardKey = (userAddress: string) => `steven_fks_reward_claimed_${userAddress.toLowerCase()}`;

  // Load user data on wallet connection
  useEffect(() => {
    if (!isConnected || !address) {
      setCompletedMilestones([]);
      setUnclaimedRewards([]);
      setActivityStats({});
      return;
    }

    // Load completed milestones
    const completedKey = getCompletedMilestonesKey(address);
    const savedCompleted = localStorage.getItem(completedKey);
    if (savedCompleted) {
      try {
        setCompletedMilestones(JSON.parse(savedCompleted));
      } catch (error) {
        console.error('Failed to parse completed milestones:', error);
      }
    }

    // Load unclaimed rewards
    const rewardsKey = getUnclaimedRewardsKey(address);
    const savedRewards = localStorage.getItem(rewardsKey);
    if (savedRewards) {
      try {
        setUnclaimedRewards(JSON.parse(savedRewards));
      } catch (error) {
        console.error('Failed to parse unclaimed rewards:', error);
      }
    }

    // Load activity stats
    const statsKey = getActivityStatsKey(address);
    const savedStats = localStorage.getItem(statsKey);
    if (savedStats) {
      try {
        const stats = JSON.parse(savedStats);
        setActivityStats(stats);
        
        // Check for new milestones
        checkForNewMilestones(stats);
      } catch (error) {
        console.error('Failed to parse activity stats:', error);
      }
    }
  }, [address, isConnected]);

  // Check for new milestone achievements
  const checkForNewMilestones = (stats: any) => {
    if (!address) return;

    const newMilestones = checkMilestones(stats, completedMilestones);
    
    if (newMilestones.length > 0) {
      console.log('New milestones achieved:', newMilestones.map(m => m.name));
      
      // Create 🥷 rewards for new milestones
      const newRewards = newMilestones.map(milestone => createStevenReward(milestone, address));
      
      // Update state
      const updatedCompleted = [...completedMilestones, ...newMilestones.map(m => m.id)];
      const updatedRewards = [...unclaimedRewards, ...newRewards];
      
      setCompletedMilestones(updatedCompleted);
      setUnclaimedRewards(updatedRewards);
      
      // Save to localStorage
      localStorage.setItem(getCompletedMilestonesKey(address), JSON.stringify(updatedCompleted));
      localStorage.setItem(getUnclaimedRewardsKey(address), JSON.stringify(updatedRewards));
      
      // Show success message
      setSuccess(`🎉 ${newMilestones.length} new milestone${newMilestones.length > 1 ? 's' : ''} achieved!`);
      setTimeout(() => setSuccess(""), 5000);
    }
  };

  // Automated claim function with backend processing
  const claimStevenTokens = async (reward: StevenReward) => {
    if (!address || claimingRewardId) return;

    setClaimingRewardId(reward.id);
    setError("");

    // Show loading notification
    setNotification({
      isOpen: true,
      type: 'loading',
      title: 'Processing Your Claim',
      message: `Claiming ${reward.amount.toLocaleString()} 🥷 tokens for "${reward.reason}"...`
    });

    try {
      // Call backend API to process the claim automatically
      const response = await fetch('/api/claims/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userAddress: address,
          amount: reward.amount,
          milestoneId: reward.milestoneId,
          reason: reward.reason
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to process claim');
      }

      // Remove claimed reward from unclaimed list
      const updatedRewards = unclaimedRewards.filter(r => r.id !== reward.id);
      setUnclaimedRewards(updatedRewards);
      
      // Save to localStorage
      localStorage.setItem(getUnclaimedRewardsKey(address), JSON.stringify(updatedRewards));
      
      // Refetch token balance to show updated amount
      setTimeout(() => {
        refetchBalance();
      }, 3000);

      // Show success notification with transaction details
      setNotification({
        isOpen: true,
        type: 'success',
        title: '🎉 Claim Successful!',
        message: `Your ${reward.amount.toLocaleString()} 🥷 tokens have been sent to your wallet!`,
        transactionHash: result.transactionHash,
        amount: reward.amount
      });
      
    } catch (error) {
      console.error('Error claiming tokens:', error);
      
      // Show error notification
      setNotification({
        isOpen: true,
        type: 'error',
        title: 'Claim Failed',
        message: error instanceof Error ? error.message : 'An unexpected error occurred. Please try again.'
      });
    } finally {
      setClaimingRewardId(null);
    }
  };

  // Calculate progress for ongoing milestones
  const getProgress = (milestone: Milestone): number => {
    const currentValue = activityStats[`total${milestone.requirement.type.charAt(0).toUpperCase() + milestone.requirement.type.slice(1)}`] || 0;
    return Math.min((currentValue / milestone.requirement.value) * 100, 100);
  };

  const totalUnclaimedTokens = unclaimedRewards.reduce((sum, reward) => sum + reward.amount, 0);
  const completedCount = completedMilestones.length;
  const totalMilestones = MILESTONES.length;

  // Check for FluidKey Score bonus on wallet connection
  useEffect(() => {
    if (!address || !isConnected || !hasFKS) return;

    const fksRewardKey = getFKSRewardKey(address);
    const alreadyClaimed = localStorage.getItem(fksRewardKey);
    
    // If user has FKS tokens and hasn't claimed the bonus yet
    if (!alreadyClaimed) {
      console.log('🎯 FluidKey Score holder detected! Awarding 42,000 🥷 bonus...');
      
      // Create special FKS reward
      const fksReward: StevenReward = {
        id: `fks_bonus_${address}_${Date.now()}`,
        amount: 42000,
        reason: 'FluidKey Score Elite Holder Bonus',
        milestoneId: 'fks_holder',
        claimed: false,
        createdAt: new Date().toISOString()
      };

      // Add to unclaimed rewards
      setUnclaimedRewards(prev => [...prev, fksReward]);
      
      // Update localStorage
      const rewardsKey = getUnclaimedRewardsKey(address);
      const existingRewards = localStorage.getItem(rewardsKey);
      const updatedRewards = existingRewards ? [...JSON.parse(existingRewards), fksReward] : [fksReward];
      localStorage.setItem(rewardsKey, JSON.stringify(updatedRewards));
      
      // Mark as detected (not claimed yet, but bonus awarded)
      localStorage.setItem(fksRewardKey, 'detected');
      
      // Show notification
      setNotification({
        isOpen: true,
        type: 'success',
        title: '🎯 FluidKey Score Elite Detected!',
        message: 'You\'re a FluidKey Score holder! 42,000 🥷 bonus tokens are ready to claim!',
        amount: 42000
      });
    }
  }, [address, isConnected, hasFKS]);

  if (!isConnected || !address) {
    return (
      <div className="space-y-4">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-white mb-2">🥷 Rewards</h3>
          <div className="text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded p-3">
            <p className="text-sm">Connect your wallet to view your 🥷 achievements and claim rewards!</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Notification Modal */}
      <NotificationModal
        isOpen={notification.isOpen}
        onClose={() => setNotification(prev => ({ ...prev, isOpen: false }))}
        type={notification.type}
        title={notification.title}
        message={notification.message}
        transactionHash={notification.transactionHash}
        amount={notification.amount}
      />

      {/* Header */}
      <div className="bg-gradient-to-r from-yellow-900/20 to-orange-900/20 border border-yellow-600/30 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-gradient-to-br from-yellow-500 to-orange-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold">🥷</span>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Ninja Rewards</h2>
            <p className="text-yellow-300">Earn 🥷 tokens for privacy actions and milestones</p>
          </div>
        </div>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded p-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-500/10 border border-green-500/20 rounded p-3 text-green-400 text-sm">
          {success}
        </div>
      )}

      {/* Token Balance Display */}
      <div className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 border border-purple-600/30 rounded-lg p-4">
        <div className="flex items-center gap-3">
          <Wallet className="h-6 w-6 text-purple-400" />
          <div>
            <div className="text-white font-semibold">Your {tokenSymbol || '🥷'} Balance</div>
            <div className="text-2xl font-bold text-purple-300">
              {formattedBalance ? formattedBalance.toLocaleString() : 'Loading...'} {tokenSymbol || '🥷'}
            </div>
            <div className="text-xs text-gray-400 mt-1">
              {tokenName || 'Token Name'} • Base Mainnet
            </div>
          </div>
        </div>
        <div className="mt-3 flex gap-2 text-xs">
          <a 
            href={`https://basescan.org/token/${STEVEN_TOKEN_CONTRACT}?a=${address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2 py-1 bg-blue-900/30 text-blue-300 rounded hover:bg-blue-800/30 transition-colors flex items-center gap-1"
          >
            <ExternalLink className="h-3 w-3" />
            View on BaseScan
          </a>
        </div>
      </div>

      {/* FluidKey Score Status */}
      {hasFKS && (
        <div className="bg-gradient-to-r from-yellow-900/20 to-orange-900/20 border border-yellow-600/30 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="text-2xl">🎯</div>
            <div>
              <div className="text-white font-semibold">FluidKey Score Elite Detected!</div>
              <div className="text-yellow-300">
                42,000 🥷 Bonus Available
              </div>
              <div className="text-xs text-gray-400 mt-1">
                FKS Balance: {formattedFKSBalance ? formattedFKSBalance.toLocaleString() : 'Loading...'} FKS
              </div>
            </div>
          </div>
          <div className="mt-3 flex gap-2 text-xs">
            <a 
              href={`https://basescan.org/token/${FKS_TOKEN_CONTRACT}?a=${address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2 py-1 bg-yellow-900/30 text-yellow-300 rounded hover:bg-yellow-800/30 transition-colors flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" />
              View FKS on BaseScan
            </a>
          </div>
          <div className="mt-2 text-xs text-yellow-400">
            💫 This massive bonus is equivalent to 89% of all other milestones combined!
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-purple-900/20 border border-purple-600/30 rounded-lg p-4 text-center">
          <Trophy className="h-8 w-8 text-purple-400 mx-auto mb-2" />
          <div className="text-2xl font-bold text-white">{completedCount}</div>
          <div className="text-sm text-gray-400">Milestones Completed</div>
          <div className="text-xs text-purple-400 mt-1">{completedCount}/{totalMilestones}</div>
        </div>

        <div className="bg-green-900/20 border border-green-600/30 rounded-lg p-4 text-center">
          <Gift className="h-8 w-8 text-green-400 mx-auto mb-2" />
          <div className="text-2xl font-bold text-white">{totalUnclaimedTokens.toLocaleString()}</div>
          <div className="text-sm text-gray-400">🥷 Tokens Available</div>
          <div className="text-xs text-green-400 mt-1">{unclaimedRewards.length} unclaimed</div>
        </div>

        <div className="bg-blue-900/20 border border-blue-600/30 rounded-lg p-4 text-center">
          <Zap className="h-8 w-8 text-blue-400 mx-auto mb-2" />
          <div className="text-2xl font-bold text-white">${((activityStats.totalRevenue || 0) / 100).toFixed(2)}</div>
          <div className="text-sm text-gray-400">Total Revenue</div>
          <div className="text-xs text-blue-400 mt-1">{activityStats.totalLinks || 0} links created</div>
        </div>
      </div>

      {/* Unclaimed Rewards */}
      {unclaimedRewards.length > 0 && (
        <div className="bg-gradient-to-r from-green-900/20 to-emerald-900/20 border border-green-600/30 rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <Gift className="h-6 w-6 text-green-400" />
            <h4 className="text-xl font-bold text-white">Available Rewards</h4>
            <div className="text-sm text-gray-400 ml-auto">
              Instant automated claiming
            </div>
          </div>
          
          <div className="space-y-3">
            {unclaimedRewards.map((reward) => (
              <div key={reward.id} className="flex items-center justify-between bg-black/20 rounded-lg p-4">
                <div className="flex-1">
                  <div className="font-semibold text-white">{reward.reason}</div>
                  <div className="text-sm text-gray-400">
                    {reward.amount.toLocaleString()} 🥷 tokens
                  </div>
                  <div className="text-xs text-gray-500">
                    Earned: {new Date(reward.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <Button
                  onClick={() => claimStevenTokens(reward)}
                  disabled={claimingRewardId === reward.id}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 disabled:opacity-50"
                >
                  {claimingRewardId === reward.id ? (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Claiming...
                    </div>
                  ) : (
                    "Claim Now 🥷"
                  )}
                </Button>
              </div>
            ))}
          </div>
          
          <div className="mt-4 text-center text-sm text-gray-400">
            💫 Claims are processed instantly via automated backend distribution
          </div>
        </div>
      )}

      {/* Milestones Progress */}
      <div>
        <h4 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Star className="h-6 w-6 text-yellow-400" />
          Milestone Progress
        </h4>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {MILESTONES.map((milestone) => {
            const isCompleted = completedMilestones.includes(milestone.id);
            const progress = getProgress(milestone);
            const isHidden = milestone.name.includes('🥷');
            
            return (
              <div
                key={milestone.id}
                className={`rounded-lg p-4 border transition-all ${
                  isCompleted
                    ? 'bg-green-900/20 border-green-600/30'
                    : isHidden
                    ? 'bg-purple-900/20 border-purple-600/30'
                    : 'bg-gray-800/50 border-gray-600/30'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="font-semibold text-white text-sm">
                      {milestone.name}
                      {isCompleted && <CheckIcon className="inline h-4 w-4 text-green-400 ml-2" />}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {milestone.description}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-purple-400">
                      {milestone.reward.amount?.toLocaleString()} 🥷
                    </div>
                  </div>
                </div>
                
                {!isCompleted && !isHidden && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>Progress</span>
                      <span>{progress.toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}
                
                {isHidden && !isCompleted && (
                  <div className="mt-2 text-xs text-purple-400 italic">
                    🥷 Hidden achievement - discover the secret!
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 🥷 Token Info */}
      <div className="bg-gray-800/50 border border-gray-600/30 rounded-lg p-4">
        <h5 className="font-semibold text-white mb-2 flex items-center gap-2">
          🥷 About 🥷 Tokens
        </h5>
        <p className="text-sm text-gray-400 mb-3">
          🥷 tokens are rewards for your stealth content creation skills. Earn them by completing milestones 
          and achievements in the X402 ecosystem. Claims are processed automatically via our backend system.
        </p>
        <div className="flex gap-2 text-xs">
          <span className="px-2 py-1 bg-purple-900/30 text-purple-300 rounded">Base Mainnet</span>
          <span className="px-2 py-1 bg-gray-700 text-gray-300 rounded">ERC-20 Token</span>
          <span className="px-2 py-1 bg-blue-900/30 text-blue-300 rounded">Achievement Rewards</span>
          <span className="px-2 py-1 bg-green-900/30 text-green-300 rounded">Instant Claims</span>
        </div>
      </div>
    </div>
  );
} 