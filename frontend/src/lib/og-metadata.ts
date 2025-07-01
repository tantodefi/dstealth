import { database } from './database';

export interface MiniAppEmbed {
  version: string;
  imageUrl: string;
  button: {
    title: string;
    action: {
      type: 'launch_frame';
      name: string;
      url: string;
      splashImageUrl: string;
      splashBackgroundColor: string;
    };
  };
}

export interface OGMetadata {
  title: string;
  description: string;
  image: string;
  url: string;
  embed?: MiniAppEmbed;
}

// Enhanced metadata generation for all routes
export class OGMetadataGenerator {
  private baseUrl: string;

  constructor(baseUrl: string = process.env.NEXT_PUBLIC_URL || 'https://dstealth.app') {
    this.baseUrl = baseUrl;
  }

  // Main App Discovery Page
  async generateMainPageMetadata(): Promise<OGMetadata> {
    return {
      title: "dstealth: Private Payments & Content Creation",
      description: "Create monetized content, send private payments, and earn rewards with stealth addresses. Built on XMTP and Base.",
      image: `${this.baseUrl}/api/og/default`,
      url: this.baseUrl,
      embed: {
        version: "next",
        imageUrl: `${this.baseUrl}/api/og/default`,
        button: {
          title: "🥷 Launch dstealth",
          action: {
            type: "launch_frame",
            name: "dstealth",
            url: this.baseUrl,
            splashImageUrl: `${this.baseUrl}/images/icon.png`,
            splashBackgroundColor: "#000000"
          }
        }
      }
    };
  }

  // User Profile Pages (Dynamic based on database)
  async generateUserProfileMetadata(identifier: string): Promise<OGMetadata> {
    const userData = await this.resolveUserData(identifier);
    
    if (!userData) {
      return this.generateGenericUserMetadata(identifier);
    }

    const displayName = userData.farcasterProfile?.username || 
                       userData.ensName || 
                       userData.baseName || 
                       userData.fkeyId?.replace('.fkey.id', '') ||
                       `${userData.address.slice(0, 6)}...${userData.address.slice(-4)}`;

    // Enhanced description based on fkey.id presence and privacy settings
    let description: string;
    let buttonTitle: string;
    
    if (userData.fkeyId && userData.isDstealthUser) {
      // User has fkey.id and is a dstealth user - emphasize private payments
      const privacyInfo = userData.stats?.privacyScore ? ` • Privacy Score: ${userData.stats.privacyScore}/100` : '';
      const earningsInfo = userData.stats?.showEarnings && userData.stats?.totalEarnings 
        ? ` • $${userData.stats.totalEarnings} earned` : '';
      const contentInfo = userData.stats?.totalContent ? ` • ${userData.stats.totalContent} X402 content` : '';
      
      description = `Pay / msg ${displayName} privately${contentInfo}${earningsInfo}${privacyInfo}`;
      buttonTitle = `💰 Pay / msg ${displayName}`;
    } else if (userData.fkeyId) {
      // User has fkey.id but not full dstealth user
      description = `Pay / msg ${displayName} privately • Send stealth payments to ${userData.fkeyId}`;
      buttonTitle = `💸 Pay ${displayName} privately`;
    } else if (userData.isDstealthUser) {
      // dstealth user without fkey.id
      const earningsInfo = userData.stats?.showEarnings && userData.stats?.totalEarnings 
        ? ` • $${userData.stats.totalEarnings} earned` : '';
      const contentInfo = userData.stats?.totalContent ? ` • ${userData.stats.totalContent} X402 content` : '';
      
      description = `Support ${displayName}${contentInfo}${earningsInfo}`;
      buttonTitle = `💰 Support ${displayName}`;
    } else {
      // External Web3 identity
      description = `View ${displayName}'s Web3 profile • Connect privately via XMTP • Send stealth payments`;
      buttonTitle = `🔍 View Profile`;
    }

    return {
      title: `dstealth: ${displayName}'s Profile`,
      description,
      image: `${this.baseUrl}/api/og/user-profile?address=${userData.address}&fkey=${userData.fkeyId || ''}`,
      url: `${this.baseUrl}/user/${identifier}`,
      embed: {
        version: "next",
        imageUrl: `${this.baseUrl}/api/og/user-profile?address=${userData.address}&fkey=${userData.fkeyId || ''}`,
        button: {
          title: buttonTitle,
          action: {
            type: "launch_frame",
            name: "dstealth",
            url: `${this.baseUrl}/user/${identifier}`,
            splashImageUrl: userData.avatar || `${this.baseUrl}/images/icon.png`,
            splashBackgroundColor: userData.fkeyId ? "#16213e" : "#1a1a2e"
          }
        }
      }
    };
  }

