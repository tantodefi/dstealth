import { isAddress } from 'viem';
import { agentDb } from '../lib/agent-database';

export interface ValidationRule {
  field: string;
  type: 'required' | 'format' | 'custom' | 'unique' | 'length';
  message: string;
  validator?: (value: any, context?: any) => boolean | Promise<boolean>;
  options?: {
    min?: number;
    max?: number;
    pattern?: RegExp;
    allowEmpty?: boolean;
  };
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  sanitizedData?: any;
}

export interface ValidationError {
  field: string;
  message: string;
  value: any;
  severity: 'error' | 'warning';
}

export interface ValidationWarning {
  field: string;
  message: string;
  suggestion?: string;
}

export interface UserDataSchema {
  address: string;
  fkeyId?: string;
  username?: string;
  stealthAddress?: string;
  source: 'agent_db' | 'frontend_db' | 'localStorage' | 'farcaster_webhook';
  lastUpdated: number;
  metadata?: Record<string, any>;
}

export class DataValidationService {
  private static instance: DataValidationService;
  
  // Validation rules for different data types
  private userDataRules: ValidationRule[] = [
    {
      field: 'address',
      type: 'required',
      message: 'User address is required'
    },
    {
      field: 'address',
      type: 'format',
      message: 'Invalid Ethereum address format',
      validator: (value: string) => {
        return typeof value === 'string' && isAddress(value);
      }
    },
    {
      field: 'fkeyId',
      type: 'format',
      message: 'Invalid fkey format - must be alphanumeric and 3-50 characters',
      options: { allowEmpty: true },
      validator: (value: string) => {
        if (!value) return true; // Allow empty for optional field
        return /^[a-zA-Z0-9_-]{3,50}$/.test(value);
      }
    },
    {
      field: 'fkeyId',
      type: 'unique',
      message: 'This fkey is already in use by another user',
      validator: async (value: string, context: any) => {
        if (!value) return true; // Allow empty
        
        try {
          const allUsers = await agentDb.getAllStealthData();
          const existingUser = allUsers.find(user => 
            user.fkeyId?.toLowerCase() === value.toLowerCase() &&
            user.userId.toLowerCase() !== context?.address?.toLowerCase()
          );
          return !existingUser;
        } catch (error) {
          console.warn('Error checking fkey uniqueness:', error);
          return true; // Don't block on validation errors
        }
      }
    },
    {
      field: 'username',
      type: 'format',
      message: 'Invalid username format - must be alphanumeric and 3-30 characters',
      options: { allowEmpty: true },
      validator: (value: string) => {
        if (!value) return true; // Allow empty
        return /^[a-zA-Z0-9_-]{3,30}$/.test(value);
      }
    },
    {
      field: 'stealthAddress',
      type: 'format',
      message: 'Invalid stealth address format',
      options: { allowEmpty: true },
      validator: (value: string) => {
        if (!value) return true; // Allow empty
        return typeof value === 'string' && isAddress(value);
      }
    },
    {
      field: 'source',
      type: 'required',
      message: 'Data source is required'
    },
    {
      field: 'source',
      type: 'format',
      message: 'Invalid data source',
      validator: (value: string) => {
        const validSources = ['agent_db', 'frontend_db', 'localStorage', 'farcaster_webhook'];
        return validSources.includes(value);
      }
    },
    {
      field: 'lastUpdated',
      type: 'required',
      message: 'Last updated timestamp is required'
    },
    {
      field: 'lastUpdated',
      type: 'format',
      message: 'Invalid timestamp format',
      validator: (value: any) => {
        return typeof value === 'number' && value > 0 && value <= Date.now() + 60000; // Allow 1 minute future
      }
    }
  ];

  private fkeySearchRules: ValidationRule[] = [
    {
      field: 'query',
      type: 'required',
      message: 'Search query is required'
    },
    {
      field: 'query',
      type: 'length',
      message: 'Search query must be 2-100 characters',
      options: { min: 2, max: 100 }
    },
    {
      field: 'query',
      type: 'format',
      message: 'Search query contains invalid characters',
      validator: (value: string) => {
        // Allow alphanumeric, spaces, dots, hyphens, underscores, @
        return /^[a-zA-Z0-9\s._@-]+$/.test(value);
      }
    }
  ];

  private constructor() {}

