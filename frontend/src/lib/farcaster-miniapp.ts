import { env } from "@/lib/env";

/**
 * Enhanced Farcaster Mini App Configuration
 * Based on https://miniapps.farcaster.xyz/guides/publishing-your-app
 */
export async function getEnhancedFarcasterManifest() {
  return {
    accountAssociation: {
      header: env.NEXT_PUBLIC_FARCASTER_HEADER,
      payload: env.NEXT_PUBLIC_FARCASTER_PAYLOAD,
      signature: env.NEXT_PUBLIC_FARCASTER_SIGNATURE,
    },
    frame: {
      version: "1", // required, must be '1'
      name: "X402 Protocol", // Updated name for better discovery
      iconUrl: `${env.NEXT_PUBLIC_URL}/images/icon.png`,
      homeUrl: env.NEXT_PUBLIC_URL,
      splashImageUrl: `${env.NEXT_PUBLIC_URL}/images/splash.png`,
      splashBackgroundColor: "#667eea", // X402 brand color
      webhookUrl: `${env.NEXT_PUBLIC_URL}/api/webhook/farcaster`,
      subtitle: "Monetize Content with Crypto", // More descriptive
      description: "Create shareable X402:// URLs with USDC payments. Turn any content into a revenue stream with blockchain-powered paywalls and Farcaster Frames.", // Enhanced description
      primaryCategory: "finance", // Better category for payment-focused app
      tags: ["payments", "content", "usdc", "web3", "monetization"], // More relevant tags
      tagline: "Content Monetization Made Easy", // Clear value prop
      ogTitle: "X402 Protocol - Content Monetization",
      ogDescription: "Create payment-gated content with USDC on Base. Share beautiful Frames on Farcaster.",
      heroImageUrl: `${env.NEXT_PUBLIC_URL}/images/hero-x402.png`, // We should create this
      noindex: false,
    },
  };
}

/**
 * Milestone Configuration for Activity-Based Rewards
 */
export interface Milestone {
  id: string;
  name: string;
  description: string;
  requirement: {
    type: 'revenue' | 'links' | 'purchases' | 'shares' | 'streak';
    value: number;
  };
  reward: {
    type: '🥷_tokens' | 'feature_unlock' | 'badge';
    amount?: number;
    feature?: string;
    badge?: string;
  };
  notification: {
    title: string;
    body: string;
    targetUrl?: string;
  };
}

export const MILESTONES: Milestone[] = [
  // Revenue Milestones
  {
    id: 'first_dollar',
    name: 'First Dollar',
    description: 'Earn your first dollar with X402',
    requirement: { type: 'revenue', value: 100 }, // $1.00 in cents
    reward: { type: '🥷_tokens', amount: 1000 },
    notification: {
      title: '🎉 First Dollar Earned!',
      body: 'Congrats! You earned your first dollar with X402. Claim 1,000 🥷 tokens!',
      targetUrl: `${env.NEXT_PUBLIC_URL}?tab=rewards`
    }
  },
  {
    id: 'ten_dollars',
    name: 'Ten Bagger',
    description: 'Reach $10 in total revenue',
    requirement: { type: 'revenue', value: 1000 }, // $10.00 in cents
    reward: { type: '🥷_tokens', amount: 5000 },
    notification: {
      title: '💰 Ten Dollar Milestone!',
      body: 'You\'ve earned $10 with X402! Here\'s 5,000 🥷 tokens.',
      targetUrl: `${env.NEXT_PUBLIC_URL}?tab=rewards`
    }
  },
  {
    id: 'hundred_dollars',
    name: 'Content Creator',
    description: 'Reach $100 in total revenue',
    requirement: { type: 'revenue', value: 10000 }, // $100.00 in cents
    reward: { type: '🥷_tokens', amount: 25000 },
    notification: {
      title: '🚀 Content Creator Status!',
      body: 'Amazing! $100 earned through X402. Claim 25,000 🥷 tokens!',
      targetUrl: `${env.NEXT_PUBLIC_URL}?tab=rewards`
    }
  },
  
  // Link Creation Milestones
  {
    id: 'first_link',
    name: 'Link Pioneer',
    description: 'Create your first X402 link',
    requirement: { type: 'links', value: 1 },
    reward: { type: '🥷_tokens', amount: 500 },
    notification: {
      title: '🔗 First X402 Link Created!',
      body: 'Welcome to the X402 ecosystem! Claim 500 🥷 tokens.',
      targetUrl: `${env.NEXT_PUBLIC_URL}?tab=rewards`
    }
  },
  {
    id: 'ten_links',
    name: 'Link Master',
    description: 'Create 10 X402 links',
    requirement: { type: 'links', value: 10 },
    reward: { type: '🥷_tokens', amount: 2500 },
    notification: {
      title: '⚡ Link Master Achieved!',
      body: '10 X402 links created! You\'re building an empire. Claim 2,500 🥷 tokens.',
      targetUrl: `${env.NEXT_PUBLIC_URL}?tab=rewards`
    }
  },
  
  // Purchase/Access Milestones
  {
    id: 'first_purchase',
    name: 'First Sale',
    description: 'Get your first content purchase',
    requirement: { type: 'purchases', value: 1 },
    reward: { type: '🥷_tokens', amount: 1500 },
    notification: {
      title: '🎯 First Sale Complete!',
      body: 'Someone paid for your content! Claim 1,500 🥷 tokens.',
      targetUrl: `${env.NEXT_PUBLIC_URL}?tab=rewards`
    }
  },
  {
    id: 'ten_purchases',
    name: 'Popular Creator',
    description: 'Get 10 content purchases',
    requirement: { type: 'purchases', value: 10 },
    reward: { type: '🥷_tokens', amount: 7500 },
    notification: {
      title: '🔥 Popular Creator Status!',
      body: '10 people have paid for your content! Claim 7,500 🥷 tokens.',
      targetUrl: `${env.NEXT_PUBLIC_URL}?tab=rewards`
    }
  },
  
  // Social/Sharing Milestones
  {
    id: 'first_frame_share',
    name: 'Frame Sharer',
    description: 'Share your first Farcaster Frame',
    requirement: { type: 'shares', value: 1 },
    reward: { type: '🥷_tokens', amount: 750 },
    notification: {
      title: '📢 Frame Shared!',
      body: 'Your first Farcaster Frame is live! Claim 750 🥷 tokens.',
      targetUrl: `${env.NEXT_PUBLIC_URL}?tab=rewards`
    }
  },
  
  // Stealth/Hidden Milestones (for 🥷 theme)
  {
    id: 'midnight_creator',
    name: '🥷 Midnight 🥷',
    description: 'Create content between 12-1 AM',
    requirement: { type: 'streak', value: 1 },
    reward: { type: '🥷_tokens', amount: 2000 },
    notification: {
      title: '🥷 Midnight 🥷 Unlocked!',
      body: 'Creating content in the shadows... True 🥷 spirit! Claim 2,000 🥷 tokens.',
      targetUrl: `${env.NEXT_PUBLIC_URL}?tab=rewards`
    }
  },
  {
    id: 'palindrome_price',
    name: '🥷 Palindrome Master',
    description: 'Set a palindrome price (0.11, 1.21, etc.)',
    requirement: { type: 'streak', value: 1 },
    reward: { type: '🥷_tokens', amount: 1337 },
    notification: {
      title: '🥷 Palindrome Master!',
      body: 'Symmetric pricing detected! L33t 🥷 skills. Claim 1,337 🥷 tokens.',
      targetUrl: `${env.NEXT_PUBLIC_URL}?tab=rewards`
    }
  }
];

