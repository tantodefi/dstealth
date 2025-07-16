/**
 * Primary Address Validator
 * 
 * This utility validates that stealth data operations use the correct primary addresses
 * instead of relying on the flawed zkProof.claimData.owner approach.
 */

import { agentDb } from './agent-database.js';
import { env } from '../config/env.js';

export interface PrimaryAddressValidationResult {
  isValid: boolean;
  primaryAddress?: string;
  stealthAddress?: string;
  zkProof?: any;
  error?: string;
  warning?: string;
}

/**
 * Validates that stealth data uses the correct primary address structure
 */
export function validateStealthDataStructure(stealthData: any): PrimaryAddressValidationResult {
  if (!stealthData.userId) {
    return {
      isValid: false,
      error: `Stealth data missing userId field`
    };
  }

  if (!stealthData.fkeyId) {
    return {
      isValid: false,
      error: `Stealth data missing fkeyId field`
    };
  }

  if (!stealthData.stealthAddress) {
    return {
      isValid: false,
      error: `Stealth data missing stealthAddress field`
    };
  }

  // Check if metadata indicates correct primary address usage
  const primaryAddressSource = stealthData.metadata?.primaryAddressSource;
  
  if (!primaryAddressSource) {
    return {
      isValid: true,
      primaryAddress: stealthData.userId,
      stealthAddress: stealthData.stealthAddress,
      zkProof: stealthData.zkProof,
      warning: `No primaryAddressSource in metadata - assuming userId is correct`
    };
  }

  const validSources = ['connected_wallet', 'farcaster_custody', 'farcaster_verified', 'xmtp_inbox'];
  
  if (!validSources.includes(primaryAddressSource)) {
    return {
      isValid: false,
      error: `Invalid primaryAddressSource: ${primaryAddressSource}. Must be one of: ${validSources.join(', ')}`
    };
  }

  return {
    isValid: true,
    primaryAddress: stealthData.userId,
    stealthAddress: stealthData.stealthAddress,
    zkProof: stealthData.zkProof
  };
}

/**
 * Validates that a primary address is correctly formatted
 */
export function validatePrimaryAddress(address: string): boolean {
  // Check if it's a valid Ethereum address
  const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;
  return ethAddressRegex.test(address);
}

/**
 * Finds stealth data by primary address and validates it
 */
export async function findAndValidateStealthData(
  primaryAddress: string
): Promise<PrimaryAddressValidationResult> {
  try {
    if (!validatePrimaryAddress(primaryAddress)) {
      return {
        isValid: false,
        error: `Invalid primary address format: ${primaryAddress}`
      };
    }

    const stealthData = await agentDb.getStealthDataByUser(primaryAddress.toLowerCase());
    
    if (!stealthData) {
      return {
        isValid: false,
        error: `No stealth data found for primary address: ${primaryAddress}`
      };
    }

    return validateStealthDataStructure(stealthData);
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : 'Unknown error validating stealth data'
    };
  }
}

/**
 * Gets fresh stealth address for a primary address
 */
export async function getFreshStealthAddressForPrimaryAddress(
  primaryAddress: string
): Promise<PrimaryAddressValidationResult> {
  try {
    const validationResult = await findAndValidateStealthData(primaryAddress);
    
    if (!validationResult.isValid) {
      return validationResult;
    }

    const stealthData = await agentDb.getStealthDataByUser(primaryAddress.toLowerCase());
    
    if (!stealthData?.fkeyId) {
      return {
        isValid: false,
        error: `No fkey.id found for primary address: ${primaryAddress}`
      };
    }

    // Do fresh lookup to get current stealth address
    const baseUrl = env.FRONTEND_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/fkey/lookup/${stealthData.fkeyId}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.isRegistered || !data.address) {
      return {
        isValid: false,
        error: `fkey.id ${stealthData.fkeyId} not found or not registered`
      };
    }

    return {
      isValid: true,
      primaryAddress: primaryAddress.toLowerCase(),
      stealthAddress: data.address,
      zkProof: data.proof
    };
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : 'Failed to get fresh stealth address'
    };
  }
}

/**
 * Validates that all stealth data uses correct primary addresses
 */
export async function validateAllStealthDataPrimaryAddresses(): Promise<{
  total: number;
  valid: number;
  invalid: number;
  warnings: number;
  issues: string[];
}> {
  const result = {
    total: 0,
    valid: 0,
    invalid: 0,
    warnings: 0,
    issues: []
  };

  try {
    const allStealthData = await agentDb.getAllStealthData();
    result.total = allStealthData.length;

    for (const stealthData of allStealthData) {
      const validation = validateStealthDataStructure(stealthData);
      
      if (validation.isValid) {
        result.valid++;
        if (validation.warning) {
          result.warnings++;
          result.issues.push(`${stealthData.fkeyId}: ${validation.warning}`);
        }
      } else {
        result.invalid++;
        result.issues.push(`${stealthData.fkeyId}: ${validation.error}`);
      }
    }

    console.log(`📊 Primary Address Validation Summary:`);
    console.log(`  Total: ${result.total}`);
    console.log(`  Valid: ${result.valid}`);
    console.log(`  Invalid: ${result.invalid}`);
    console.log(`  Warnings: ${result.warnings}`);
    
    if (result.issues.length > 0) {
      console.log(`\n⚠️ Issues found:`);
      result.issues.forEach(issue => console.log(`  - ${issue}`));
    }

  } catch (error) {
    console.error('❌ Failed to validate primary addresses:', error);
    result.issues.push(`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return result;
}

/**
 * Development utility to log primary address validation
 */
export function logPrimaryAddressValidation(
  result: PrimaryAddressValidationResult, 
  context: string
) {
  if (process.env.NODE_ENV === 'development') {
    console.log(`🔍 ${context} - Primary address validation:`);
    console.log(`  Valid: ${result.isValid ? '✅' : '❌'}`);
    console.log(`  Primary: ${result.primaryAddress || 'N/A'}`);
    console.log(`  Stealth: ${result.stealthAddress || 'N/A'}`);
    
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }
    
    if (result.warning) {
      console.log(`  Warning: ${result.warning}`);
    }
  }
}

/**
 * Middleware to validate primary address in request handlers
 */
export function createPrimaryAddressMiddleware() {
  return async (req: any, res: any, next: any) => {
    // Skip validation for non-stealth-related routes
    if (!req.path.includes('stealth') && !req.path.includes('fkey')) {
      return next();
    }

    const { userAddress } = req.body || {};
    
    if (!userAddress) {
      return next(); // Let route handlers handle missing data
    }

    try {
      if (!validatePrimaryAddress(userAddress)) {
        return res.status(400).json({
          success: false,
          error: `Invalid primary address format: ${userAddress}`
        });
      }

      // Add primary address info to request for route handlers
      req.primaryAddress = {
        address: userAddress.toLowerCase(),
        isValid: true
      };

      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'Failed to validate primary address'
      });
    }
  };
} 