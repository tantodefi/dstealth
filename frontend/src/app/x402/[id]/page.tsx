import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getX402FrameMetadata, createX402ShareableURLs } from '@/lib/x402-frame';
import { env } from '@/lib/env';

interface X402PageProps {
  params: Promise<{
    id: string;
  }>;
}

// Generate metadata for the X402 Frame
export async function generateMetadata({ params }: X402PageProps): Promise<Metadata> {
  const { id: contentId } = await params;
  
  try {
    const frameMeta = await getX402FrameMetadata(contentId);
    const shareUrls = createX402ShareableURLs(contentId);
    
    return {
      title: frameMeta.title,
      description: frameMeta.description,
      openGraph: {
        title: frameMeta.title,
        description: frameMeta.description,
        images: [frameMeta['og:image']],
        type: 'website',
        url: frameMeta['og:url'],
        siteName: 'X402 Protocol',
      },
      twitter: {
        card: 'summary_large_image',
        title: frameMeta.title,
        description: frameMeta.description,
        images: [frameMeta['og:image']],
      },
      other: {
        // Farcaster Frame metadata
        'fc:frame': frameMeta['fc:frame'],
        'fc:frame:image': frameMeta['fc:frame:image'],
        'fc:frame:image:aspect_ratio': frameMeta['fc:frame:image:aspect_ratio'],
        'fc:frame:button:1': frameMeta['fc:frame:button:1'],
        'fc:frame:button:1:action': frameMeta['fc:frame:button:1:action'],
        'fc:frame:button:1:target': frameMeta['fc:frame:button:1:target'],
        'fc:frame:button:2': frameMeta['fc:frame:button:2'],
        'fc:frame:button:2:action': frameMeta['fc:frame:button:2:action'],
        'fc:frame:post_url': frameMeta['fc:frame:post_url'],
        
        // Custom X402 metadata
        'x402:content_id': frameMeta['x402:content_id'],
        'x402:url': frameMeta['x402:url'],
        'x402:price': frameMeta['x402:price'],
        'x402:network': frameMeta['x402:network'],
        'x402:content_type': frameMeta['x402:content_type'],
      },
    };
  } catch (error) {
    console.error('Error generating X402 frame metadata:', error);
    return {
      title: 'X402 Content',
      description: 'Protected content accessible via X402 payment',
    };
  }
}

export default async function X402FramePage({ params }: X402PageProps) {
  const { id: contentId } = await params;
  
  // Validate content ID format
  if (!contentId || !/^[a-zA-Z0-9]+$/.test(contentId)) {
    notFound();
  }

  try {
    // Fetch content metadata to verify it exists
    const metadataResponse = await fetch(`${env.NEXT_PUBLIC_URL}/api/x402/info/${contentId}`, {
      cache: 'no-store' // Always fetch fresh data for frames
    });
    
    if (!metadataResponse.ok) {
      notFound();
    }

    const metadata = await metadataResponse.json();
    const shareUrls = createX402ShareableURLs(contentId, metadata);
    
    // Redirect to viewer for direct access
    // Farcaster clients will show the frame, browsers will show the content
    redirect(shareUrls.viewer);
    
  } catch (error) {
    console.error('Error loading X402 content:', error);
    notFound();
  }
} 