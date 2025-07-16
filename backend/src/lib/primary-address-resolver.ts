/**
 * Primary Address Resolver
 * 
 * This utility resolves the user's primary address from different sources
 * instead of relying on the unreliable zkProof.claimData.owner
 */

import { agentDb } from './agent-database.js';

export interface PrimaryAddressResult {
  primaryAddress: string;
  source: 'xmtp_inbox' | 'farcaster_custody' | 'farcaster_verified' | 'connected_wallet';
  metadata?: any;
}

/**
 * Resolve primary address from XMTP inbox ID
 */
export async function resolvePrimaryFromXMTP(
  inboxId: string, 
  xmtpClient: any
): Promise<PrimaryAddressResult | null> {
  try {
    if (!xmtpClient) {
      console.warn('⚠️ XMTP client not available for address resolution');
      return null;
    }

    const inboxState = await xmtpClient.preferences.inboxStateFromInboxIds([inboxId]);
    const primaryAddress = inboxState[0]?.identifiers[0]?.identifier;
    
    if (!primaryAddress) {
      console.error(`❌ No primary address found for XMTP inbox: ${inboxId}`);
      return null;
    }

    console.log(`✅ Resolved primary address from XMTP: ${primaryAddress}`);
    
    return {
      primaryAddress: primaryAddress.toLowerCase(),
      source: 'xmtp_inbox',
      metadata: {
        inboxId,
        resolvedAt: Date.now()
      }
    };
  } catch (error) {
    console.error('❌ Error resolving primary address from XMTP:', error);
    return null;
  }
}

/**
 * Resolve primary address from Farcaster cast data
 */
export function resolvePrimaryFromFarcaster(castAuthor: any): PrimaryAddressResult | null {
  try {
    // Try custody address first (most reliable)
    if (castAuthor.custody_address) {
      console.log(`✅ Using Farcaster custody address: ${castAuthor.custody_address}`);
      return {
        primaryAddress: castAuthor.custody_address.toLowerCase(),
        source: 'farcaster_custody',
        metadata: {
          fid: castAuthor.fid,
          username: castAuthor.username,
          resolvedAt: Date.now()
        }
      };
    }

    // Fallback to first verified address
    if (castAuthor.verified_addresses?.eth_addresses?.length > 0) {
      const verifiedAddress = castAuthor.verified_addresses.eth_addresses[0];
      console.log(`✅ Using Farcaster verified address: ${verifiedAddress}`);
      return {
        primaryAddress: verifiedAddress.toLowerCase(),
        source: 'farcaster_verified',
        metadata: {
          fid: castAuthor.fid,
          username: castAuthor.username,
          allVerifiedAddresses: castAuthor.verified_addresses.eth_addresses,
          resolvedAt: Date.now()
        }
      };
    }

    console.error(`❌ No primary address found for Farcaster user: ${castAuthor.username} (FID: ${castAuthor.fid})`);
    return null;
  } catch (error) {
    console.error('❌ Error resolving primary address from Farcaster:', error);
    return null;
  }
}

/**
 * Resolve primary address from connected wallet
 */
export function resolvePrimaryFromWallet(walletAddress: string): PrimaryAddressResult {
  console.log(`✅ Using connected wallet address: ${walletAddress}`);
  return {
    primaryAddress: walletAddress.toLowerCase(),
    source: 'connected_wallet',
    metadata: {
      resolvedAt: Date.now()
    }
  };
}

/**
 * Create stealth data with primary address as key
 */
export async function createStealthDataWithPrimaryAddress(
  primaryAddressResult: PrimaryAddressResult,
  fkeyId: string,
  stealthAddress: string,
  zkProof: any,
  requestedBy: string,
  additionalMetadata?: any
): Promise<any> {
  const stealthData = {
    userId: primaryAddressResult.primaryAddress, // ✅ Use primary address as key
    fkeyId,
    stealthAddress,
    zkProof,
    lastUpdated: Date.now(),
    requestedBy,
    setupStatus: 'fkey_set' as const,
    network: 'mainnet',
    metadata: {
      primaryAddressSource: primaryAddressResult.source,
      primaryAddressMetadata: primaryAddressResult.metadata,
      ...additionalMetadata
    }
  };

  await agentDb.storeUserStealthData(stealthData);
  
  console.log(`✅ Stored stealth data with primary address: ${primaryAddressResult.primaryAddress} (source: ${primaryAddressResult.source})`);
  return stealthData;
}

/**
 * Find stealth data by primary address
 */
export async function findStealthDataByPrimaryAddress(
  primaryAddress: string
): Promise<any | null> {
  try {
    const stealthData = await agentDb.getStealthDataByUser(primaryAddress.toLowerCase());
    
    if (stealthData) {
      console.log(`✅ Found stealth data for primary address: ${primaryAddress}`);
      return stealthData;
    }
    
    console.log(`❌ No stealth data found for primary address: ${primaryAddress}`);
    return null;
  } catch (error) {
    console.error('❌ Error finding stealth data by primary address:', error);
    return null;
  }
}

/**
 * Migration helper: Find stealth data by any method
 */
export async function findStealthDataByAnyMethod(
  primaryAddress?: string,
  fkeyId?: string,
  inboxId?: string
): Promise<any | null> {
  // Try primary address first
  if (primaryAddress) {
    const data = await findStealthDataByPrimaryAddress(primaryAddress);
    if (data) return data;
  }
  
  // Try fkey.id lookup
  if (fkeyId) {
    const data = await agentDb.getStealthDataByFkey(fkeyId);
    if (data) return data;
  }
  
  // Try inbox ID (legacy)
  if (inboxId) {
    const data = await agentDb.getStealthDataByUser(inboxId);
    if (data) return data;
  }
  
  return null;
}

/**
 * Get fresh stealth address for primary address
 */
export async function getFreshStealthAddressForPrimaryAddress(
  primaryAddress: string
): Promise<{
  stealthAddress: string;
  fkeyId: string;
  zkProof: any;
} | null> {
  try {
    // First find existing stealth data
    const existingData = await findStealthDataByPrimaryAddress(primaryAddress);
    
    if (!existingData || !existingData.fkeyId) {
      console.log(`❌ No fkey.id found for primary address: ${primaryAddress}`);
      return null;
    }
    
    // Do fresh lookup
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/fkey/lookup/${existingData.fkeyId}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.isRegistered || !data.address) {
      throw new Error(`fkey.id ${existingData.fkeyId} not found or not registered`);
    }
    
    console.log(`✅ Fresh stealth address for ${primaryAddress}: ${data.address}`);
    
    return {
      stealthAddress: data.address,
      fkeyId: existingData.fkeyId,
      zkProof: data.proof
    };
  } catch (error) {
    console.error('❌ Error getting fresh stealth address:', error);
    return null;
  }
}

/**
 * Development utility to log primary address resolution
 */
export function logPrimaryAddressResolution(
  result: PrimaryAddressResult, 
  context: string
) {
  if (process.env.NODE_ENV === 'development') {
    console.log(`🔍 ${context} - Primary address resolution:`);
    console.log(`  Primary: ${result.primaryAddress}`);
    console.log(`  Source: ${result.source}`);
    console.log(`  Metadata:`, result.metadata);
  }
} 