  // X402 Content Pages (Payment-gated content)
  async generateX402ContentMetadata(contentId: string): Promise<OGMetadata> {
    // First try to find the content by scanning user links
    const content = await this.findX402Content(contentId);
    
    if (!content) {
      return this.generateNotFoundMetadata();
    }

    const creator = await this.resolveUserData(content.userId);
    const creatorName = creator?.farcasterProfile?.username || 
                       creator?.ensName || 
                       `${content.userId.slice(0, 6)}...${content.userId.slice(-4)}`;

    return {
      title: `🔒 ${content.title} - dstealth`,
      description: `Premium content by ${creatorName} • ${content.price} ${content.currency} • ${content.description.slice(0, 100)}...`,
      image: `${this.baseUrl}/api/og/x402/${contentId}`,
      url: `${this.baseUrl}/x402/${contentId}`,
      embed: {
        version: "next",
        imageUrl: `${this.baseUrl}/api/og/x402/${contentId}`,
        button: {
          title: `🔓 Unlock for ${content.price} ${content.currency}`,
          action: {
            type: "launch_frame",
            name: "dstealth",
            url: `${this.baseUrl}/x402/${contentId}`,
            splashImageUrl: content.ogImageUrl || `${this.baseUrl}/images/icon.png`,
            splashBackgroundColor: "#0a0f1c"
          }
        }
      }
    };
  }

  // Viewer Pages (Dynamic content viewing)
  async generateViewerMetadata(url: string): Promise<OGMetadata> {
    if (url.startsWith('x402://')) {
      return this.generateX402ViewerMetadata(url);
    }
    
    if (url.includes('proxy402.com')) {
      return this.generateProxy402ViewerMetadata(url);
    }

    return this.generateGenericViewerMetadata();
  }

  private async resolveUserData(identifier: string) {
    let userData = database.getUser(identifier);
    if (userData) return userData;

    if (identifier.includes('.')) {
      try {
        const response = await fetch(`/api/user/profile/${identifier}`);
        if (response.ok) {
          const data = await response.json();
          return data.profile;
        }
      } catch (error) {
        console.error('Error resolving user data:', error);
      }
    }

    return null;
  }

  private async findX402Content(contentId: string) {
    // Since we don't have a direct method to get content by ID,
    // we'll need to scan through user links or use API
    try {
      const response = await fetch(`/api/x402/info/${contentId}`);
      if (response.ok) {
        const data = await response.json();
        return data.content;
      }
    } catch (error) {
      console.error('Error finding X402 content:', error);
    }
    
    return null;
  }

  private async generateX402ViewerMetadata(x402Uri: string): Promise<OGMetadata> {
    const parsed = this.parseX402Uri(x402Uri);
    
    if (parsed) {
      const creator = await this.resolveUserData(parsed.address);
      const creatorName = creator?.farcasterProfile?.username || 
                         creator?.ensName || 
                         `${parsed.address.slice(0, 6)}...${parsed.address.slice(-4)}`;

      return {
        title: `🔒 ${parsed.title || 'Premium Content'} - dstealth`,
        description: `Pay ${parsed.price} ${parsed.currency} to access exclusive content from ${creatorName}`,
        image: `${this.baseUrl}/api/og/x402-viewer?uri=${encodeURIComponent(x402Uri)}`,
        url: `${this.baseUrl}/viewer?url=${encodeURIComponent(x402Uri)}`,
        embed: {
          version: "next",
          imageUrl: `${this.baseUrl}/api/og/x402-viewer?uri=${encodeURIComponent(x402Uri)}`,
          button: {
            title: `💳 Pay ${parsed.price} ${parsed.currency}`,
            action: {
              type: "launch_frame",
              name: "dstealth",
              url: `${this.baseUrl}/viewer?url=${encodeURIComponent(x402Uri)}`,
              splashImageUrl: creator?.avatar || `${this.baseUrl}/images/icon.png`,
              splashBackgroundColor: "#2d1b4e"
            }
          }
        }
      };
    }

    return this.generateGenericViewerMetadata();
  }