/**
 * Check if user has achieved any new milestones
 */
export function checkMilestones(
  activityStats: any,
  completedMilestones: string[] = []
): Milestone[] {
  const newMilestones: Milestone[] = [];
  
  for (const milestone of MILESTONES) {
    // Skip if already completed
    if (completedMilestones.includes(milestone.id)) continue;
    
    let achieved = false;
    
    switch (milestone.requirement.type) {
      case 'revenue':
        achieved = (activityStats.totalRevenue || 0) >= milestone.requirement.value;
        break;
      case 'links':
        achieved = (activityStats.totalLinks || 0) >= milestone.requirement.value;
        break;
      case 'purchases':
        achieved = (activityStats.totalPurchases || 0) >= milestone.requirement.value;
        break;
      case 'shares':
        achieved = (activityStats.totalShares || 0) >= milestone.requirement.value;
        break;
      case 'streak':
        // Special logic for stealth milestones
        achieved = checkStealthMilestone(milestone.id, activityStats);
        break;
    }
    
    if (achieved) {
      newMilestones.push(milestone);
    }
  }
  
  return newMilestones;
}

/**
 * Check stealth/hidden milestone conditions
 */
function checkStealthMilestone(milestoneId: string, activityStats: any): boolean {
  const now = new Date();
  
  switch (milestoneId) {
    case 'midnight_creator':
      return now.getHours() === 0; // 12-1 AM
    case 'palindrome_price':
      // Check if user has any links with palindrome prices
      return activityStats.hasPalindromePrice || false;
    default:
      return false;
  }
}

/**
 * 🥷 Token Reward System
 */
export interface StevenReward {
  id: string;
  amount: number;
  reason: string;
  milestoneId?: string;
  claimed: boolean;
  createdAt: string;
}

export function createStevenReward(
  milestone: Milestone,
  userAddress: string
): StevenReward {
  return {
    id: `${milestone.id}_${userAddress}_${Date.now()}`,
    amount: milestone.reward.amount || 0,
    reason: milestone.name,
    milestoneId: milestone.id,
    claimed: false,
    createdAt: new Date().toISOString()
  };
}

/**
 * Smart Notification Triggers
 * Only send meaningful notifications to avoid spam
 */
export const NOTIFICATION_TRIGGERS = {
  MILESTONE_ACHIEVED: 'milestone_achieved',
  FIRST_PAYMENT_RECEIVED: 'first_payment_received',
  WEEKLY_SUMMARY: 'weekly_summary',
  STEVEN_TOKENS_AVAILABLE: 'steven_tokens_available'
};

export function shouldSendNotification(
  trigger: string,
  userStats: any,
  lastNotificationTime?: string
): boolean {
  const now = Date.now();
  const lastNotification = lastNotificationTime ? new Date(lastNotificationTime).getTime() : 0;
  const hoursSinceLastNotification = (now - lastNotification) / (1000 * 60 * 60);
  
  switch (trigger) {
    case NOTIFICATION_TRIGGERS.MILESTONE_ACHIEVED:
      return true; // Always notify for milestones
    case NOTIFICATION_TRIGGERS.FIRST_PAYMENT_RECEIVED:
      return userStats.totalPurchases === 1; // Only for first payment
    case NOTIFICATION_TRIGGERS.WEEKLY_SUMMARY:
      return hoursSinceLastNotification >= 168; // Once per week max
    case NOTIFICATION_TRIGGERS.STEVEN_TOKENS_AVAILABLE:
      return hoursSinceLastNotification >= 24; // Once per day max
    default:
      return false;
  }
} 