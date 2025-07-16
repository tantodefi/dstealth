import express from 'express';
import { agentDb } from '../lib/agent-database';
import { validationMiddleware, dataValidator, ValidationWarning } from '../services/data-validation-service';
import { env } from '../config/env';

// Extend Express Request interface to include validation properties
declare global {
  namespace Express {
    interface Request {
      validatedBody?: any;
      validationWarnings?: ValidationWarning[];
    }
  }
}

const router = express.Router();

/**
 * Helper function to call fkey.id lookup API and generate ZK receipts
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

interface ComprehensiveUserSearchResult {
  fid?: number;
  username: string;
  displayName: string;
  avatarUrl: string;
  verified: boolean;
  walletAddress: string;
  fkeyId?: string;
  hasFkey: boolean;
  source: 'shared_db' | 'farcaster_api';
  stealthAddress?: string;
  lastUpdated?: number;
}

/**
 * GET /api/user/search/comprehensive
 * Search users across all data sources (agent DB, frontend DB, external APIs)
 * 🔧 ENHANCED: Generate ZK receipts for found fkey.id users
 */
router.get('/comprehensive', async (req, res) => {
  try {
    // Manual validation for GET request query parameters
    const { query, limit = 20 } = req.query;
    
    // Validate query parameter
    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Query parameter is required and must be a string'
      });
    }
    
    const validatedQuery = query.trim();
    const validatedLimit = Math.min(Math.max(parseInt(limit as string) || 20, 1), 100);
    
    console.log(`🔍 Comprehensive search for: ${validatedQuery} (limit: ${validatedLimit})`);
    
    const allResults: ComprehensiveUserSearchResult[] = [];

    // 1. Search Shared Database (stealth users with fkeys)
    try {
      const agentUsers = await agentDb.getAllStealthData();
      
      for (const userData of agentUsers) {
        if (userData.fkeyId && userData.fkeyId.toLowerCase().includes(validatedQuery.toLowerCase())) {
          
          allResults.push({
            username: userData.fkeyId,
            displayName: userData.fkeyId,
            avatarUrl: `https://api.ensideas.com/v1/avatar/${userData.userId}`,
            verified: true,
            walletAddress: userData.userId,
            fkeyId: userData.fkeyId,
            hasFkey: true,
            source: 'shared_db',
            stealthAddress: userData.stealthAddress,
            lastUpdated: userData.lastUpdated
          });
        }
      }
      
      console.log(`✅ Found ${allResults.length} users in shared database`);
    } catch (error) {
      console.warn('⚠️ Error searching shared database:', error);
    }

    // 2. Search Synced Frontend User Data (via shared database)
    try {
      const frontendUserData = await agentDb.getUserPreferences('comprehensive_search_frontend_users');
      
      if (frontendUserData && frontendUserData.users) {
        for (const user of frontendUserData.users) {
          if (user.fkeyId && user.fkeyId.toLowerCase().includes(validatedQuery.toLowerCase())) {
            // Check if this user isn't already in results from agent DB
            const existingUser = allResults.find(r => 
              r.walletAddress.toLowerCase() === user.address?.toLowerCase()
            );

            if (!existingUser) {
              
              allResults.push({
                username: user.username || user.fkeyId,
                displayName: user.ensName || user.username || user.fkeyId,
                avatarUrl: user.avatar || `https://api.ensideas.com/v1/avatar/${user.address}`,
                verified: false,
                walletAddress: user.address,
                fkeyId: user.fkeyId,
                hasFkey: !!user.fkeyId,
                source: 'shared_db',
                lastUpdated: user.lastUpdated
              });
            }
          }
        }
        
        console.log(`✅ Searched frontend database, total results: ${allResults.length}`);
      } else {
        console.log('📝 No frontend users synced yet');
      }
    } catch (error) {
      console.warn('⚠️ Error searching synced frontend user data:', error);
    }

    // 3. Search Farcaster API (for additional discovery)
    try {
      if (process.env.NEYNAR_API_KEY) {
        const farcasterResponse = await fetch(
          `https://api.neynar.com/v2/farcaster/user/search?q=${encodeURIComponent(validatedQuery)}&limit=10`,
          {
            headers: {
              'api_key': process.env.NEYNAR_API_KEY,
            },
          }
        );

        if (farcasterResponse.ok) {
          const farcasterData = await farcasterResponse.json();
          
          for (const user of farcasterData.result?.users || []) {
            // Check if user already exists in our results (avoid duplicates)
            const existingUser = allResults.find(r => 
              r.walletAddress.toLowerCase() === user.custody_address?.toLowerCase() ||
              r.username.toLowerCase() === user.username?.toLowerCase()
            );

            if (!existingUser) {
              // Check if this Farcaster user has an fkey in our database
              const userFkeyData = await agentDb.getStealthDataByUser(user.custody_address);
              
              
              allResults.push({
                fid: user.fid,
                username: user.username,
                displayName: user.display_name || user.username,
                avatarUrl: user.pfp_url || `https://api.ensideas.com/v1/avatar/${user.custody_address}`,
                verified: user.verified,
                walletAddress: user.custody_address,
                fkeyId: userFkeyData?.fkeyId,
                hasFkey: !!userFkeyData?.fkeyId,
                source: 'farcaster_api',
                stealthAddress: userFkeyData?.stealthAddress,
                lastUpdated: userFkeyData?.lastUpdated
              });
            }
          }
        }
        
        console.log(`✅ Searched Farcaster API, total results: ${allResults.length}`);
      }
    } catch (error) {
      console.warn('⚠️ Error searching Farcaster API:', error);
    }

    // 4. Deduplicate and sort results
    const deduplicatedResults = allResults.reduce((acc, current) => {
      const existing = acc.find(user => 
        user.walletAddress.toLowerCase() === current.walletAddress.toLowerCase() ||
        (user.fkeyId && current.fkeyId && user.fkeyId.toLowerCase() === current.fkeyId.toLowerCase())
      );

      if (!existing) {
        acc.push(current);
      } else {
        // Merge data from multiple sources, prioritizing shared_db
        if (current.source === 'shared_db' && existing.source !== 'shared_db') {
          const index = acc.indexOf(existing);
          acc[index] = {
            ...existing,
            ...current,
            source: 'shared_db', // Prioritize shared DB data
          };
        }
      }
      
      return acc;
    }, [] as ComprehensiveUserSearchResult[]);

    // 5. Sort by relevance (exact matches first, then by fkey status)
    const sortedResults = deduplicatedResults.sort((a, b) => {
      // Exact username matches first
      if (a.username.toLowerCase() === validatedQuery.toLowerCase()) return -1;
      if (b.username.toLowerCase() === validatedQuery.toLowerCase()) return 1;
      
      // Users with fkeys second
      if (a.hasFkey && !b.hasFkey) return -1;
      if (!a.hasFkey && b.hasFkey) return 1;
      
      // Shared DB users before others
      if (a.source === 'shared_db' && b.source !== 'shared_db') return -1;
      if (a.source !== 'shared_db' && b.source === 'shared_db') return 1;
      
      // Alphabetical by username
      return a.username.localeCompare(b.username);
    });

    // 6. Apply limit
    const limitedResults = sortedResults.slice(0, validatedLimit);

    // 7. Count results by source
    const sources = {
      shared_db: limitedResults.filter(r => r.source === 'shared_db').length,
      farcaster_api: limitedResults.filter(r => r.source === 'farcaster_api').length,
    };

    const usersWithFkey = limitedResults.filter(r => r.hasFkey);
    const zkReceiptsGenerated = 0; // No ZK receipts generated here

    return res.json({
      success: true,
      results: limitedResults,
      total: sortedResults.length,
      limit: validatedLimit,
      query: validatedQuery,
      sources,
      stats: {
        totalUsers: limitedResults.length,
        usersWithFkey: usersWithFkey.length,
        zkReceiptsGenerated,
        sourceBreakdown: sources
      },
      metadata: {
        searchTime: Date.now(),
        zkReceiptsEnabled: false, // ZK receipts are now handled by fkey.id lookup
        message: `Found ${limitedResults.length} users for "${validatedQuery}"`
      }
    });

  } catch (error) {
    console.error('Error in comprehensive search:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Search failed',
      query: req.query.query || 'unknown'
    });
  }
});

