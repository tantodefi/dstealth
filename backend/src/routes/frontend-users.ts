import express from 'express';
import { agentDb } from '../lib/agent-database';
import { validationMiddleware, dataValidator, ValidationWarning } from '../services/data-validation-service';

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

interface FrontendUser {
  address: string;
  fkeyId?: string;
  username?: string;
  ensName?: string;
  avatar?: string;
  bio?: string;
  lastUpdated: number;
  source: 'frontend_db';
}

/**
 * GET /api/frontend-users/all
 * Get all users from synced frontend database
 */
router.get('/all', async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    
    console.log(`📊 Fetching all frontend users (limit: ${limit}, offset: ${offset})`);

    // Get synced frontend user data
    const frontendUserData = await agentDb.getUserPreferences('comprehensive_search_frontend_users');
    
    if (!frontendUserData || !frontendUserData.users) {
      return res.json({
        success: true,
        users: [],
        total: 0,
        message: 'No frontend users synced yet'
      });
    }

    const allUsers = frontendUserData.users;
    const startIndex = parseInt(offset.toString());
    const limitNum = parseInt(limit.toString());
    
    // Apply pagination
    const paginatedUsers = allUsers.slice(startIndex, startIndex + limitNum);

    return res.json({
      success: true,
      users: paginatedUsers,
      total: allUsers.length,
      limit: limitNum,
      offset: startIndex,
      lastSync: frontendUserData.lastSync,
      message: `Retrieved ${paginatedUsers.length} frontend users`
    });

  } catch (error) {
    console.error('Error fetching frontend users:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch frontend users'
    });
  }
});

/**
 * GET /api/frontend-users/search
 * Search frontend database users by query
 */
router.get('/search', async (req, res) => {
  try {
    const { q: query, limit = 20 } = req.query;
    
    // Validate search query
    const validation = await dataValidator.validateSearchQuery(
      query as string, 
      { limit: parseInt(limit as string) || 20 }
    );
    
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        errors: validation.errors,
        warnings: validation.warnings
      });
    }

    const { query: validatedQuery, limit: validatedLimit } = validation.sanitizedData;
    
    console.log(`🔍 Searching frontend users for: "${validatedQuery}" (limit: ${validatedLimit})`);

    // Get synced frontend user data
    const frontendUserData = await agentDb.getUserPreferences('comprehensive_search_frontend_users');
    
    if (!frontendUserData || !frontendUserData.users) {
      return res.json({
        success: true,
        users: [],
        total: 0,
        query: validatedQuery,
        message: 'No frontend users synced yet'
      });
    }

    // Search users
    const searchResults = frontendUserData.users.filter((user: any) => {
      if (!user) return false;
      
      const searchableFields = [
        user.fkeyId,
        user.username, 
        user.ensName,
        user.address
      ].filter(Boolean).map(field => field.toLowerCase());
      
      const queryLower = validatedQuery.toLowerCase();
      
      return searchableFields.some(field => field.includes(queryLower));
    });

    // Sort by relevance (exact matches first)
    const sortedResults = searchResults.sort((a: any, b: any) => {
      const aExact = [a.fkeyId, a.username].some(field => 
        field && field.toLowerCase() === validatedQuery.toLowerCase()
      );
      const bExact = [b.fkeyId, b.username].some(field => 
        field && field.toLowerCase() === validatedQuery.toLowerCase()
      );
      
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      
      // Then by whether they have fkey
      if (a.fkeyId && !b.fkeyId) return -1;
      if (!a.fkeyId && b.fkeyId) return 1;
      
      return 0;
    });

    // Apply limit
    const limitedResults = sortedResults.slice(0, validatedLimit);

    return res.json({
      success: true,
      users: limitedResults,
      total: sortedResults.length,
      query: validatedQuery,
      limit: validatedLimit,
      lastSync: frontendUserData.lastSync,
      message: `Found ${limitedResults.length} frontend users matching "${validatedQuery}"`
    });

  } catch (error) {
    console.error('Error searching frontend users:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to search frontend users'
    });
  }
});

/**
 * GET /api/frontend-users/:address
 * Get specific user from frontend database
 */
