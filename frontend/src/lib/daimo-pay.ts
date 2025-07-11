import { env } from './env';

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
    this.apiKey = apiKey || process.env.NEXT_DAIMO_API_KEY || '';
    this.apiUrl = apiUrl || 'https://pay.daimo.com';
    
    console.log('🔧 Daimo Pay Client Configuration:', {
      hasApiKey: !!this.apiKey,
      apiKeyLength: this.apiKey.length,
      apiUrl: this.apiUrl,
      envApiKey: !!process.env.NEXT_DAIMO_API_KEY,
      envApiKeyLength: process.env.NEXT_DAIMO_API_KEY?.length || 0
    });
    
    if (!this.apiKey) {
      console.error('❌ NEXT_DAIMO_API_KEY not configured! Payment links will not work.');
    } else {
      console.log('✅ Daimo API key configured, will use Payment Links API');
    }
  }

  async createPaymentLink(request: DaimoPaymentRequest): Promise<DaimoPaymentResponse> {
    if (!this.apiKey) {
      throw new Error('Daimo API key not configured - payment links cannot be generated');
    }

    try {
      console.log('🔗 Attempting to create Daimo payment link via API:', {
        destinationAddress: request.destinationAddress,
        amount: request.amountUnits,
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
        ...(request.metadata && { metadata: request.metadata }),
      };

      console.log('📤 Sending request to Daimo API:', requestBody);

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
        console.error('❌ Daimo API HTTP error:', {
          status: response.status,
          statusText: response.statusText,
          errorText,
          url: `${this.apiUrl}/api/payment`,
          requestBody
        });
        
        // Try to parse error response as JSON for more details
        try {
          const errorJson = JSON.parse(errorText);
          console.error('❌ Daimo API error details:', errorJson);
        } catch (e) {
          console.error('❌ Daimo API error (raw text):', errorText);
        }
        
        throw new Error(`Daimo API error: ${response.status} ${errorText}`);
      }

      const data: DaimoPaymentResponse = await response.json();
      console.log('✅ Daimo payment link created via API:', data.url);
      
      return data;

    } catch (error) {
      console.error('❌ Failed to create Daimo payment link:', {
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