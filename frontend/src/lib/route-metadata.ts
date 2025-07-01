import { ogGenerator, type OGMetadata } from './og-metadata';

export interface RouteMetadataContext {
  pathname: string;
  params: Record<string, string>;
  searchParams: Record<string, string>;
  user?: {
    address: string;
    isAuthenticated: boolean;
  };
}

export class RouteMetadataHandler {
  
  async generateMetadataForRoute(context: RouteMetadataContext): Promise<OGMetadata> {
    const { pathname, params, searchParams } = context;

    // 1. Main App Routes
    if (pathname === '/') {
      return await ogGenerator.generateMainPageMetadata();
    }

    // 2. User Profile Routes
    if (pathname === '/user' && context.user?.isAuthenticated) {
      // Connected user's own profile
      return await ogGenerator.generateUserProfileMetadata(context.user.address);
    }
    
    if (pathname.startsWith('/user/') && params.username) {
      // Public user profiles by username/address
      return await ogGenerator.generateUserProfileMetadata(params.username);
    }

    // 3. X402 Content Routes
    if (pathname.startsWith('/x402/') && params.id) {
      return await ogGenerator.generateX402ContentMetadata(params.id);
    }

    if (pathname === '/x402-test') {
      return this.generateX402TestMetadata();
    }

    // 4. Viewer Routes (Dynamic content)
    if (pathname === '/viewer') {
      const contentUrl = searchParams.url;
      if (contentUrl) {
        return await ogGenerator.generateViewerMetadata(contentUrl);
      }
      return await ogGenerator.generateViewerMetadata('');
    }

    // Handle viewer with embedded URLs: /viewer/proxy402.com/... or /viewer/x402://...
    if (pathname.startsWith('/viewer/')) {
      const embeddedUrl = pathname.replace('/viewer/', '');
      const decodedUrl = decodeURIComponent(embeddedUrl);
      return await ogGenerator.generateViewerMetadata(decodedUrl);
    }

    // 5. FluidKey Routes
    if (pathname === '/fkey/claim') {
      const username = searchParams.username;
      return this.generateFkeyClaimMetadata(username);
    }

    // 6. Content Creation Routes
    if (pathname.startsWith('/content/')) {
      if (params.id) {
        return await this.generateContentMetadata(params.id);
      }
    }

    // 7. Payment/Transaction Routes
    if (pathname.startsWith('/pay/') && params.linkId) {
      return await this.generatePaymentMetadata(params.linkId);
    }

    // 8. Discovery & Search Routes
    if (pathname === '/discover') {
      return this.generateDiscoveryMetadata();
    }

    // 9. Creator Dashboard Routes
    if (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) {
      return this.generateDashboardMetadata(context.user);
    }

    // Default fallback
    return await ogGenerator.generateMainPageMetadata();
  }

  // Additional metadata generators for specific route types
  private generateX402TestMetadata(): OGMetadata {
    return {
      title: "X402 Protocol Tester - dstealth",
      description: "Test X402 payment links, create monetized content, and experiment with the future of content payments.",
      image: `${process.env.NEXT_PUBLIC_URL}/api/og/x402-test`,
      url: `${process.env.NEXT_PUBLIC_URL}/x402-test`,
      embed: {
        version: "next",
        imageUrl: `${process.env.NEXT_PUBLIC_URL}/api/og/x402-test`,
        button: {
          title: "🧪 Test X402 Protocol",
          action: {
            type: "launch_frame",
            name: "dstealth",
            url: `${process.env.NEXT_PUBLIC_URL}/x402-test`,
            splashImageUrl: `${process.env.NEXT_PUBLIC_URL}/images/icon.png`,
            splashBackgroundColor: "#065f46"
          }
        }
      }
    };
  }

  private generateFkeyClaimMetadata(username?: string): OGMetadata {
    const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://dstealth.app';
    const title = username 
      ? `Claim ${username}.fkey.id - dstealth`
      : "Claim Your FluidKey Identity - dstealth";
    
    const description = username
      ? `Claim your ${username}.fkey.id identity and start earning with stealth addresses. Free FluidKey Score included!`
      : "Claim your FluidKey identity and unlock stealth payment features. Get your privacy score and start earning.";

    return {
      title,
      description,
      image: `${baseUrl}/api/og/fkey-claim${username ? `?username=${username}` : ''}`,
      url: `${baseUrl}/fkey/claim${username ? `?username=${username}` : ''}`,
      embed: {
        version: "next",
        imageUrl: `${baseUrl}/api/og/fkey-claim${username ? `?username=${username}` : ''}`,
        button: {
          title: username ? `🔑 Claim ${username}.fkey.id` : "🔑 Claim FluidKey",
          action: {
            type: "launch_frame",
            name: "dstealth",
            url: `${baseUrl}/fkey/claim${username ? `?username=${username}` : ''}`,
            splashImageUrl: `${baseUrl}/images/icon.png`,
            splashBackgroundColor: "#fbbf24"
          }
        }
      }
    };
  }