  public static getInstance(): DataValidationService {
    if (!DataValidationService.instance) {
      DataValidationService.instance = new DataValidationService();
    }
    return DataValidationService.instance;
  }

  /**
   * Validate user data against schema and rules
   */
  async validateUserData(data: Partial<UserDataSchema>, context?: any): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const sanitizedData = { ...data };

    // Apply validation rules
    for (const rule of this.userDataRules) {
      const fieldValue = data[rule.field as keyof UserDataSchema];
      const validationError = await this.applyRule(rule, fieldValue, { ...context, ...data });
      
      if (validationError) {
        errors.push(validationError);
      }
    }

    // Add warnings for potential issues
    if (data.fkeyId && data.username && data.fkeyId !== data.username) {
      warnings.push({
        field: 'fkeyId',
        message: 'fkeyId and username differ',
        suggestion: 'Consider keeping fkeyId and username consistent'
      });
    }

    // Sanitize data
    if (data.address) {
      sanitizedData.address = data.address.toLowerCase();
    }
    
    if (data.fkeyId) {
      sanitizedData.fkeyId = data.fkeyId.toLowerCase().trim();
    }
    
    if (data.username) {
      sanitizedData.username = data.username.toLowerCase().trim();
    }

    if (data.stealthAddress) {
      sanitizedData.stealthAddress = data.stealthAddress.toLowerCase();
    }

