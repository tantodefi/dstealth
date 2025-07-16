import express from 'express';
import crypto from 'crypto';
import { agentDb } from '../lib/agent-database.js';
import { env } from '../config/env.js';
import { resolvePrimaryFromFarcaster } from '../lib/primary-address-resolver.js';

const router = express.Router();

// Verify Neynar webhook signature
function verifyNeynarWebhookSignature(payload: string, signature: string, secret: string): boolean {
  try {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload, 'utf8')
      .digest('hex');
    
    const providedSignature = signature.startsWith('sha256=') 
      ? signature.slice(7) 
      : signature;
    
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(providedSignature, 'hex')
    );
  } catch (error) {
    console.error('❌ Webhook signature verification error:', error);
    return false;
  }
}



interface FarcasterCastWebhook {
  data: {
    object: 'cast';
    hash: string;
    thread_hash: string;
    parent_hash?: string;
    parent_url?: string;
    root_parent_url?: string;
    parent_author?: {
      fid: number;
      username: string;
      display_name: string;
      pfp_url: string;
    };
    author: {
      object: 'user';
      fid: number;
      username: string;
      display_name: string;
      pfp_url: string;
      custody_address: string;
      verified_addresses: {
        eth_addresses: string[];
        sol_addresses: string[];
      };
      profile: {
        bio: {
          text: string;
        };
      };
      follower_count: number;
      following_count: number;
      power_badge: boolean;
    };
    text: string;
    timestamp: string;
    embeds: any[];
    reactions: {
      likes_count: number;
      recasts_count: number;
      likes: any[];
      recasts: any[];
    };
    replies: {
      count: number;
    };
    mentioned_profiles: any[];
  };
  created_at: number;
  type: 'cast.created';
}

/**
 * 🔧 NEW: Farcaster Cast Webhook - Handle @dstealth mentions for fkey.id setting
 * 
 * This endpoint allows users to set their fkey.id by casting:
 * "@dstealth tantodefi.fkey.id" on Farcaster
 */