  private async generateContentMetadata(contentId: string): Promise<OGMetadata> {
    // For content viewing/payment pages
    const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://dstealth.app';
    
    try {
      const response = await fetch(`/api/content/${contentId}`);
      if (response.ok) {
        const { content } = await response.json();
        
        return {
          title: `${content.title} - dstealth`,
          description: `${content.description} • Pay ${content.price} ${content.currency} to access`,
          image: `${baseUrl}/api/og/content/${contentId}`,
          url: `${baseUrl}/content/${contentId}`,
          embed: {
            version: "next",
            imageUrl: `${baseUrl}/api/og/content/${contentId}`,
            button: {
              title: `💳 Pay ${content.price} ${content.currency}`,
              action: {
                type: "launch_frame",
                name: "dstealth",
                url: `${baseUrl}/content/${contentId}`,
                splashImageUrl: content.imageUrl || `${baseUrl}/images/icon.png`,
                splashBackgroundColor: "#1a1a2e"
              }
            }
          }
        };
      }
    } catch (error) {
      console.error('Error generating content metadata:', error);
    }

    // Fallback
    return {
      title: "Premium Content - dstealth",
      description: "Access exclusive premium content with instant payments on Base network.",
      image: `${baseUrl}/api/og/content-generic`,
      url: `${baseUrl}/content/${contentId}`,
      embed: {
        version: "next",
        imageUrl: `${baseUrl}/api/og/content-generic`,
        button: {
          title: "🔓 Access Content",
          action: {
            type: "launch_frame",
            name: "dstealth",
            url: `${baseUrl}/content/${contentId}`,
            splashImageUrl: `${baseUrl}/images/icon.png`,
            splashBackgroundColor: "#1a1a2e"
          }
        }
      }
    };
  }

  private async generatePaymentMetadata(linkId: string): Promise<OGMetadata> {
    const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://dstealth.app';
    
    return {
      title: "Complete Payment - dstealth",
      description: "Secure payment processing for premium content access. Powered by Base network.",
      image: `${baseUrl}/api/og/payment/${linkId}`,
      url: `${baseUrl}/pay/${linkId}`,
      embed: {
        version: "next",
        imageUrl: `${baseUrl}/api/og/payment/${linkId}`,
        button: {
          title: "💳 Complete Payment",
          action: {
            type: "launch_frame",
            name: "dstealth",
            url: `${baseUrl}/pay/${linkId}`,
            splashImageUrl: `${baseUrl}/images/icon.png`,
            splashBackgroundColor: "#059669"
          }
        }
      }
    };
  }

  private generateDiscoveryMetadata(): OGMetadata {
    const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://dstealth.app';
    
    return {
      title: "Discover Creators - dstealth",
      description: "Discover amazing creators, premium content, and earn rewards with stealth payments.",
      image: `${baseUrl}/api/og/discover`,
      url: `${baseUrl}/discover`,
      embed: {
        version: "next",
        imageUrl: `${baseUrl}/api/og/discover`,
        button: {
          title: "🔍 Discover Creators",
          action: {
            type: "launch_frame",
            name: "dstealth",
            url: `${baseUrl}/discover`,
            splashImageUrl: `${baseUrl}/images/icon.png`,
            splashBackgroundColor: "#7c3aed"
          }
        }
      }
    };
  }

  private generateDashboardMetadata(user?: { address: string; isAuthenticated: boolean }): OGMetadata {
    const baseUrl = process.env.NEXT_PUBLIC_URL || 'https://dstealth.app';
    
    if (!user?.isAuthenticated) {
      return {
        title: "Creator Dashboard - dstealth",
        description: "Connect your wallet to access your creator dashboard and manage your content.",
        image: `${baseUrl}/api/og/dashboard-login`,
        url: `${baseUrl}/dashboard`,
        embed: {
          version: "next",
          imageUrl: `${baseUrl}/api/og/dashboard-login`,
          button: {
            title: "🔑 Connect Wallet",
            action: {
              type: "launch_frame",
              name: "dstealth",
              url: `${baseUrl}/dashboard`,
              splashImageUrl: `${baseUrl}/images/icon.png`,
              splashBackgroundColor: "#1f2937"
            }
          }
        }
      };
    }

    return {
      title: "Creator Dashboard - dstealth",
      description: "Manage your content, track earnings, and view analytics for your premium content.",
      image: `${baseUrl}/api/og/dashboard?address=${user.address}`,
      url: `${baseUrl}/dashboard`,
      embed: {
        version: "next",
        imageUrl: `${baseUrl}/api/og/dashboard?address=${user.address}`,
        button: {
          title: "📊 View Dashboard",
          action: {
            type: "launch_frame",
            name: "dstealth",
            url: `${baseUrl}/dashboard`,
            splashImageUrl: `${baseUrl}/images/icon.png`,
            splashBackgroundColor: "#065f46"
          }
        }
      }
    };
  }
}

export const routeMetadataHandler = new RouteMetadataHandler(); 