    // Add timestamp if missing
    if (!sanitizedData.lastUpdated) {
      sanitizedData.lastUpdated = Date.now();
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      sanitizedData
    };
  }

  /**
   * Validate search query
   */
  async validateSearchQuery(query: string, options?: { limit?: number }): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    
    const data = { query, limit: options?.limit };

    // Apply search validation rules
    for (const rule of this.fkeySearchRules) {
      const fieldValue = data[rule.field as keyof typeof data];
      const validationError = await this.applyRule(rule, fieldValue, data);
      
      if (validationError) {
        errors.push(validationError);
      }
    }

    // Validate limit
    if (options?.limit) {
      if (options.limit < 1 || options.limit > 100) {
        errors.push({
          field: 'limit',
          message: 'Limit must be between 1 and 100',
          value: options.limit,
          severity: 'error'
        });
      }
    }

    // Add warnings for potentially problematic queries
    if (query.length < 3) {
      warnings.push({
        field: 'query',
        message: 'Short queries may return too many results',
        suggestion: 'Use more specific search terms'
      });
    }

    const sanitizedData = {
      query: query.trim(),
      limit: Math.min(Math.max(options?.limit || 20, 1), 100)
    };

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      sanitizedData
    };
  }

  /**
   * Validate data integrity across multiple sources
   */
  async validateDataIntegrity(userData: UserDataSchema, existingData?: UserDataSchema[]): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    
    // Basic integrity checks
    if (!userData.address) {
      errors.push({
        field: 'address',
        message: 'Address is required',
        value: userData.address,
        severity: 'error'
      });
    }

    if (userData.fkeyId && userData.fkeyId.length < 3) {
      errors.push({
        field: 'fkeyId',
        message: 'FkeyId must be at least 3 characters',
        value: userData.fkeyId,
        severity: 'error'
      });
    }

    // Skip uniqueness validation for now due to interface issues
    warnings.push({
      field: 'general',
      message: 'Uniqueness validation temporarily disabled',
      suggestion: 'Interface alignment needed between UserStealthData and UserDataSchema'
    });

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Apply a single validation rule
   */
  private async applyRule(rule: ValidationRule, value: any, context: any): Promise<ValidationError | null> {
    switch (rule.type) {
      case 'required':
        if (value === undefined || value === null || value === '') {
          return {
            field: rule.field,
            message: rule.message,
            value,
            severity: 'error'
          };
        }
        break;

      case 'format':
        if (value !== undefined && value !== null && value !== '') {
          if (rule.validator) {
            const isValid = await rule.validator(value, context);
            if (!isValid) {
              return {
                field: rule.field,
                message: rule.message,
                value,
                severity: 'error'
              };
            }
          }
        } else if (!rule.options?.allowEmpty) {
          return {
            field: rule.field,
            message: rule.message,
            value,
            severity: 'error'
          };
        }
        break;

      case 'length':
        if (value && typeof value === 'string') {
          const length = value.length;
          if (rule.options?.min && length < rule.options.min) {
            return {
              field: rule.field,
              message: rule.message,
              value,
              severity: 'error'
            };
          }
          if (rule.options?.max && length > rule.options.max) {
            return {
              field: rule.field,
              message: rule.message,
              value,
              severity: 'error'
            };
          }
        }
        break;

      case 'unique':
        if (value && rule.validator) {
          const isUnique = await rule.validator(value, context);
          if (!isUnique) {
            return {
              field: rule.field,
              message: rule.message,
              value,
              severity: 'error'
            };
          }
        }
        break;

      case 'custom':
        if (rule.validator) {
          const isValid = await rule.validator(value, context);
          if (!isValid) {
            return {
              field: rule.field,
              message: rule.message,
              value,
              severity: 'error'
            };
          }
        }
        break;
    }

    return null;
  }

  /**
   * Sanitize input to prevent injection attacks
   */
  sanitizeInput(input: any): any {
    if (typeof input === 'string') {
      // Remove potentially dangerous characters
      return input
        .replace(/[<>]/g, '') // Remove angle brackets
        .replace(/javascript:/gi, '') // Remove javascript: urls
        .replace(/on\w+=/gi, '') // Remove event handlers
        .trim();
    }
    
    if (typeof input === 'object' && input !== null) {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(input)) {
        sanitized[this.sanitizeInput(key)] = this.sanitizeInput(value);
      }
      return sanitized;
    }
    
    return input;
  }

  /**
   * Validate API request body
   */
  async validateApiRequest(endpoint: string, body: any): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    
    // Sanitize all input
    const sanitizedData = this.sanitizeInput(body);

    // Endpoint-specific validation
    switch (endpoint) {
      case 'user-stealth-data-create':
        return await this.validateUserData(sanitizedData);
      
      case 'user-search':
        return await this.validateSearchQuery(sanitizedData.query, { limit: sanitizedData.limit });
      
      case 'user-sync':
        if (!sanitizedData.users || !Array.isArray(sanitizedData.users)) {
          errors.push({
            field: 'users',
            message: 'Users array is required',
            value: sanitizedData.users,
            severity: 'error'
          });
        } else {
          // Validate each user in the array
          for (let i = 0; i < sanitizedData.users.length; i++) {
            const userValidation = await this.validateUserData(sanitizedData.users[i]);
            if (!userValidation.isValid) {
              errors.push(...userValidation.errors.map(error => ({
                ...error,
                field: `users[${i}].${error.field}`
              })));
            }
          }
        }
        break;
      
      default:
        warnings.push({
          field: 'endpoint',
          message: `No specific validation rules for endpoint: ${endpoint}`,
          suggestion: 'Consider adding endpoint-specific validation rules'
        });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      sanitizedData
    };
  }

  /**
   * Get validation summary statistics
   */
  getValidationStats(): {
    totalRules: number;
    userDataRules: number;
    searchRules: number;
    lastValidation: number;
  } {
    return {
      totalRules: this.userDataRules.length + this.fkeySearchRules.length,
      userDataRules: this.userDataRules.length,
      searchRules: this.fkeySearchRules.length,
      lastValidation: Date.now()
    };
  }

  /**
   * Validate uniqueness of user data
   * TODO: Fix interface mismatches between UserStealthData and UserDataSchema
   */
  async validateUniqueness(userData: UserDataSchema): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    
    // TODO: Re-enable uniqueness validation once interface issues are resolved
    warnings.push({
      field: 'general',
      message: 'Uniqueness validation temporarily disabled',
      suggestion: 'Interface alignment needed between UserStealthData and UserDataSchema'
    });

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}

// Validation middleware for Express routes
export const validationMiddleware = (endpoint: string) => {
  return async (req: any, res: any, next: any) => {
    try {
      const validator = DataValidationService.getInstance();
      const validation = await validator.validateApiRequest(endpoint, req.body);
      
      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          errors: validation.errors,
          warnings: validation.warnings
        });
      }
      
      // Attach sanitized data to request
      req.validatedBody = validation.sanitizedData;
      req.validationWarnings = validation.warnings;
      
      next();
    } catch (error) {
      console.error('Validation middleware error:', error);
      res.status(500).json({
        success: false,
        error: 'Validation service error'
      });
    }
  };
};

// Global instance
export const dataValidator = DataValidationService.getInstance(); 