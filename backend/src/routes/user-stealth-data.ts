import express from 'express';
import { agentDb } from '../lib/agent-database';
import { isAddress } from 'viem';
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

interface UserStealthDataRequest {
  userAddress: string;
  fkeyId: string;
  source?: string;
}

/**
 * GET /api/user/stealth-data/:address
 * Fetch stealth data for a user address
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

    if (!isAddress(address)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid address format'
      });
    }

    console.log(`🔍 Backend: Fetching stealth data for address: ${address}`);

    // Get user stealth data from agent database
    const stealthData = await agentDb.getStealthDataByUser(address);

    if (!stealthData) {
      return res.status(404).json({
        success: false,
        error: 'No stealth data found for this address'
      });
    }

    return res.json({
      success: true,
      stealthData,
      message: 'Stealth data retrieved successfully'
    });

  } catch (error) {
    console.error('Error fetching stealth data:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch stealth data'
    });
  }
});

/**
 * POST /api/user/stealth-data
 * Save/update stealth data for a user
 */
router.post('/', validationMiddleware('user-stealth-data-create'), async (req, res) => {
  try {
    // Use validated and sanitized data from middleware
    const { userAddress, fkeyId, source } = req.validatedBody as UserStealthDataRequest;
    const warnings = req.validationWarnings || [];

    console.log(`💾 Backend: Saving validated stealth data: ${fkeyId} for ${userAddress} from ${source || 'unknown'}`);
    
    // Log validation warnings if any
    if (warnings.length > 0) {
      console.log('⚠️ Validation warnings:', warnings);
    }

    // Check if user already has stealth data
    const existingData = await agentDb.getStealthDataByUser(userAddress);
    
    if (existingData) {
      // ✅ FIXED: Use primary address approach - do fresh lookup but use userAddress as key
      console.log(`🔍 Miniapp settings: Doing fresh fkey.id lookup for update of ${fkeyId}`);
      
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      let fkeyLookupResult;
      
      try {
        // Build URL with user address and source for ZK receipt generation
        const fkeyLookupUrl = new URL(`${baseUrl}/api/fkey/lookup/${fkeyId}`);
        fkeyLookupUrl.searchParams.append('userAddress', userAddress);
        fkeyLookupUrl.searchParams.append('source', 'frontend-settings-setup');
        
        const response = await fetch(fkeyLookupUrl.toString());
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        fkeyLookupResult = await response.json();
        
        if (!fkeyLookupResult.isRegistered || !fkeyLookupResult.address) {
          return res.status(400).json({
            success: false,
            error: `fkey.id ${fkeyId} not found or not registered`
          });
        }
        
        console.log('🧾 ZK receipt generated for frontend fkey.id setting');
      } catch (error) {
        console.error('❌ Failed to lookup fkey.id:', error);
        return res.status(500).json({
          success: false,
          error: `Failed to verify fkey.id ${fkeyId}: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }

      console.log(`🔑 Miniapp settings: Using connected wallet as primary address: ${userAddress} for fkey.id: ${fkeyId}`);

      // Update existing data with fresh verification
      const updatedData = {
        ...existingData,
        userId: userAddress.toLowerCase(), // ✅ FIXED: Use connected wallet address
        fkeyId,
        stealthAddress: fkeyLookupResult.address, // ✅ Current stealth address from fresh lookup
        zkProof: fkeyLookupResult.proof, // ✅ Fresh ZK proof for verification
        lastUpdated: Date.now(),
        setupStatus: 'fkey_set' as const,
        metadata: {
          ...existingData.metadata,
          source: source || 'frontend-settings',
          primaryAddressSource: 'connected_wallet',
          lastFreshLookup: Date.now()
        }
      };
      
      await agentDb.storeUserStealthData(updatedData);
      
      return res.json({
        success: true,
        stealthData: updatedData,
        message: 'Stealth data updated successfully with fresh fkey.id verification'
      });
    } else {
      // ✅ FIXED: Use primary address approach - do fresh lookup but use userAddress as key
      console.log(`🔍 Miniapp settings: Doing fresh fkey.id lookup for ${fkeyId}`);
      
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      let fkeyLookupResult;
      
      try {
        // Build URL with user address and source for ZK receipt generation
        const fkeyLookupUrl = new URL(`${baseUrl}/api/fkey/lookup/${fkeyId}`);
        fkeyLookupUrl.searchParams.append('userAddress', userAddress);
        fkeyLookupUrl.searchParams.append('source', 'frontend-settings-setup');
        
        const response = await fetch(fkeyLookupUrl.toString());
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        fkeyLookupResult = await response.json();
        
        if (!fkeyLookupResult.isRegistered || !fkeyLookupResult.address) {
          return res.status(400).json({
            success: false,
            error: `fkey.id ${fkeyId} not found or not registered`
          });
        }
        
        console.log('🧾 ZK receipt generated for frontend fkey.id setting');
      } catch (error) {
        console.error('❌ Failed to lookup fkey.id:', error);
        return res.status(500).json({
          success: false,
          error: `Failed to verify fkey.id ${fkeyId}: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }

      console.log(`🔑 Miniapp settings: Using connected wallet as primary address: ${userAddress} for fkey.id: ${fkeyId}`);

      // Create new stealth data entry using primary address
      const newStealthData = {
        userId: userAddress.toLowerCase(), // ✅ FIXED: Use connected wallet address
        fkeyId,
        stealthAddress: fkeyLookupResult.address, // ✅ Current stealth address from fresh lookup
        zkProof: fkeyLookupResult.proof, // ✅ Fresh ZK proof for verification
        requestedBy: 'frontend-settings',
        setupStatus: 'fkey_set' as const,
        lastUpdated: Date.now(),
        network: 'mainnet',
        metadata: {
          source: source || 'frontend-settings',
          primaryAddressSource: 'connected_wallet',
          timestamp: Date.now()
        }
      };
      
      await agentDb.storeUserStealthData(newStealthData);
      
      return res.json({
        success: true,
        stealthData: newStealthData,
        message: 'Stealth data created successfully with fresh fkey.id verification'
      });
    }

  } catch (error) {
    console.error('Error saving stealth data:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save stealth data'
    });
  }
});

export default router; 