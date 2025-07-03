import { env } from '../config/env';

interface DaimoPaymentRequest {
  destinationAddress: string;
  amountUnits: string;
  displayAmount: string; // Amount for display purposes (e.g., "30.00")
  tokenSymbol: string;
  chainId: string;
  externalId?: string;
  metadata?: Record<string, any>;
  intent?: string;
}

interface DaimoPaymentResponse {
  id: string;
  url: string;
  payment: {
    id: string;
    status: string;
    createdAt: string;
    display: {
      intent: string;
      paymentValue: string;
      currency: string;
    };
    destination: {
      destinationAddress: string;
      chainId: string;
      amountUnits: string;
      tokenSymbol: string;
      tokenAddress: string;
    };
    externalId?: string;
    metadata?: Record<string, any>;
  };
}

export class DaimoPayClient {
  private apiKey: string;
  private apiUrl: string;

  constructor(apiKey?: string, apiUrl?: string) {
    this.apiKey = apiKey || env.DAIMO_API_KEY || '';
    this.apiUrl = apiUrl || 'https://pay.daimo.com';
    
    console.log('🔧 Backend Daimo Pay Client Configuration:', {
      hasApiKey: !!this.apiKey,
      apiKeyLength: this.apiKey.length,
      apiUrl: this.apiUrl,
      envApiKey: !!env.DAIMO_API_KEY,
      envApiKeyLength: env.DAIMO_API_KEY?.length || 0
    });
    
    if (!this.apiKey) {
      console.error('❌ DAIMO_API_KEY not configured! Payment links will not work.');
    } else {
      console.log('✅ Daimo API key configured, will use Payment Links API');
    }
  }

  async createPaymentLink(request: DaimoPaymentRequest): Promise<DaimoPaymentResponse> {
    if (!this.apiKey) {
      throw new Error('Daimo API key not configured - payment links cannot be generated');
    }

    try {
      console.log('🔗 Backend attempting to create Daimo payment link via API:', {
        destinationAddress: request.destinationAddress,
        amount: request.amountUnits,
        displayAmount: request.displayAmount,
        token: request.tokenSymbol,
        chainId: request.chainId
      });

      // Convert token symbol to address if needed
      const getTokenAddress = (symbol: string, chainId: string) => {
        if (chainId === '8453' && symbol === 'USDC') {
          return '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // USDC on Base
        }
        return symbol; // Return as-is if already an address or unknown
      };

      const tokenAddress = getTokenAddress(request.tokenSymbol, request.chainId);
      
      // Clean and prepare metadata - convert objects to strings for Daimo API
      const cleanMetadata: Record<string, string> = {};
      
      if (request.metadata) {
        Object.entries(request.metadata).forEach(([key, value]) => {
          if (value !== null && value !== undefined) {
            // 🔧 FIX: Skip large objects that exceed Daimo's 500 char limit
            if (key === 'zkProof' && typeof value === 'object') {
              // Store only a reference/hash instead of full zkProof
              cleanMetadata['zkProofId'] = `proof_${Date.now()}`;
              cleanMetadata['hasZkProof'] = 'true';
              return; // Skip the full zkProof object
            }
            
            // Convert remaining objects to JSON strings for Daimo API
            if (typeof value === 'object') {
              const jsonString = JSON.stringify(value);
              // Only include if under 500 char limit
              if (jsonString.length <= 450) { // Leave buffer for safety
                cleanMetadata[key] = jsonString;
              } else {
                console.warn(`⚠️ Skipping metadata.${key} - too large for Daimo (${jsonString.length} chars)`);
              }
            } else {
              const stringValue = String(value);
              if (stringValue.length <= 450) {
                cleanMetadata[key] = stringValue;
              } else {
                console.warn(`⚠️ Truncating metadata.${key} - too large for Daimo`);
                cleanMetadata[key] = stringValue.substring(0, 450) + '...';
              }
            }
          }
        });
      }

      const requestBody = {
        display: {
          intent: request.intent || 'ZK Stealth Payment',
          paymentValue: request.displayAmount, // Use display amount, not smallest units
          currency: 'USD',
        },
        destination: {
          destinationAddress: request.destinationAddress,
          chainId: parseInt(request.chainId),
          amountUnits: request.amountUnits,
          tokenSymbol: request.tokenSymbol,
          tokenAddress: tokenAddress,
        },
        ...(request.externalId && { externalId: request.externalId }),
        ...(cleanMetadata && { metadata: cleanMetadata }),
      };

      console.log('📤 Backend sending request to Daimo API:', requestBody);

      const response = await fetch(`${this.apiUrl}/api/payment`, {
        method: 'POST',
        headers: {
          'Api-Key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Backend Daimo API HTTP error:', {
          status: response.status,
          statusText: response.statusText,
          errorText,
          url: `${this.apiUrl}/api/payment`,
          requestBody
        });
        
        // Try to parse error response as JSON for more details
        try {
          const errorJson = JSON.parse(errorText);
          console.error('❌ Backend Daimo API error details:', errorJson);
        } catch (e) {
          console.error('❌ Backend Daimo API error (raw text):', errorText);
        }
        
        throw new Error(`Daimo API error: ${response.status} ${errorText}`);
      }

      const data = await response.json() as DaimoPaymentResponse;
      console.log('✅ Backend Daimo payment link created via API:', data.url);
      
      return data;

    } catch (error) {
      console.error('❌ Backend failed to create Daimo payment link:', {
        error: error instanceof Error ? error.message : String(error),
        apiUrl: this.apiUrl,
        hasApiKey: !!this.apiKey,
        request
      });
      throw error;
    }
  }

  // 🚨 LEGACY LINKS COMPLETELY REMOVED
  // No more fallback to deprecated links!
}

// Helper function to get supported chain ID for Daimo
export function getDaimoChainId(chainName: string): string {
  const chainMap: Record<string, string> = {
    'base': '8453',
    'ethereum': '1',
    'optimism': '10',
    'arbitrum': '42161',
    'polygon': '137',
  };
  
  return chainMap[chainName.toLowerCase()] || '8453'; // Default to Base
}

// Export singleton instance
export const daimoPayClient = new DaimoPayClient(); 