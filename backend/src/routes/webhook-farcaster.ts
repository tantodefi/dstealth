import { Router } from "express";
import * as crypto from 'crypto';
import { agentDb } from '../lib/agent-database.js';
import { env } from '../config/env.js';
import { resolvePrimaryFromFarcaster } from '../lib/primary-address-resolver.js';

const router = Router();

// 🔧 NEW: Cast deduplication to prevent duplicate processing
const processedCasts = new Set<string>();
const MAX_PROCESSED_CASTS = 1000; // Keep track of last 1000 casts
const CAST_EXPIRY_TIME = 60 * 60 * 1000; // 1 hour

// 🔧 NEW: Rate limiting for cast replies
const userLastReply = new Map<string, number>();
const REPLY_COOLDOWN = 30 * 1000; // 30 seconds between replies per user

// 🔧 NEW: Clean up old processed casts periodically
function cleanupProcessedCasts() {
  if (processedCasts.size > MAX_PROCESSED_CASTS) {
    const castsArray = Array.from(processedCasts);
    const toRemove = castsArray.slice(0, castsArray.length - MAX_PROCESSED_CASTS);
    toRemove.forEach(cast => processedCasts.delete(cast));
    console.log(`🧹 Cleaned up ${toRemove.length} old processed casts`);
  }
}

// 🔧 NEW: Check if user is in cooldown period
function isUserInCooldown(userId: string): boolean {
  const lastReply = userLastReply.get(userId);
  if (!lastReply) return false;
  
  const timeSinceLastReply = Date.now() - lastReply;
  return timeSinceLastReply < REPLY_COOLDOWN;
}

// 🔧 NEW: Update user's last reply timestamp
function updateUserLastReply(userId: string) {
  userLastReply.set(userId, Date.now());
  
  // Clean up old entries (keep last 100 users)
  if (userLastReply.size > 100) {
    const entries = Array.from(userLastReply.entries());
    const sorted = entries.sort((a, b) => b[1] - a[1]);
    const toKeep = sorted.slice(0, 100);
    userLastReply.clear();
    toKeep.forEach(([userId, timestamp]) => userLastReply.set(userId, timestamp));
  }
}