router.get('/:address', async (req, res) => {
  try {
    const { address } = req.params;

    if (!address) {
      return res.status(400).json({
        success: false,
        error: 'Address parameter is required'
      });
    }

    console.log(`👤 Fetching frontend user: ${address}`);

    // Get synced frontend user data
    const frontendUserData = await agentDb.getUserPreferences('comprehensive_search_frontend_users');
    
    if (!frontendUserData || !frontendUserData.users) {
      return res.status(404).json({
        success: false,
        error: 'No frontend users synced yet'
      });
    }

    // Find specific user
    const user = frontendUserData.users.find((u: any) => 
      u.address && u.address.toLowerCase() === address.toLowerCase()
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        error: `User with address ${address} not found in frontend database`
      });
    }

    return res.json({
      success: true,
      user,
      lastSync: frontendUserData.lastSync,
      message: `Frontend user ${address} retrieved successfully`
    });

  } catch (error) {
    console.error('Error fetching frontend user:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch frontend user'
    });
  }
});

/**
 * GET /api/frontend-users/with-fkey/all
 * Get all frontend users that have fkey set
 */
router.get('/with-fkey/all', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    console.log(`🔑 Fetching frontend users with fkey (limit: ${limit})`);

    // Get synced frontend user data
    const frontendUserData = await agentDb.getUserPreferences('comprehensive_search_frontend_users');
    
    if (!frontendUserData || !frontendUserData.users) {
      return res.json({
        success: true,
        users: [],
        total: 0,
        message: 'No frontend users synced yet'
      });
    }

    // Filter users with fkey
    const usersWithFkey = frontendUserData.users.filter((user: any) => 
      user && user.fkeyId && user.fkeyId.trim()
    );

    // Sort by most recently updated
    const sortedUsers = usersWithFkey.sort((a: any, b: any) => 
      (b.lastUpdated || 0) - (a.lastUpdated || 0)
    );

    // Apply limit
    const limitNum = parseInt(limit.toString());
    const limitedUsers = sortedUsers.slice(0, limitNum);

    return res.json({
      success: true,
      users: limitedUsers,
      total: usersWithFkey.length,
      limit: limitNum,
      lastSync: frontendUserData.lastSync,
      message: `Retrieved ${limitedUsers.length} frontend users with fkey`
    });

  } catch (error) {
    console.error('Error fetching frontend users with fkey:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch frontend users with fkey'
    });
  }
});

/**
 * GET /api/frontend-users/stats
 * Get statistics about frontend users
 */
router.get('/stats', async (req, res) => {
  try {
    console.log('📊 Calculating frontend user statistics');

    // Get synced frontend user data
    const frontendUserData = await agentDb.getUserPreferences('comprehensive_search_frontend_users');
    
    if (!frontendUserData || !frontendUserData.users) {
      return res.json({
        success: true,
        stats: {
          totalUsers: 0,
          usersWithFkey: 0,
          usersWithEns: 0,
          usersWithAvatar: 0,
          usersWithBio: 0,
          lastSync: null,
          oldestUser: null,
          newestUser: null
        },
        message: 'No frontend users synced yet'
      });
    }

    const users = frontendUserData.users;
    
    // Calculate statistics
    const stats = {
      totalUsers: users.length,
      usersWithFkey: users.filter((u: any) => u.fkeyId).length,
      usersWithEns: users.filter((u: any) => u.ensName).length,
      usersWithAvatar: users.filter((u: any) => u.avatar).length,
      usersWithBio: users.filter((u: any) => u.bio).length,
      lastSync: frontendUserData.lastSync,
      oldestUser: users.reduce((oldest: any, current: any) => 
        (!oldest || (current.lastUpdated && current.lastUpdated < oldest.lastUpdated)) ? current : oldest, null
      ),
      newestUser: users.reduce((newest: any, current: any) => 
        (!newest || (current.lastUpdated && current.lastUpdated > newest.lastUpdated)) ? current : newest, null
      )
    };

    return res.json({
      success: true,
      stats,
      message: 'Frontend user statistics calculated successfully'
    });

  } catch (error) {
    console.error('Error calculating frontend user stats:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to calculate frontend user stats'
    });
  }
});

export default router; 