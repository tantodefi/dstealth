"use client";

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/Button';
import { Copy, ExternalLink, Eye, DollarSign, Network, FileText, Search, ArrowRight, CheckCircle, EyeOff, RefreshCw } from 'lucide-react';

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
  accessToken?: string;
  transactionHash?: string;
}

interface ContentResponse {
  content: string;
  contentType: string;
  isUrl: boolean;
  metadata?: {
    title?: string;
    description?: string;
    mimeType?: string;
  };
}

function ViewerContent() {
  const searchParams = useSearchParams();
  const [content, setContent] = useState<X402Content | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>({ isPaid: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actualContent, setActualContent] = useState<ContentResponse | null>(null);
  const [x402Input, setX402Input] = useState('');
  const [iframeKey, setIframeKey] = useState(0);
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [autoRetryCount, setAutoRetryCount] = useState(0);

  const contentId = searchParams.get('content');
  const x402Uri = searchParams.get('x402_uri') || searchParams.get('uri');

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
          console.log('📖 Loading content from URI:', x402Uri);
          response = await fetch(`/api/content/view?uri=${encodeURIComponent(x402Uri)}`);
        } else {
          console.log('📖 Loading content by ID:', contentId);
          response = await fetch(`/api/content/${contentId}`);
        }

        if (!response.ok) {
          throw new Error(`Failed to load content: ${response.status} ${response.statusText}`);
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
      console.log('💳 Checking payment status for:', contentData.id);
      const response = await fetch(`/api/content/payment-status?id=${contentData.id}`);
      
      if (!response.ok) {
        throw new Error('Failed to check payment status');
      }
      
      const status = await response.json();
      setPaymentStatus(status);
      
      if (status.isPaid && status.accessToken) {
        console.log('✅ Payment verified, loading content');
        await loadActualContent(contentData.id, status.accessToken);
      } else {
        console.log('❌ Payment required');
      }
    } catch (error) {
      console.error('Error checking payment status:', error);
    }
  };

  const loadActualContent = async (contentId: string, accessToken: string) => {
    try {
      console.log('📄 Loading actual content with access token');
      const response = await fetch(`/api/content/load?id=${contentId}&token=${accessToken}`);
      
      if (!response.ok) {
        throw new Error('Failed to load content');
      }
      
      const data = await response.json();
      setActualContent(data);
      
      // Force iframe refresh when content changes
      setIframeKey(prev => prev + 1);
      
      console.log('✅ Content loaded successfully:', data.contentType);
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
      if (!cleanInput.startsWith('x402://') && !cleanInput.includes('proxy402.com/')) {
        throw new Error('Invalid URI format. Must be x402:// URI or proxy402.com URL');
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
      console.error('Error processing URI:', error);
      setError(error instanceof Error ? error.message : 'Failed to process URI');
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = async () => {
    if (!content) return;
    
    try {
      setPaymentProcessing(true);
      console.log('💰 Opening payment URL for:', content.id);
      
      const response = await fetch(`/api/content/pay?id=${content.id}`, {
        method: 'POST'
      });
      
      if (!response.ok) throw new Error('Failed to process payment');
      
      const data = await response.json();
      
      // Open payment URL in new window if provided
      if (data.paymentUrl) {
        window.open(data.paymentUrl, '_blank');
        
        // Start auto-retry after payment
        startPaymentAutoRetry();
      }
      
    } catch (error) {
      console.error('Error processing payment:', error);
      setError(error instanceof Error ? error.message : 'Failed to process payment');
    } finally {
      setPaymentProcessing(false);
    }
  };

  const startPaymentAutoRetry = () => {
    setAutoRetryCount(0);
    
    const checkPaymentInterval = setInterval(async () => {
      if (!content) {
        clearInterval(checkPaymentInterval);
        return;
      }
      
      try {
        console.log(`🔄 Auto-checking payment status (attempt ${autoRetryCount + 1})`);
        await checkPaymentStatus(content);
        
        // Stop checking if payment is confirmed
        if (paymentStatus.isPaid) {
          clearInterval(checkPaymentInterval);
          console.log('✅ Payment confirmed via auto-retry');
          return;
        }
        
        setAutoRetryCount(prev => {
          const newCount = prev + 1;
          // Stop after 10 attempts (5 minutes with 30-second intervals)
          if (newCount >= 10) {
            clearInterval(checkPaymentInterval);
          }
          return newCount;
        });
        
      } catch (error) {
        console.error('Auto-retry payment check failed:', error);
      }
    }, 30000); // Check every 30 seconds
    
    // Clean up interval after 10 minutes
    setTimeout(() => {
      clearInterval(checkPaymentInterval);
    }, 600000);
  };

  const renderContent = () => {
    if (!actualContent) return null;

    if (actualContent.isUrl) {
      // Render URL content in iframe
      return (
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <div className="border-b border-gray-700 p-4 flex items-center justify-between">
            <span className="text-green-400 flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Content Unlocked - Loading URL
            </span>
            <button
              onClick={() => setIframeKey(prev => prev + 1)}
              className="text-gray-400 hover:text-white flex items-center gap-1"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>
          <div className="relative" style={{ height: '600px' }}>
            <div 
              key={iframeKey}
              className="w-full h-full"
              dangerouslySetInnerHTML={{ 
                __html: actualContent.content 
              }}
            />
          </div>
        </div>
      );
    } else {
      // Render direct content
      return (
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <div className="border-b border-gray-700 p-4 flex items-center justify-between">
            <span className="text-green-400 flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Content Unlocked
            </span>
            <span className="text-gray-400 text-sm">
              {actualContent.metadata?.mimeType || 'Unknown type'}
            </span>
          </div>
          <div className="p-4">
            {actualContent.contentType === 'application/json' ? (
              <div className="space-y-4">
                <pre className="bg-gray-900 p-4 rounded text-green-400 text-sm overflow-auto">
                  {JSON.stringify(JSON.parse(actualContent.content), null, 2)}
                </pre>
              </div>
            ) : actualContent.contentType === 'text/html' ? (
              <div 
                className="prose prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: actualContent.content }}
              />
            ) : (
              <div className="bg-gray-900 p-4 rounded">
                <p className="text-gray-300">{actualContent.content}</p>
              </div>
            )}
          </div>
        </div>
      );
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
            {autoRetryCount > 0 && (
              <span className="text-xs bg-yellow-600 px-2 py-1 rounded">
                Checking payment... ({autoRetryCount}/10)
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
              placeholder="Enter x402:// URI or proxy402.com URL"
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
            <div className="flex items-center gap-2">
              <span className="text-red-400">⚠️</span>
              {error}
            </div>
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
                      disabled={paymentProcessing}
                      className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded flex items-center gap-1"
                    >
                      {paymentProcessing ? (
                        <>
                          <div className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent"></div>
                          Opening...
                        </>
                      ) : (
                        <>
                          <DollarSign className="h-4 w-4" />
                          Pay
                        </>
                      )}
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

              {/* Payment Status */}
              {paymentStatus.isPaid && (
                <div className="mt-4 p-3 bg-green-900/20 border border-green-600/30 rounded-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-400" />
                    <span className="text-green-400 font-medium">Payment Verified</span>
                    {paymentStatus.transactionHash && (
                      <a
                        href={`https://basescan.org/tx/${paymentStatus.transactionHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 text-xs"
                      >
                        View Transaction
                      </a>
                    )}
                  </div>
                  {paymentStatus.expiresAt && (
                    <p className="text-xs text-gray-400 mt-1">
                      Access expires: {new Date(paymentStatus.expiresAt).toLocaleString()}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Content Preview/Display */}
            {paymentStatus.isPaid && actualContent ? (
              renderContent()
            ) : (
              <div className="bg-gray-800 rounded-lg p-8 text-center">
                <FileText className="h-12 w-12 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400 mb-2">Content is locked</p>
                <p className="text-gray-500 text-sm">
                  Pay {content.price} {content.currency} to unlock this content
                </p>
                {autoRetryCount > 0 && (
                  <p className="text-yellow-400 text-xs mt-2">
                    Waiting for payment confirmation... ({autoRetryCount}/10 checks)
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {!content && !loading && !error && (
          <div className="text-center py-12">
            <Network className="h-12 w-12 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 mb-2">Enter a URI to view content</p>
            <p className="text-gray-500 text-sm">
              Supports x402:// URIs and proxy402.com URLs
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