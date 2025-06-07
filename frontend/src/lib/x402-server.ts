import { createHash, randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';

// X402 Protocol Implementation
export interface X402Content {
  id: string;
  title: string;
  description: string;
  content: string; // HTML, text, or URL to protected resource
  price: string; // in USD cents
  currency: 'USD' | 'ETH' | 'USDC';
  creator: string; // Ethereum address
  createdAt: string;
  accessCount: number;
  earnings: string;
  category: 'text' | 'image' | 'video' | 'pdf' | 'url';
  stealthAddress?: string; // For payments
}

export interface X402Payment {
  id: string;
  contentId: string;
  payerAddress: string;
  amount: string;
  currency: string;
  txHash?: string;
  status: 'pending' | 'confirmed' | 'failed';
  accessToken?: string; // JWT for content access
  expiresAt: string;
  createdAt: string;
}

export class X402Server {
  private static instance: X402Server;
  private secret: string;

  constructor() {
    this.secret = process.env.X402_JWT_SECRET || randomBytes(32).toString('hex');
  }

  public static getInstance(): X402Server {
    if (!X402Server.instance) {
      X402Server.instance = new X402Server();
    }
    return X402Server.instance;
  }

  // Generate X402:// URL
  generateX402URL(content: X402Content): string {
    const paymentHash = this.generatePaymentHash(content);
    const baseURL = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000';
    
    // x402:// protocol URL structure
    return `x402://${baseURL.replace('https://', '').replace('http://', '')}` +
           `/pay/${content.id}?price=${content.price}&currency=${content.currency}` +
           `&hash=${paymentHash}&creator=${content.creator}`;
  }

  // Generate proxy402 fallback URL  
  generateProxy402URL(content: X402Content): string {
    const baseURL = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000';
    return `${baseURL}/proxy402/${content.id}`;
  }

  // Create payment challenge
  generatePaymentHash(content: X402Content): string {
    const data = `${content.id}:${content.price}:${content.currency}:${content.creator}`;
    return createHash('sha256').update(data).digest('hex').substring(0, 16);
  }

  // Process payment and generate access token
  async processPayment(payment: X402Payment): Promise<string> {
    // Create JWT access token
    const accessToken = jwt.sign(
      {
        contentId: payment.contentId,
        payerAddress: payment.payerAddress,
        amount: payment.amount,
        paymentId: payment.id,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
      },
      this.secret
    );

    return accessToken;
  }

  // Verify access token
  verifyAccess(token: string, contentId: string): boolean {
    try {
      const decoded = jwt.verify(token, this.secret) as any;
      return decoded.contentId === contentId && decoded.exp > Math.floor(Date.now() / 1000);
    } catch {
      return false;
    }
  }

  // Store content securely
  async storeContent(content: X402Content): Promise<void> {
    // In production, store in encrypted database
    // For now, use localStorage simulation
    const storageKey = `x402:content:${content.id}`;
    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey, JSON.stringify(content));
    }
  }

  // Retrieve content with access verification
  async getContent(contentId: string, accessToken?: string): Promise<X402Content | null> {
    if (!accessToken || !this.verifyAccess(accessToken, contentId)) {
      // Return preview/metadata only
      const storageKey = `x402:content:${contentId}`;
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem(storageKey);
        if (stored) {
          const content = JSON.parse(stored);
          return {
            ...content,
            content: content.description // Only return description as preview
          };
        }
      }
      return null;
    }

    // Return full content for verified access
    const storageKey = `x402:content:${contentId}`;
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(storageKey);
      return stored ? JSON.parse(stored) : null;
    }
    
    return null;
  }

  // Track analytics
  async trackAccess(contentId: string, payerAddress: string): Promise<void> {
    const analyticsKey = `x402:analytics:${contentId}`;
    const analytics = {
      contentId,
      accessedBy: payerAddress,
      accessedAt: new Date().toISOString(),
      userAgent: typeof window !== 'undefined' ? navigator.userAgent : 'unknown'
    };

    // Store analytics (in production, send to analytics service)
    if (typeof window !== 'undefined') {
      const existing = localStorage.getItem(analyticsKey);
      const accessLog = existing ? JSON.parse(existing) : [];
      accessLog.push(analytics);
      localStorage.setItem(analyticsKey, JSON.stringify(accessLog));
    }
  }

  // Get creator earnings
  async getCreatorEarnings(creatorAddress: string): Promise<{
    totalEarnings: string;
    contentCount: number;
    topContent: X402Content[];
  }> {
    // Calculate earnings across all content
    // In production, query database
    
    return {
      totalEarnings: "0.00", // Calculate from payments
      contentCount: 0,
      topContent: []
    };
  }

  // Generate stealth payment address
  generateStealthAddress(creatorAddress: string, contentId: string): string {
    // Generate deterministic stealth address
    const seed = `${creatorAddress}:${contentId}:${this.secret}`;
    const hash = createHash('sha256').update(seed).digest('hex');
    
    // This is a simplified example - in production, use proper stealth address generation
    return `0x${hash.substring(0, 40)}`;
  }
} 