/**
 * POST /api/user/search/sync-frontend-users
 * Endpoint for frontend to sync its user database for search
 */
router.post('/sync-frontend-users', validationMiddleware('user-sync'), async (req, res) => {
  try {
    // Use validated and sanitized data from middleware
    const { users } = req.validatedBody;
    const warnings = req.validationWarnings || [];

    console.log(`🔄 Syncing ${users.length} frontend users`);
    
    // Log validation warnings if any
    if (warnings.length > 0) {
      console.log('⚠️ Sync validation warnings:', warnings);
    }

    // Store frontend users in Redis for search purposes
    // This creates a bridge between frontend localStorage and backend search
    const frontendUsersKey = 'comprehensive_search_frontend_users';
    
    const frontendUserData = {
      users: users.map((user: any) => ({
        address: user.address,
        fkeyId: user.fkeyId,
        username: user.username || user.fkeyId,
        ensName: user.ensName,
        avatar: user.avatar,
        bio: user.bio,
        lastUpdated: Date.now(),
        source: 'shared_db'
      })),
      lastSync: Date.now()
    };

    // Store in Redis with 1 hour expiration (will be refreshed by frontend)
    if (agentDb.isRedisAvailable()) {
      // Use agent database's storage mechanism for frontend user sync
      await agentDb.storeUserPreferences('comprehensive_search_frontend_users', frontendUserData);
      console.log(`✅ Synced ${users.length} frontend users for search`);
    }

    return res.json({
      success: true,
      syncedUsers: users.length,
      message: 'Frontend users synced successfully'
    });

  } catch (error) {
    console.error('Error syncing frontend users:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to sync frontend users'
    });
  }
});

export default router; 