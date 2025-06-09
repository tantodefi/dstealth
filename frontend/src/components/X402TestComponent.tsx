"use client";

import { useState, useCallback, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { Button } from '@/components/Button';
import SendButton from '@/components/SendButton';
import { Link as LinkIcon, Send, ExternalLink, Plus, ChevronDown, ChevronUp, Copy, Check, DollarSign, Eye, SortAsc, SortDesc, Frame, Image, ExternalLink as ExternalLinkIcon } from 'lucide-react';
import { database, type X402Link } from '@/lib/database';

interface X402Response {
  accepts?: Array<{
    scheme: string;
    network: string;
    maxAmountRequired: string;
    resource: string;
    description: string;
    payTo: string;
    maxTimeoutSeconds: number;
    asset: string;
    extra?: {
      name: string;
      version: string;
    };
  }>;
  error?: string;
  x402Version: number;
}

export default function X402TestComponent() {
  const { address, isConnected } = useAccount();
  const [testUrl, setTestUrl] = useState('');
  const [method, setMethod] = useState<'GET' | 'POST' | 'PUT' | 'DELETE'>('GET');
  const [headers, setHeaders] = useState('');
  const [body, setBody] = useState('');
  const [response, setResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [paymentRequired, setPaymentRequired] = useState<X402Response | null>(null);
  const [paymentToken, setPaymentToken] = useState('');
  
  // Link creation state
  const [showLinkCreator, setShowLinkCreator] = useState(true);
  const [linkTitle, setLinkTitle] = useState('');
  const [linkDescription, setLinkDescription] = useState('');
  const [linkPrice, setLinkPrice] = useState('');
  const [linkCurrency, setLinkCurrency] = useState('USDC');
  const [linkType, setLinkType] = useState<'direct' | 'proxy'>('direct');
  const [createdLinks, setCreatedLinks] = useState<X402Link[]>([]);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  
  // Test request collapsible state
  const [showTestRequest, setShowTestRequest] = useState(false);

  // Test X402 request
  const testX402Request = useCallback(async () => {
    if (!testUrl.trim()) return;

    setLoading(true);
    setResponse(null);
    setPaymentRequired(null);

    try {
      const requestHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Parse custom headers
      if (headers.trim()) {
        headers.split('\\n').forEach(line => {
          const [key, value] = line.split(':').map(s => s.trim());
          if (key && value) {
            requestHeaders[key] = value;
          }
        });
      }

      // Add payment token if available
      if (paymentToken) {
        requestHeaders['X-Payment'] = paymentToken;
      }

      const fetchOptions: RequestInit = {
        method,
        headers: requestHeaders,
      };

      if (body.trim() && (method === 'POST' || method === 'PUT')) {
        fetchOptions.body = body;
      }

      console.log('🧪 Testing X402 request:', testUrl, fetchOptions);

      const response = await fetch(testUrl, fetchOptions);
      
      // Handle different response types
      if (response.status === 402) {
        // Payment Required
        const x402Data = await response.json();
        setPaymentRequired(x402Data);
        
        setResponse({
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          body: x402Data,
          timestamp: new Date().toISOString()
        });
      } else {
        // Regular response
        const responseBody = await response.text();
        let parsedBody;
        
        try {
          parsedBody = JSON.parse(responseBody);
        } catch {
          parsedBody = responseBody;
        }

        setResponse({
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          body: parsedBody,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      setResponse({
        status: 0,
        statusText: 'Network Error',
        headers: {},
        body: { error: error instanceof Error ? error.message : 'Unknown error' },
        timestamp: new Date().toISOString()
      });
    } finally {
      setLoading(false);
    }
  }, [testUrl, method, headers, body, paymentToken]);

  // Load user's existing links from database
  useEffect(() => {
    if (address) {
      const userLinks = database.getUserX402Links(address);
      setCreatedLinks(userLinks);
    } else {
      setCreatedLinks([]);
    }
  }, [address]);

  // Handle payment completion
  const handlePaymentCompleted = useCallback((result: any) => {
    if (paymentRequired && paymentRequired.accepts?.[0]) {
      // Generate mock payment token (in real implementation, this would come from payment processor)
      const mockPaymentToken = btoa(JSON.stringify({
        x402Version: 1,
        scheme: paymentRequired.accepts[0].scheme,
        network: paymentRequired.accepts[0].network,
        payload: {
          signature: result.hash || `0x${Math.random().toString(16).substring(2, 66)}`,
          authorization: {
            from: address,
            to: paymentRequired.accepts[0].payTo,
            value: paymentRequired.accepts[0].maxAmountRequired,
            validAfter: Math.floor(Date.now() / 1000).toString(),
            validBefore: Math.floor(Date.now() / 1000 + 300).toString(), // 5 minutes
            nonce: `0x${Math.random().toString(16).substring(2, 66)}`
          }
        }
      }));
      
      setPaymentToken(mockPaymentToken);
      console.log('💳 Payment completed, token generated:', mockPaymentToken);
    }
  }, [paymentRequired, address]);

  // Create X402 link
  const createX402Link = useCallback(() => {
    if (!linkTitle.trim() || !linkDescription.trim() || !linkPrice.trim() || !address) {
      return;
    }

    const price = parseFloat(linkPrice);
    if (isNaN(price) || price <= 0) {
      return;
    }

    const directUrl = `x402://pay/${address}/${linkTitle.toLowerCase().replace(/\s+/g, '-')}?price=${price}&currency=${linkCurrency}`;
    const proxyUrl = `${window.location.origin}/viewer?url=${encodeURIComponent(directUrl)}`;
    const frameUrl = `${window.location.origin}/frame/${address}/${linkTitle.toLowerCase().replace(/\s+/g, '-')}`;
    const ogImageUrl = `${window.location.origin}/api/og?title=${encodeURIComponent(linkTitle)}&price=${price}&currency=${linkCurrency}`;

    // Save to database
    database.createX402Link({
      userId: address,
      title: linkTitle,
      description: linkDescription,
      price,
      currency: linkCurrency,
      linkType,
      directUrl,
      proxyUrl,
      frameUrl,
      ogImageUrl,
      isActive: true,
    }).then((link) => {
      setCreatedLinks(prev => [link, ...prev]);
      
      // Update legacy localStorage counter for backward compatibility
      const key = `proxy402_endpoints_${address.toLowerCase()}`;
      const currentCount = parseInt(localStorage.getItem(key) || '0', 10);
      localStorage.setItem(key, (currentCount + 1).toString());

      // Clear form
      setLinkTitle('');
      setLinkDescription('');
      setLinkPrice('');

      console.log('✅ X402 link created and saved to database:', link);
    }).catch((error) => {
      console.error('Failed to save X402 link:', error);
    });
  }, [linkTitle, linkDescription, linkPrice, linkCurrency, linkType, address]);

  // Copy link to clipboard
  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(url);
      setTimeout(() => setCopiedLink(null), 2000);
    } catch (error) {
      console.error('Failed to copy link:', error);
    }
  };

  return (
    <div className="space-y-6 mobile-scroll hide-scrollbar overflow-y-auto">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-900/20 to-blue-900/20 border border-green-600/30 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold">🔗</span>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">X402 Link Creator & Tester</h2>
            <p className="text-green-300">Create and test monetized content links</p>
          </div>
        </div>
      </div>

      {/* X402 Link Creator */}
      <div className="bg-gray-900/50 border border-gray-600/30 rounded-lg">
        <button
          onClick={() => setShowLinkCreator(!showLinkCreator)}
          className="w-full p-4 flex items-center justify-between hover:bg-gray-800/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Plus className="h-6 w-6 text-green-400" />
            <div className="text-left">
              <h2 className="text-xl font-bold text-white">Create X402 Payment Link</h2>
              <p className="text-sm text-gray-400">Generate monetized content links with instant payments</p>
            </div>
          </div>
          {showLinkCreator ? (
            <ChevronUp className="h-5 w-5 text-gray-400" />
          ) : (
            <ChevronDown className="h-5 w-5 text-gray-400" />
          )}
        </button>
        
        {showLinkCreator && (
          <div className="px-6 pb-6">
            {!isConnected ? (
              <div className="bg-yellow-900/20 border border-yellow-600/30 rounded-lg p-4 text-center">
                <p className="text-yellow-400 text-white">Connect your wallet to create X402 payment links</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Link Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-white text-sm font-medium mb-2">Content Title</label>
                    <input
                      type="text"
                      value={linkTitle}
                      onChange={(e) => setLinkTitle(e.target.value)}
                      placeholder="e.g., Exclusive Trading Strategy"
                      className="w-full bg-gray-800 text-white px-3 py-2 rounded border border-gray-600 placeholder-gray-400"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-white text-sm font-medium mb-2">Price & Currency</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={linkPrice}
                        onChange={(e) => setLinkPrice(e.target.value)}
                        placeholder="25.00"
                        step="0.01"
                        min="0"
                        className="flex-1 bg-gray-800 text-white px-3 py-2 rounded border border-gray-600 placeholder-gray-400"
                      />
                      <select
                        value={linkCurrency}
                        onChange={(e) => setLinkCurrency(e.target.value)}
                        className="bg-gray-800 text-white px-3 py-2 rounded border border-gray-600"
                      >
                        <option value="USDC">USDC</option>
                        <option value="ETH">ETH</option>
                        <option value="USDT">USDT</option>
                        <option value="DAI">DAI</option>
                      </select>
                    </div>
                  </div>
                </div>
                
                <div>
                  <label className="block text-white text-sm font-medium mb-2">Description</label>
                  <textarea
                    value={linkDescription}
                    onChange={(e) => setLinkDescription(e.target.value)}
                    placeholder="Detailed description of your content..."
                    rows={3}
                    className="w-full bg-gray-800 text-white px-3 py-2 rounded border border-gray-600 placeholder-gray-400"
                  />
                </div>
                
                {/* Link Type */}
                <div>
                  <label className="block text-white text-sm font-medium mb-2">Link Type</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-white">
                      <input
                        type="radio"
                        value="direct"
                        checked={linkType === 'direct'}
                        onChange={(e) => setLinkType(e.target.value as 'direct' | 'proxy')}
                        className="text-orange-400"
                      />
                      <span>Direct X402:// Link</span>
                    </label>
                    <label className="flex items-center gap-2 text-white">
                      <input
                        type="radio"
                        value="proxy"
                        checked={linkType === 'proxy'}
                        onChange={(e) => setLinkType(e.target.value as 'direct' | 'proxy')}
                        className="text-orange-400"
                      />
                      <span>Proxy402 Viewer Link</span>
                    </label>
                  </div>
                </div>
                
                <Button
                  onClick={createX402Link}
                  disabled={!linkTitle.trim() || !linkDescription.trim() || !linkPrice.trim()}
                  className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Create X402 Link
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Created Links Display */}
      {createdLinks.length > 0 && (
        <div className="bg-gray-900/50 border border-gray-600/30 rounded-lg p-6">
          <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <LinkIcon className="h-5 w-5" />
            Your X402 Links ({createdLinks.length})
          </h3>
          
          <div className="space-y-3">
            {createdLinks.map((link) => (
              <div key={link.id} className="border border-gray-700 rounded-lg p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h4 className="text-white font-semibold">{link.title}</h4>
                    <p className="text-gray-400 text-sm">{link.description}</p>
                    <div className="flex items-center gap-4 mt-2 text-sm">
                      <span className="text-green-400 flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        {link.price} {link.currency}
                      </span>
                      <span className="text-blue-400">{link.linkType} link</span>
                      <span className="text-gray-500">Created {link.createdAt}</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 mt-3">
                  <div className="flex-1 bg-gray-800 px-3 py-2 rounded border border-gray-600 text-white text-sm font-mono">
                    {link.linkType === 'direct' ? link.directUrl : link.proxyUrl}
                  </div>
                  <Button
                    onClick={() => copyLink(link.linkType === 'direct' ? link.directUrl : link.proxyUrl)}
                    className="bg-gray-600 hover:bg-gray-700 text-white flex items-center gap-1"
                  >
                    {copiedLink === (link.linkType === 'direct' ? link.directUrl : link.proxyUrl) ? (
                      <Check className="h-4 w-4 text-green-400" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    onClick={() => window.open(link.linkType === 'direct' ? link.directUrl : link.proxyUrl, '_blank')}
                    className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1"
                  >
                    <Eye className="h-4 w-4" />
                    Test
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Collapsible Test Request Component */}
      <div className="bg-gray-900/50 border border-gray-600/30 rounded-lg">
        <button
          onClick={() => setShowTestRequest(!showTestRequest)}
          className="w-full p-4 flex items-center justify-between hover:bg-gray-800/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">🧪</span>
            <div className="text-left">
              <h2 className="text-xl font-bold text-white">X402 Protocol Tester</h2>
              <p className="text-sm text-gray-400">Test X402 requests and payment flows</p>
            </div>
          </div>
          {showTestRequest ? (
            <ChevronUp className="h-5 w-5 text-gray-400" />
          ) : (
            <ChevronDown className="h-5 w-5 text-gray-400" />
          )}
        </button>
        
        {showTestRequest && (
          <div className="px-6 pb-6">
            {/* Method and URL */}
            <div className="space-y-3">
              <div className="flex gap-2">
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as any)}
                  className="bg-gray-800 text-white px-3 py-2 rounded border border-gray-600"
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="DELETE">DELETE</option>
                </select>
                
                <input
                  type="text"
                  value={testUrl}
                  onChange={(e) => setTestUrl(e.target.value)}
                  placeholder="https://proxy402.com/example or x402://..."
                  className="flex-1 bg-gray-800 text-white px-3 py-2 rounded border border-gray-600 placeholder-gray-400"
                />
                
                <Button
                  onClick={testX402Request}
                  disabled={loading || !testUrl.trim()}
                  className="bg-orange-600 hover:bg-orange-700 text-white flex items-center gap-2"
                >
                  {loading ? (
                    <div className="w-4 h-4 border border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Test
                </Button>
              </div>

              {/* Headers */}
              <div>
                <label className="text-white text-sm block mb-1">Headers (key: value, one per line)</label>
                <textarea
                  value={headers}
                  onChange={(e) => setHeaders(e.target.value)}
                  placeholder="Authorization: Bearer token\\nContent-Type: application/json"
                  rows={3}
                  className="w-full bg-gray-800 text-white px-3 py-2 rounded border border-gray-600 placeholder-gray-400 text-sm font-mono"
                />
              </div>

              {/* Body */}
              {(method === 'POST' || method === 'PUT') && (
                <div>
                  <label className="text-white text-sm block mb-1">Request Body (JSON)</label>
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder='{"key": "value"}'
                    rows={4}
                    className="w-full bg-gray-800 text-white px-3 py-2 rounded border border-gray-600 placeholder-gray-400 text-sm font-mono"
                  />
                </div>
              )}
            </div>

            {/* Payment Token */}
            {paymentToken && (
              <div className="mt-4 p-3 bg-green-900/20 border border-green-600/30 rounded-lg">
                <div className="text-green-400 font-semibold mb-1">✅ Payment Token Generated</div>
                <div className="text-xs text-green-300 font-mono break-all">{paymentToken}</div>
                <p className="text-sm text-green-200 mt-2">
                  This token will be automatically included in subsequent requests as X-Payment header.
                </p>
              </div>
            )}

            {/* Response Display */}
            {response && (
              <div className="mt-6 space-y-4">
                <h4 className="text-white font-semibold">Response:</h4>
                
                {/* Status */}
                <div className="flex items-center gap-4">
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                    response.status === 200 ? 'bg-green-900/20 text-green-400 border border-green-600/30' :
                    response.status === 402 ? 'bg-yellow-900/20 text-yellow-400 border border-yellow-600/30' :
                    response.status >= 400 ? 'bg-red-900/20 text-red-400 border border-red-600/30' :
                    'bg-blue-900/20 text-blue-400 border border-blue-600/30'
                  }`}>
                    {response.status} {response.statusText}
                  </span>
                  <span className="text-gray-400 text-sm">{response.timestamp}</span>
                </div>

                {/* Headers */}
                {Object.keys(response.headers).length > 0 && (
                  <div>
                    <h5 className="text-white font-medium mb-2">Headers:</h5>
                    <div className="bg-gray-800 rounded p-3 text-sm font-mono">
                      {Object.entries(response.headers).map(([key, value]) => (
                        <div key={key} className="text-gray-300">
                          <span className="text-blue-400">{key}:</span> <span className="text-white">{value as string}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Body */}
                <div>
                  <h5 className="text-white font-medium mb-2">Body:</h5>
                  <div className="bg-gray-800 rounded p-3 text-sm font-mono text-white max-h-64 overflow-y-auto">
                    <pre>{JSON.stringify(response.body, null, 2)}</pre>
                  </div>
                </div>

                {/* Payment Required Flow */}
                {paymentRequired && (
                  <div className="mt-4 p-4 bg-yellow-900/20 border border-yellow-600/30 rounded-lg">
                    <div className="text-yellow-400 font-semibold mb-2">💳 Payment Required (402)</div>
                    {paymentRequired.accepts && paymentRequired.accepts.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-white text-sm">Payment Options:</p>
                        {paymentRequired.accepts.map((option, index) => (
                          <div key={index} className="bg-gray-800 rounded p-3 text-sm">
                            <div className="text-white">
                              <strong>{option.scheme}</strong> on {option.network}
                            </div>
                            <div className="text-gray-400">
                              Amount: {option.maxAmountRequired} {option.asset}
                            </div>
                            <div className="text-gray-400">
                              Pay to: {option.payTo}
                            </div>
                            {option.description && (
                              <div className="text-gray-300 mt-1">{option.description}</div>
                            )}
                            
                            {/* Payment Button */}
                            <div className="mt-3">
                              <SendButton
                                recipientAddress={option.payTo}
                                amount={option.maxAmountRequired}
                                onPaymentCompleted={handlePaymentCompleted}
                                disabled={false}
                                paymentMethod="custom"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
} 