// Verify Neynar webhook signature
function verifyNeynarWebhookSignature(payload: string, signature: string, secret: string): boolean {
  try {
    // Create HMAC with sha512 as per Neynar docs
    const expectedSignature = crypto
      .createHmac('sha512', secret)
      .update(payload, 'utf8')
      .digest('hex');
    
    // Neynar sends signature directly as hex string, no prefix
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(signature, 'hex')
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
      
      // Use raw request body if available, otherwise fall back to JSON.stringify
      const payload = (req as any).rawBody || JSON.stringify(req.body);
      console.log('🔍 Using payload for signature verification:', payload ? 'Raw body available' : 'Using JSON.stringify fallback');
      
      const isValid = verifyNeynarWebhookSignature(payload, signature, env.NEYNAR_WEBHOOK_SECRET);
      
      if (!isValid) {
        console.log('❌ Invalid webhook signature');
        console.log('🔍 Signature debug:', {
          receivedSignature: signature,
          payloadLength: payload.length,
          secretConfigured: !!env.NEYNAR_WEBHOOK_SECRET
        });
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

    // 🔧 NEW: Cast deduplication - prevent processing the same cast multiple times
    if (processedCasts.has(cast.hash)) {
      console.log(`🔄 DUPLICATE Cast detected - skipping: ${cast.hash}`);
      return res.status(200).json({ message: 'Cast already processed' });
    }

    // 🔧 NEW: Rate limiting - prevent spam from same user
    const userId = cast.author.fid.toString();
    if (isUserInCooldown(userId)) {
      console.log(`🔄 User ${cast.author.username} (FID: ${cast.author.fid}) is in cooldown period - skipping`);
      return res.status(200).json({ message: 'User in cooldown period' });
    }

    // Mark cast as processed and update user's last reply timestamp
    processedCasts.add(cast.hash);
    updateUserLastReply(userId);
    
    // Clean up old processed casts periodically
    cleanupProcessedCasts();

    console.log(`✅ Cast validation passed for @${cast.author.username} (FID: ${cast.author.fid})`);

    // 🔧 Check if this is a fkey.id SETTING request (MUST contain .fkey.id)
    const fkeySettingMatch = cast.text.match(/@dstealth\s+@?([a-zA-Z0-9_.-]+\.fkey\.id)/i);
    let fkeyId = null;
    
    if (fkeySettingMatch) {
      // Extract the fkey.id (remove .fkey.id suffix for storage)
      const fullFkeyId = fkeySettingMatch[1];
      fkeyId = fullFkeyId.replace('.fkey.id', '');
      console.log(`🔧 Detected fkey.id setting request: ${fullFkeyId} -> ${fkeyId}`);
    }

    if (!fkeyId) {
      console.log('💬 No valid fkey.id found - treating as general conversation');
      
      // Check if user already has fkey.id set
      const primaryAddressResult = resolvePrimaryFromFarcaster(cast.author);
      let userHasFkey = false;
      
      if (primaryAddressResult) {
        try {
          const existingData = await agentDb.getStealthDataByUser(primaryAddressResult.primaryAddress);
          userHasFkey = !!existingData?.fkeyId;
        } catch (error) {
          console.log('⚠️ Could not check existing fkey.id:', error);
        }
      }
      
      // Fetch thread context if this is part of a conversation
      let threadContext = '';
      try {
        threadContext = await fetchThreadContext(cast.hash, cast.thread_hash);
      } catch (error) {
        console.log('⚠️ Could not fetch thread context:', error);
      }
      
      // Generate contextual response
      let response = '';
      
      if (env.OPENAI_API_KEY) {
        try {
          // Use ChatGPT to generate response with dStealth agent identity and thread context
          const chatGPTResponse = await generateChatGPTResponse(cast.text, cast.author.username, userHasFkey, threadContext);
          response = chatGPTResponse;
        } catch (error) {
          console.error('❌ ChatGPT error:', error);
          response = getDefaultResponse(cast.author.username, userHasFkey);
        }
      } else {
        response = getDefaultResponse(cast.author.username, userHasFkey);
      }
      
      // Send response
      try {
        const replyResult = await replyToCast(cast.hash, response);
        
        if (replyResult.success) {
          console.log(`✅ Successfully replied to conversation: ${replyResult.castHash}`);
        } else {
          console.warn(`⚠️ Failed to reply to conversation: ${replyResult.error}`);
        }
      } catch (replyError) {
        console.error('❌ Error replying to conversation:', replyError);
      }
      
      return res.status(200).json({ 
        message: 'General conversation handled',
        hasOpenAI: !!env.OPENAI_API_KEY,
        userHasFkey: userHasFkey,
        hasThreadContext: !!threadContext
      });
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
      // Reply to cast with error message
      try {
        const replyResult = await replyToCast(
          cast.hash,
          `I couldn't verify your fkey.id. This might be because:
1. Your fkey.id is not registered.
2. Your fkey.id is not linked to your wallet address.
3. There's an issue with the ZK proof.

Please try again or check your fkey.id on https://app.fluidkey.com`
        );
        
        if (replyResult.success) {
          console.log(`✅ Successfully replied to verification failed cast: ${replyResult.castHash}`);
        } else {
          console.warn(`⚠️ Failed to reply to verification failed cast: ${replyResult.error}`);
        }
      } catch (replyError) {
        console.error('❌ Error replying to verification failed cast:', replyError);
      }
      return res.status(200).json({ 
        message: 'fkey.id verification failed',
        error: fkeyLookupResult.error 
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
        xmtpInboxId: null // No XMTP inbox ID for this case
      }
    };

    await agentDb.storeUserStealthData(stealthData);

    console.log(`✅ Successfully set fkey.id ${fkeyId} for user ${primaryAddressResult.primaryAddress} via Farcaster cast`);

    // 🔧 NEW: Reply to the cast with confirmation + dStealth miniapp URL
    try {
      const replyResult = await replyToCast(
        cast.hash,
        `✅ I have updated your fkey to '${fkeyId}.fkey.id' 

🥷 Anonymous payments are now enabled! 

🌐 Access the dStealth miniapp: https://dstealth.xyz

💬 DM me on XMTP @dstealth.base.eth for more features!`
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
      message: 'fkey.id set successfully via Farcaster cast (standalone onboarding)',
      fkeyId: fkeyId,
      username: cast.author.username,
      fid: cast.author.fid,
      primaryAddress: primaryAddressResult.primaryAddress
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
    // 🔧 CRITICAL: Check if NEYNAR_API_KEY is configured
    if (!env.NEYNAR_API_KEY) {
      console.error('❌ NEYNAR_API_KEY not configured for cast replies');
      return {success: false, error: 'Neynar API key not configured'};
    }

    // 🔧 CRITICAL: Check if NEYNAR_SIGNER_UUID is properly configured
    if (!env.NEYNAR_SIGNER_UUID || env.NEYNAR_SIGNER_UUID === 'default-signer') {
      console.error('❌ NEYNAR_SIGNER_UUID not properly configured for cast replies');
      console.error('🔍 Current signer UUID:', env.NEYNAR_SIGNER_UUID || 'undefined');
      console.error('💡 Please configure NEYNAR_SIGNER_UUID in environment variables');
      return {success: false, error: 'Neynar signer UUID not configured'};
    }

    // 🔧 DEBUG: Clean and validate the signer UUID
    const cleanSignerUUID = env.NEYNAR_SIGNER_UUID.trim();
    console.log(`🔍 DEBUG: Raw signer UUID: "${env.NEYNAR_SIGNER_UUID}"`);
    console.log(`🔍 DEBUG: Cleaned signer UUID: "${cleanSignerUUID}"`);
    console.log(`🔍 DEBUG: UUID length: ${cleanSignerUUID.length}`);
    console.log(`🔍 DEBUG: UUID format check: ${/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanSignerUUID)}`);

    console.log(`📝 Posting cast reply to ${parentCastHash}: ${message}`);
    
    // 🔧 DEBUG: Log the exact signer UUID being used
    console.log(`🔍 DEBUG: Using signer UUID: ${cleanSignerUUID}`);
    console.log(`🔍 DEBUG: Using API key: ${env.NEYNAR_API_KEY ? env.NEYNAR_API_KEY.substring(0, 10) + '...' : 'undefined'}`);

    const requestPayload = {
      text: message,
      parent: parentCastHash,
      signer_uuid: cleanSignerUUID
    };
    
    // 🔧 DEBUG: Log the exact payload being sent
    console.log(`🔍 DEBUG: Request payload:`, JSON.stringify(requestPayload, null, 2));

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
      console.error(`❌ Neynar cast reply error: ${response.status}`, errorData);
      
      // 🔧 DEBUG: Enhanced error logging
      console.error('🔍 DEBUG: Full error response:', JSON.stringify(errorData, null, 2));
      
      // 🔧 DEBUG: Log response headers safely
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });
      console.error('🔍 DEBUG: Response headers:', JSON.stringify(headers, null, 2));
      
      // 🔧 ENHANCED: Specific error handling for common issues
      if (response.status === 400 && errorData.message?.includes('signer')) {
        console.error('🔍 Signer UUID issue detected - please verify NEYNAR_SIGNER_UUID');
      }
      if (response.status === 400 && errorData.message?.includes('Pro subscription')) {
        console.error('🔍 Pro subscription issue - check if signer UUID is associated with pro account');
      }
      if (response.status === 429) {
        console.error('🔍 Rate limit exceeded - please wait before retrying');
      }
      
      return {success: false, error: `API error: ${response.status} - ${errorData.message || 'Unknown error'}`};
    }

    const data = await response.json() as {cast: {hash: string}};
    console.log(`✅ Cast reply posted successfully! Hash: ${data.cast.hash}`);
    
    return {success: true, castHash: data.cast.hash};

  } catch (error) {
    console.error('❌ Error posting cast reply:', error);
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

/**
 * 🔧 DEBUG: Environment variables test endpoint
 */
router.get('/farcaster/debug', (req, res) => {
  res.json({
    message: 'Environment variables debug info',
    timestamp: new Date().toISOString(),
    environment: {
      NEYNAR_API_KEY: env.NEYNAR_API_KEY ? `${env.NEYNAR_API_KEY.substring(0, 10)}...` : 'NOT_SET',
      NEYNAR_SIGNER_UUID: env.NEYNAR_SIGNER_UUID || 'NOT_SET',
      NEYNAR_WEBHOOK_SECRET: env.NEYNAR_WEBHOOK_SECRET ? 'SET' : 'NOT_SET',
      OPENAI_API_KEY: env.OPENAI_API_KEY ? 'SET' : 'NOT_SET',
      NODE_ENV: process.env.NODE_ENV || 'NOT_SET'
    }
  });
});

/**
 * Fetch thread context from Neynar API
 */
async function fetchThreadContext(castHash: string, threadHash: string): Promise<string> {
  try {
    if (!env.NEYNAR_API_KEY) {
      console.log('⚠️ No Neynar API key for thread context');
      return '';
    }

    // If no thread hash or it's the same as cast hash, it's not a reply
    if (!threadHash || threadHash === castHash) {
      console.log('📝 No thread context - this is an original cast');
      return '';
    }

    console.log(`🔍 Fetching thread context for thread: ${threadHash}`);

    const response = await fetch(`https://api.neynar.com/v2/farcaster/cast/conversation?identifier=${threadHash}&type=hash&reply_depth=5&include_chronological_parent_casts=true`, {
      method: 'GET',
      headers: {
        'api_key': env.NEYNAR_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.error(`❌ Failed to fetch thread context: ${response.status}`);
      return '';
    }

    const data = await response.json();
    
    // Extract conversation context from the thread
    const threadMessages = [];
    
    // Add parent cast if available
    if (data.conversation?.cast?.text) {
      threadMessages.push(`${data.conversation.cast.author.username}: ${data.conversation.cast.text}`);
    }
    
    // Add direct replies
    if (data.conversation?.direct_replies) {
      for (const reply of data.conversation.direct_replies.slice(0, 10)) { // Limit to 10 messages
        threadMessages.push(`${reply.author.username}: ${reply.text}`);
      }
    }
    
    const context = threadMessages.join('\n');
    console.log(`✅ Thread context fetched: ${threadMessages.length} messages`);
    
    return context;

  } catch (error) {
    console.error('❌ Error fetching thread context:', error);
    return '';
  }
}

/**
 * Generate ChatGPT response for general conversation
 */
async function generateChatGPTResponse(castText: string, username: string, userHasFkey: boolean, threadContext?: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `You are dStealth, an AI agent that helps users with anonymous payments and privacy. You are knowledgeable about:
- FluidKey and fkey.id for anonymous payments
- The dStealth miniapp for privacy features
- XMTP for decentralized messaging
- Cryptocurrency and privacy technology

Be helpful, concise, and friendly. IMPORTANT: Keep responses under 200 characters to fit Farcaster's limits. Be very brief and to the point.

Current user context:
- Username: @${username}
- Has fkey.id set: ${userHasFkey ? 'Yes' : 'No'}
${!userHasFkey ? '\n- Should be encouraged to set their fkey.id for anonymous payments' : ''}

${threadContext ? `\nConversation context:\n${threadContext}` : ''}`
        },
        {
          role: 'user',
          content: castText.replace('@dstealth', '').trim()
        }
      ],
      max_tokens: 100, // Reduced from 280 to keep responses shorter
      temperature: 0.7
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  let chatGPTResponse = data.choices[0].message.content;

  // 🔧 CRITICAL: Ensure response fits within Farcaster's 320 character limit
  const maxLength = 250; // Leave room for footer
  if (chatGPTResponse.length > maxLength) {
    chatGPTResponse = chatGPTResponse.substring(0, maxLength - 3) + '...';
  }

  // Add footer with actions
  if (!userHasFkey) {
    chatGPTResponse += '\n\n🔧 Set your fkey.id: @dstealth yourname.fkey.id';
  }
  
  chatGPTResponse += '\n\n🌐 dStealth miniapp: https://dstealth.xyz';
  chatGPTResponse += '\n💬 DM me on XMTP @dstealth.base.eth';

  // 🔧 FINAL CHECK: Ensure total response fits
  if (chatGPTResponse.length > 320) {
    // Truncate and add link only
    chatGPTResponse = data.choices[0].message.content.substring(0, 200) + '...\n\n🌐 https://dstealth.xyz';
  }

  return chatGPTResponse;
}

/**
 * Generate default response for when ChatGPT is not available
 */
function getDefaultResponse(username: string, userHasFkey: boolean): string {
  const greeting = `Hey @${username}! I'm dStealth, your privacy-focused AI agent.`;
  
  let response = greeting;
  
  if (!userHasFkey) {
    response += '\n\n🔧 Get started by setting your fkey.id: @dstealth yourname.fkey.id';
    response += '\n🥷 This enables anonymous payments!';
  } else {
    response += '\n\n🥷 Anonymous payments are enabled!';
  }
  
  response += '\n\n🌐 Access full features: https://dstealth.xyz';
  response += '\n💬 DM me on XMTP @dstealth.base.eth for private messaging';
  
  return response;
}

export default router; 