router.post('/farcaster/cast', async (req, res) => {
  try {
    console.log('📬 Farcaster cast webhook received');
    
    // Verify webhook signature if needed
    if (env.NEYNAR_WEBHOOK_SECRET) {
      const signature = req.headers['x-neynar-signature'] as string;
      if (!signature) {
        console.log('❌ Missing webhook signature');
        return res.status(401).json({ error: 'Missing webhook signature' });
      }
      
      const payload = JSON.stringify(req.body);
      const isValid = verifyNeynarWebhookSignature(payload, signature, env.NEYNAR_WEBHOOK_SECRET);
      
      if (!isValid) {
        console.log('❌ Invalid webhook signature');
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }
      
      console.log('✅ Webhook signature verified');
    } else {
      console.log('⚠️ Webhook signature verification skipped (no secret configured)');
    }
    
    const webhookData = req.body as FarcasterCastWebhook;
    
    if (!webhookData || !webhookData.data) {
      console.log('❌ Invalid webhook data');
      return res.status(400).json({ error: 'Invalid webhook data' });
    }

    const cast = webhookData.data;
    
    // Check if this is a cast.created event
    if (webhookData.type !== 'cast.created') {
      console.log(`🔄 Ignoring webhook type: ${webhookData.type}`);
      return res.status(200).json({ message: 'Event type not handled' });
    }

    console.log(`📝 Processing cast from @${cast.author.username} (FID: ${cast.author.fid})`);
    console.log(`📝 Cast text: "${cast.text}"`);

    // Check if the cast mentions @dstealth
    const mentionsDstealth = cast.text.toLowerCase().includes('@dstealth');
    
    if (!mentionsDstealth) {
      console.log('🔄 Cast does not mention @dstealth - ignoring');
      return res.status(200).json({ message: 'Cast does not mention @dstealth' });
    }

    // 🔧 NEW: Handle fkey.id lookup requests on Farcaster
    const fkeyLookupMatch = cast.text.match(/@dstealth\s+@?([a-zA-Z0-9_.-]+)/i);
    if (fkeyLookupMatch) {
      const searchQuery = fkeyLookupMatch[1];
      console.log(`🔍 Farcaster fkey.id lookup request: ${searchQuery}`);
      
      // Search for the user's fkey.id
      const fkeySearchResult = await searchUserForFarcasterResponse(searchQuery);
      
      if (fkeySearchResult.found) {
        // Reply with fkey.id URL only
        const replyText = `${fkeySearchResult.fkeyId}.fkey.id`;
        console.log(`✅ Replying with fkey.id: ${replyText}`);
        
        // TODO: Actually send reply to cast using Neynar API
        return res.status(200).json({ 
          message: 'fkey.id found',
          reply: replyText,
          fkeyId: fkeySearchResult.fkeyId
        });
      } else {
        // Reply with setup instructions
        const replyText = `Sorry, ${searchQuery} hasn't set their fkey.id yet. They can do so by replying to this cast or if they don't have an fkey.id, they can sign up here: https://app.fluidkey.com/?ref=62YNSG`;
        console.log(`❌ Replying with setup instructions: ${replyText}`);
        
        // TODO: Actually send reply to cast using Neynar API
        return res.status(200).json({ 
          message: 'fkey.id not found',
          reply: replyText,
          searchQuery: searchQuery
        });
      }
    }

    // Extract fkey.id from the cast text for setup
    const fkeyPattern = /([a-zA-Z0-9_-]+(?:\.fkey\.id)?)/g;
    const matches = cast.text.match(fkeyPattern);
    
    let fkeyId = null;
    
    if (matches) {
      for (const match of matches) {
        // Skip @dstealth itself
        if (match.toLowerCase().includes('dstealth')) continue;
        
        // Check if it looks like a fkey.id
        const cleanMatch = match.replace('.fkey.id', '').toLowerCase().trim();
        if (cleanMatch.length >= 2 && cleanMatch.length <= 30) {
          fkeyId = cleanMatch;
          break;
        }
      }
    }

    if (!fkeyId) {
      console.log('❌ No valid fkey.id found in cast');
      // TODO: Reply to cast with instructions
      return res.status(200).json({ message: 'No valid fkey.id found' });
    }

    console.log(`🔍 Found fkey.id: ${fkeyId} from @${cast.author.username}`);

    // ✅ FIXED: Use primary address approach - get user's Farcaster primary address
    const primaryAddressResult = resolvePrimaryFromFarcaster(cast.author);
    
    if (!primaryAddressResult) {
      console.log(`❌ No primary address found for Farcaster user: ${cast.author.username} (FID: ${cast.author.fid})`);
      return res.status(200).json({ 
        message: 'No primary address found for Farcaster user - need custody or verified address',
        error: 'No primary address available'
      });
    }

    console.log(`🔑 Using Farcaster primary address: ${primaryAddressResult.primaryAddress} for fkey.id: ${fkeyId}`);

    // Verify the fkey.id exists and get ZK proof
    const fkeyLookupResult = await callFkeyLookupAPI(fkeyId, primaryAddressResult.primaryAddress, 'farcaster-cast');
    
    if (fkeyLookupResult.error) {
      console.log(`❌ fkey.id verification failed: ${fkeyLookupResult.error}`);
      // TODO: Reply to cast with error message
      return res.status(200).json({ 
        message: 'fkey.id verification failed',
        error: fkeyLookupResult.error 
      });
    }

    // Find the user in our database by their Farcaster wallet addresses
    let userInboxId: string | null = null;
    
    // Check custody address first
    const custodyAddress = cast.author.custody_address;
    if (custodyAddress) {
      userInboxId = await findUserByWalletAddress(custodyAddress);
    }
    
    // Check verified addresses if not found
    if (!userInboxId && cast.author.verified_addresses?.eth_addresses) {
      for (const address of cast.author.verified_addresses.eth_addresses) {
        userInboxId = await findUserByWalletAddress(address);
        if (userInboxId) break;
      }
    }

    if (!userInboxId) {
      console.log(`❌ No XMTP user found for @${cast.author.username} with addresses`);
      // TODO: Reply to cast with instructions to connect wallet to XMTP
      return res.status(200).json({ 
        message: 'User not found in XMTP - need to connect wallet to dStealth agent first' 
      });
    }

    // Store the fkey.id for the user using primary address
    const stealthData = {
      userId: primaryAddressResult.primaryAddress, // ✅ FIXED: Use Farcaster primary address
      fkeyId: fkeyId,
      stealthAddress: fkeyLookupResult.address || "",
      zkProof: fkeyLookupResult.proof,
      lastUpdated: Date.now(),
      requestedBy: 'farcaster-cast',
      setupStatus: 'fkey_set' as const,
      metadata: {
        source: 'farcaster-cast',
        primaryAddressSource: primaryAddressResult.source,
        primaryAddressMetadata: primaryAddressResult.metadata,
        fid: cast.author.fid,
        username: cast.author.username,
        castHash: cast.hash,
        timestamp: cast.timestamp,
        xmtpInboxId: userInboxId // Keep XMTP inbox ID for reference
      }
    };

    await agentDb.storeUserStealthData(stealthData);

    console.log(`✅ Successfully set fkey.id ${fkeyId} for user ${userInboxId} via Farcaster cast`);

    // 🔧 NEW: Reply to the cast with confirmation
    try {
      const replyResult = await replyToCast(
        cast.hash,
        `✅ I have updated your fkey to '${fkeyId}.fkey.id' 

🥷 Anonymous payments are now enabled! 

Try me in DMs for more commands: /help`
      );

      if (replyResult.success) {
        console.log(`✅ Successfully replied to cast: ${replyResult.castHash}`);
      } else {
        console.warn(`⚠️ Failed to reply to cast: ${replyResult.error}`);
      }
    } catch (replyError) {
      console.error('❌ Error replying to cast:', replyError);
      // Don't fail the webhook if reply fails
    }

    return res.status(200).json({ 
      message: 'fkey.id set successfully via Farcaster cast',
      fkeyId: fkeyId,
      username: cast.author.username,
      fid: cast.author.fid
    });

  } catch (error) {
    console.error('❌ Error processing Farcaster cast webhook:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Search for a user's fkey.id in the shared database for Farcaster cast responses
 */
async function searchUserForFarcasterResponse(searchQuery: string): Promise<{
  found: boolean;
  fkeyId?: string;
  searchedAs?: string;
}> {
  try {
    console.log(`🔍 Searching for user's fkey.id: ${searchQuery}`);
    
    // Clean the search query (remove @ prefix, handle different formats)
    const cleanQuery = searchQuery.replace(/^@/, '').toLowerCase().trim();
    
    // Search in shared database for fkey.id
    const allUsers = await agentDb.getAllStealthData();
    
    // First try: exact fkey.id match
    for (const userData of allUsers) {
      if (userData.fkeyId && userData.fkeyId.toLowerCase() === cleanQuery) {
        console.log(`✅ Found fkey.id by exact match: ${userData.fkeyId}`);
        return {
          found: true,
          fkeyId: userData.fkeyId,
          searchedAs: 'exact_fkey_match'
        };
      }
    }
    
    // Second try: partial match (in case of typos or variations)
    for (const userData of allUsers) {
      if (userData.fkeyId && userData.fkeyId.toLowerCase().includes(cleanQuery)) {
        console.log(`✅ Found fkey.id by partial match: ${userData.fkeyId}`);
        return {
          found: true,
          fkeyId: userData.fkeyId,
          searchedAs: 'partial_fkey_match'
        };
      }
    }
    
    console.log(`❌ No fkey.id found for: ${searchQuery}`);
    return {
      found: false,
      searchedAs: 'not_found'
    };
    
  } catch (error) {
    console.error('Error searching for user fkey.id:', error);
    return {
      found: false,
      searchedAs: 'error'
    };
  }
}

/**
 * Helper function to call fkey.id lookup API
 */
async function callFkeyLookupAPI(fkeyId: string, userAddress: string, source: string): Promise<{ address?: string; proof?: unknown; error?: string }> {
  try {
    const baseUrl = env.FRONTEND_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/fkey/lookup/${fkeyId}?userAddress=${userAddress}&source=${source}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json() as { isRegistered?: boolean; address?: string; proof?: unknown; error?: string };
    
    if (data.isRegistered && data.address) {
      return {
        address: data.address,
        proof: data.proof || null
      };
    } else {
      return {
        error: data.error || 'fkey.id not found or not registered'
      };
    }
    
  } catch (error) {
    console.error('❌ Error calling fkey.id lookup API:', error);
    return {
      error: error instanceof Error ? error.message : 'Failed to lookup fkey.id'
    };
  }
}

/**
 * Helper function to find user by wallet address
 * This is a simplified version - in production you'd want proper indexing
 */
async function findUserByWalletAddress(walletAddress: string): Promise<string | null> {
  try {
    // Get all stealth data and check addresses
    const allUsers = await agentDb.getAllStealthData();
    
    for (const userData of allUsers) {
      // Check if stealth address matches
      if (userData.stealthAddress && userData.stealthAddress.toLowerCase() === walletAddress.toLowerCase()) {
        return userData.userId;
      }
    }
    
    // TODO: Also check original wallet addresses via XMTP client lookup
    // This would require access to the XMTP client instance
    
    return null;
  } catch (error) {
    console.error('Error finding user by wallet address:', error);
    return null;
  }
}

/**
 * Helper function to reply to a cast on Farcaster
 */
async function replyToCast(parentCastHash: string, message: string): Promise<{success: boolean, castHash?: string, error?: string}> {
  try {
    if (!env.NEYNAR_API_KEY) {
      console.warn('⚠️ NEYNAR_API_KEY not configured for cast replies');
      return {success: false, error: 'Neynar API key not configured'};
    }

    console.log(`📝 Posting cast reply to ${parentCastHash}: ${message}`);

    const requestPayload = {
      text: message,
      parent: parentCastHash,
      signer_uuid: env.NEYNAR_SIGNER_UUID || 'default-signer' // This would need to be configured
    };

    const response = await fetch('https://api.neynar.com/v2/farcaster/cast', {
      method: 'POST',
      headers: {
        'api_key': env.NEYNAR_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestPayload)
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.log(`❌ Neynar cast reply error: ${response.status}`, errorData);
      return {success: false, error: `API error: ${response.status}`};
    }

    const data = await response.json() as {cast: {hash: string}};
    console.log(`✅ Cast reply posted successfully! Hash: ${data.cast.hash}`);
    
    return {success: true, castHash: data.cast.hash};

  } catch (error) {
    console.error('Error posting cast reply:', error);
    return {success: false, error: error instanceof Error ? error.message : 'Unknown error'};
  }
}

/**
 * Test endpoint to verify webhook is working
 */
router.get('/farcaster/test', (req, res) => {
  res.json({ 
    message: 'Farcaster webhook endpoint is active',
    timestamp: new Date().toISOString(),
    features: [
      'Cast mention detection (@dstealth)',
      'fkey.id extraction and verification',
      'User lookup by wallet address',
      'Automatic fkey.id setting'
    ]
  });
});

export default router; 