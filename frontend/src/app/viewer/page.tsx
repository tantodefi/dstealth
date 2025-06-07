"use client";

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/Button';
import { Copy, ExternalLink, Eye, DollarSign, Network, FileText, Search, ArrowRight, CheckCircle, EyeOff } from 'lucide-react';

interface X402Content {
  id: string;
  title: string;
  description: string;
  contentType: string;
  price: string;
  currency: string;
  previewUrl?: string;
  contentUrl?: string;
  requiresPayment: boolean;
  metadata: {
    author?: string;
    createdAt: string;
    fileSize?: string;
    mimeType?: string;
  };
}

interface PaymentStatus {
  isPaid: boolean;
  paymentUrl?: string;
  expiresAt?: string;
}

function ViewerContent() {
  const searchParams = useSearchParams();
  const [content, setContent] = useState<X402Content | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>({ isPaid: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [actualContent, setActualContent] = useState<string | null>(null);
  const [x402Input, setX402Input] = useState('');
  const [iframeKey, setIframeKey] = useState(0); // Key for forcing iframe refresh

  const contentId = searchParams.get('content');
  const x402Uri = searchParams.get('x402_uri');

  useEffect(() => {
    const loadContent = async () => {
      if (!contentId && !x402Uri) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        let response;
        if (x402Uri) {
          response = await fetch(`/api/content/view?uri=${encodeURIComponent(x402Uri)}`);
        } else {
          response = await fetch(`/api/content/${contentId}`);
        }

        if (!response.ok) {
          throw new Error('Failed to load content');
        }

        const data = await response.json();
        setContent(data);

        // Check payment status
        await checkPaymentStatus(data);

      } catch (error) {
        console.error('Error loading content:', error);
        setError(error instanceof Error ? error.message : 'Failed to load content');
      } finally {
        setLoading(false);
      }
    };

    loadContent();
  }, [contentId, x402Uri]);

  const checkPaymentStatus = async (contentData: X402Content) => {
    try {
      const response = await fetch(`/api/content/payment-status?id=${contentData.id}`);
      if (!response.ok) throw new Error('Failed to check payment status');
      
      const status = await response.json();
      setPaymentStatus(status);
      
      if (status.isPaid) {
        loadActualContent(contentData.id);
      }
    } catch (error) {
      console.error('Error checking payment status:', error);
    }
  };

  const loadActualContent = async (contentId: string) => {
    try {
      const response = await fetch(`/api/content/load?id=${contentId}`);
      if (!response.ok) throw new Error('Failed to load content');
      
      const data = await response.json();
      setActualContent(data.content);
      // Force iframe refresh when content changes
      setIframeKey(prev => prev + 1);
    } catch (error) {
      console.error('Error loading actual content:', error);
    }
  };

  const handleX402Input = async () => {
    if (!x402Input) return;
    
    try {
      setLoading(true);
      setError(null);
      
      // Clean and validate input
      const cleanInput = x402Input.trim();
      if (!cleanInput.startsWith('x402://')) {
        throw new Error('Invalid X402 URI format. Must start with x402://');
      }
      
      // Load content
      const response = await fetch(`/api/content/view?uri=${encodeURIComponent(cleanInput)}`);
      if (!response.ok) throw new Error('Failed to load content');
      
      const data = await response.json();
      setContent(data);
      
      // Check payment status
      await checkPaymentStatus(data);
      
      // Clear input on success
      setX402Input('');
      
    } catch (error) {
      console.error('Error processing X402 URI:', error);
      setError(error instanceof Error ? error.message : 'Failed to process X402 URI');
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = async () => {
    if (!content) return;
    
    try {
      const response = await fetch(`/api/content/pay?id=${content.id}`, {
        method: 'POST'
      });
      
      if (!response.ok) throw new Error('Failed to process payment');
      
      const data = await response.json();
      
      // Open payment URL in new window if provided
      if (data.paymentUrl) {
        window.open(data.paymentUrl, '_blank');
      }
      
      // Update payment status
      await checkPaymentStatus(content);
      
    } catch (error) {
      console.error('Error processing payment:', error);
      setError(error instanceof Error ? error.message : 'Failed to process payment');
    }
  };

  return (
    <div className="bg-gray-900 text-white max-w-4xl mx-auto border-gray-700">
      {/* Fixed Header */}
      <div className="sticky top-0 bg-gray-800/95 backdrop-blur border-b border-gray-700 p-4 z-10">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-bold">X402 Viewer</h1>
          <div className="flex items-center gap-2">
            {content?.contentType && (
              <span className="text-xs bg-purple-600 px-2 py-1 rounded">
                {content.contentType.toUpperCase()}
              </span>
            )}
            <button
              onClick={() => window.history.back()}
              className="text-gray-400 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>

        {/* X402 URI Input */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={x402Input}
              onChange={(e) => setX402Input(e.target.value)}
              placeholder="Enter x402:// URI"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500"
              onKeyPress={(e) => e.key === 'Enter' && handleX402Input()}
            />
            {x402Input && (
              <button
                onClick={() => setX402Input('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-400"
              >
                ✕
              </button>
            )}
          </div>
          <Button
            onClick={handleX402Input}
            disabled={!x402Input || loading}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                Loading...
              </>
            ) : (
              <>
                <Search className="h-4 w-4" />
                Load
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Content Display */}
      <div className="p-4">
        {error && (
          <div className="bg-red-900/50 border border-red-500/50 rounded-lg p-4 mb-4 text-red-200">
            {error}
          </div>
        )}

        {content && (
          <div className="space-y-4">
            {/* Content Info */}
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold mb-1">{content.title}</h2>
                  <p className="text-gray-400">{content.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-400 font-mono">
                    {content.price} {content.currency}
                  </span>
                  {!paymentStatus.isPaid && (
                    <Button
                      onClick={handlePayment}
                      className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded flex items-center gap-1"
                    >
                      <DollarSign className="h-4 w-4" />
                      Pay
                    </Button>
                  )}
                </div>
              </div>

              {/* Metadata */}
              <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Author</span>
                    <span className="text-white">{content.metadata.author || 'Anonymous'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Created</span>
                    <span className="text-white">
                      {new Date(content.metadata.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">File Size</span>
                    <span className="text-white">{content.metadata.fileSize || 'Unknown'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">Type</span>
                    <span className="text-white">{content.metadata.mimeType || 'Unknown'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Content Preview/Display */}
            {paymentStatus.isPaid && actualContent ? (
              <div className="bg-gray-800 rounded-lg overflow-hidden">
                <div className="border-b border-gray-700 p-4 flex items-center justify-between">
                  <span className="text-green-400 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" />
                    Content Unlocked
                  </span>
                  <button
                    onClick={() => setPreviewMode(!previewMode)}
                    className="text-gray-400 hover:text-white flex items-center gap-1"
                  >
                    {previewMode ? (
                      <>
                        <EyeOff className="h-4 w-4" />
                        Hide Preview
                      </>
                    ) : (
                      <>
                        <Eye className="h-4 w-4" />
                        Show Preview
                      </>
                    )}
                  </button>
                </div>
                {previewMode && (
                  <div className="relative" style={{ paddingTop: '56.25%' }}>
                    <iframe
                      key={iframeKey}
                      src={`data:${content.metadata.mimeType};base64,${actualContent}`}
                      className="absolute top-0 left-0 w-full h-full border-0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-gray-800 rounded-lg p-8 text-center">
                <FileText className="h-12 w-12 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400 mb-2">Content is locked</p>
                <p className="text-gray-500 text-sm">
                  Pay {content.price} {content.currency} to unlock this content
                </p>
              </div>
            )}
          </div>
        )}

        {!content && !loading && !error && (
          <div className="text-center py-12">
            <Network className="h-12 w-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 mb-2">Enter an X402 URI to view content</p>
            <p className="text-gray-500 text-sm">
              Example: x402://base/0x1234.../my-content
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ViewerPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ViewerContent />
    </Suspense>
  );
} 