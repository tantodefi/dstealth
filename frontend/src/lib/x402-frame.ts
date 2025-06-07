import { env } from "@/lib/env";

/**
 * Generate Farcaster Frame metadata for X402 URLs
 * @param contentId - The X402 content ID
 * @param metadata - Optional metadata to include
 * @returns Frame metadata object with proper OG tags
 */
export async function getX402FrameMetadata(contentId: string, metadata?: any) {
  const baseUrl = env.NEXT_PUBLIC_URL;
  const x402Url = `x402://${baseUrl?.replace('https://', '').replace('http://', '')}/content/${contentId}`;
  const viewerUrl = `${baseUrl}/viewer?uri=${encodeURIComponent(x402Url)}`;
  const imageUrl = `${baseUrl}/api/og/x402/${contentId}?format=image`;
  const metadataUrl = `${baseUrl}/api/og/x402/${contentId}?format=metadata`;

  // Fetch metadata if not provided
  let contentMeta = metadata;
  if (!contentMeta) {
    try {
      const response = await fetch(metadataUrl);
      if (response.ok) {
        contentMeta = await response.json();
      }
    } catch (error) {
      console.log('Failed to fetch X402 metadata for frame:', error);
    }
  }

  // Default values
  const title = contentMeta?.title || `X402 Content ${contentId.substring(0, 8)}`;
  const description = contentMeta?.description || 'Protected content accessible via X402 payment';
  const price = contentMeta?.price || '0.01 USDC';

  return {
    // Basic OG tags
    title,
    description,
    
    // OG meta tags for social sharing
    "og:title": title,
    "og:description": description,
    "og:image": imageUrl,
    "og:type": "website",
    "og:url": viewerUrl,
    "og:site_name": "X402 Protocol",
    
    // Twitter Card tags
    "twitter:card": "summary_large_image",
    "twitter:title": title,
    "twitter:description": description,
    "twitter:image": imageUrl,
    
    // Farcaster Frame tags
    "fc:frame": "vNext",
    "fc:frame:image": imageUrl,
    "fc:frame:image:aspect_ratio": "1.91:1",
    "fc:frame:button:1": `💳 Pay ${price} & Access`,
    "fc:frame:button:1:action": "link",
    "fc:frame:button:1:target": viewerUrl,
    "fc:frame:button:2": "🔗 Copy X402 URL",
    "fc:frame:button:2:action": "post",
    "fc:frame:post_url": `${baseUrl}/api/x402/frame-action`,
    
    // Custom X402 metadata
    "x402:content_id": contentId,
    "x402:url": x402Url,
    "x402:price": price,
    "x402:network": contentMeta?.network || 'base-sepolia',
    "x402:content_type": contentMeta?.contentType || 'text',
  };
}

/**
 * Generate HTML meta tags for X402 Frame
 * @param contentId - The X402 content ID  
 * @param metadata - Optional metadata to include
 * @returns HTML string with meta tags
 */
export async function getX402FrameMetaTagsHTML(contentId: string, metadata?: any): Promise<string> {
  const frameMeta = await getX402FrameMetadata(contentId, metadata);
  
  return Object.entries(frameMeta)
    .map(([key, value]) => {
      if (key.startsWith('og:') || key.startsWith('twitter:') || key.startsWith('fc:') || key.startsWith('x402:')) {
        return `<meta property="${key}" content="${value}" />`;
      } else if (key === 'title') {
        return `<title>${value}</title>`;
      } else if (key === 'description') {
        return `<meta name="description" content="${value}" />`;
      }
      return `<meta name="${key}" content="${value}" />`;
    })
    .join('\n    ');
}

/**
 * Create a shareable X402 URL with proper Frame metadata
 * @param contentId - The X402 content ID
 * @param metadata - Optional metadata to include  
 * @returns Object with various shareable URLs
 */
export function createX402ShareableURLs(contentId: string, metadata?: any) {
  const baseUrl = env.NEXT_PUBLIC_URL;
  const x402Url = `x402://${baseUrl?.replace('https://', '').replace('http://', '')}/content/${contentId}`;
  const frameUrl = `${baseUrl}/x402/${contentId}`;
  const viewerUrl = `${baseUrl}/viewer?uri=${encodeURIComponent(x402Url)}`;
  const directUrl = x402Url;

  return {
    // Direct X402 protocol URL
    x402: directUrl,
    
    // Frame-enabled URL for Farcaster sharing
    frame: frameUrl,
    
    // Viewer URL for direct access
    viewer: viewerUrl,
    
    // Warpcast share URL
    warpcast: `https://warpcast.com/~/compose?text=${encodeURIComponent(`Check out this X402 protected content: ${frameUrl}`)}`,
    
    // Farcaster client URLs
    farcaster: `farcaster://share?text=${encodeURIComponent(`Check out this X402 protected content: ${frameUrl}`)}`
  };
}

/**
 * Validate X402 URL format
 * @param url - URL to validate
 * @returns boolean indicating if URL is valid X402 format
 */
export function isValidX402Url(url: string): boolean {
  try {
    const regex = /^x402:\/\/([^\/]+)\/content\/([a-zA-Z0-9]+)$/;
    return regex.test(url);
  } catch {
    return false;
  }
}

/**
 * Extract content ID from X402 URL
 * @param x402Url - X402 URL to parse
 * @returns Content ID or null if invalid
 */
export function extractContentIdFromX402Url(x402Url: string): string | null {
  try {
    const regex = /^x402:\/\/[^\/]+\/content\/([a-zA-Z0-9]+)$/;
    const match = x402Url.match(regex);
    return match ? match[1] : null;
  } catch {
    return null;
  }
} 