  private generateProxy402ViewerMetadata(proxyUrl: string): OGMetadata {
    return {
      title: "dstealth: Premium Content Gateway",
      description: "Access premium content through Proxy402 with instant USDC payments on Base network.",
      image: `${this.baseUrl}/api/og/proxy402-viewer`,
      url: `${this.baseUrl}/viewer?url=${encodeURIComponent(proxyUrl)}`,
      embed: {
        version: "next",
        imageUrl: `${this.baseUrl}/api/og/proxy402-viewer`,
        button: {
          title: "🚀 Access Content",
          action: {
            type: "launch_frame",
            name: "dstealth",
            url: `${this.baseUrl}/viewer?url=${encodeURIComponent(proxyUrl)}`,
            splashImageUrl: `${this.baseUrl}/images/icon.png`,
            splashBackgroundColor: "#0f172a"
          }
        }
      }
    };
  }

  private parseX402Uri(uri: string) {
    try {
      const url = new URL(uri);
      const pathParts = url.pathname.split('/');
      const params = new URLSearchParams(url.search);
      
      return {
        address: pathParts[1],
        contentId: pathParts[2],
        title: pathParts[2]?.replace(/-/g, ' '),
        price: params.get('price'),
        currency: params.get('currency') || 'USDC'
      };
    } catch {
      return null;
    }
  }

  private generateGenericUserMetadata(identifier: string): OGMetadata {
    return {
      title: `dstealth: ${identifier}'s Profile`,
      description: "Connect privately, send stealth payments, and discover premium content on dstealth.",
      image: `${this.baseUrl}/api/og/user-generic?id=${identifier}`,
      url: `${this.baseUrl}/user/${identifier}`,
      embed: {
        version: "next",
        imageUrl: `${this.baseUrl}/api/og/user-generic?id=${identifier}`,
        button: {
          title: "🔍 View Profile",
          action: {
            type: "launch_frame",
            name: "dstealth",
            url: `${this.baseUrl}/user/${identifier}`,
            splashImageUrl: `${this.baseUrl}/images/icon.png`,
            splashBackgroundColor: "#1a1a2e"
          }
        }
      }
    };
  }

  private generateGenericViewerMetadata(): OGMetadata {
    return {
      title: "dstealth Content Viewer",
      description: "Securely access premium content with instant payments. Built on X402 protocol.",
      image: `${this.baseUrl}/api/og/viewer-generic`,
      url: `${this.baseUrl}/viewer`,
      embed: {
        version: "next",
        imageUrl: `${this.baseUrl}/api/og/viewer-generic`,
        button: {
          title: "🔍 View Content",
          action: {
            type: "launch_frame",
            name: "dstealth",
            url: `${this.baseUrl}/viewer`,
            splashImageUrl: `${this.baseUrl}/images/icon.png`,
            splashBackgroundColor: "#1a1a2e"
          }
        }
      }
    };
  }

  private generateNotFoundMetadata(): OGMetadata {
    return {
      title: "Content Not Found - dstealth",
      description: "The requested content could not be found. Explore other premium content on dstealth.",
      image: `${this.baseUrl}/api/og/not-found`,
      url: this.baseUrl,
      embed: {
        version: "next",
        imageUrl: `${this.baseUrl}/api/og/not-found`,
        button: {
          title: "🔍 Explore dstealth",
          action: {
            type: "launch_frame",
            name: "dstealth",
            url: this.baseUrl,
            splashImageUrl: `${this.baseUrl}/images/icon.png`,
            splashBackgroundColor: "#dc2626"
          }
        }
      }
    };
  }
}

export const ogGenerator = new OGMetadataGenerator(); 