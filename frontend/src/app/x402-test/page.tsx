"use client";

import { useState, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { Button } from '@/components/Button';
import SendButton from '@/components/SendButton';

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

export default function X402TestPage() {
  const { address, isConnected } = useAccount();
  const [testUrl, setTestUrl] = useState('');
  const [method, setMethod] = useState<'GET' | 'POST' | 'PUT' | 'DELETE'>('GET');
  const [headers, setHeaders] = useState('');
  const [body, setBody] = useState('');
  const [response, setResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [paymentRequired, setPaymentRequired] = useState<X402Response | null>(null);
  const [paymentToken, setPaymentToken] = useState('');

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

  return (
    <div className="bg-gray-900 text-white min-h-screen max-w-md mx-auto">
      {/* Header */}
      <div className="sticky top-0 bg-gray-800/95 backdrop-blur border-b border-gray-700 p-4 z-10">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">X402 Test Tool</h1>
          <button
            onClick={() => window.history.back()}
            className="text-gray-400 hover:text-white"
          >
            ✕
          </button>
        </div>
        <p className="text-gray-400 text-sm mt-1">Test X402 payment requests and responses</p>
      </div>

      {/* Content */}
      <div className="p-4 space-y-6">
        {/* Request Configuration */}
        <div className="bg-gray-800 rounded-lg p-4">
          <h2 className="text-white font-semibold mb-3 flex items-center gap-2">
            <span>🧪</span>
            Test Request
          </h2>
          
          {/* Method and URL */}
          <div className="space-y-3">
            <div className="flex gap-2">
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as any)}
                className="bg-gray-700 text-white px-3 py-2 rounded border border-gray-600"
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
                placeholder="https://proxy402.com/example"
                className="flex-1 bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 placeholder-gray-400"
              />
            </div>

            {/* Headers */}
            <div>
              <label className="text-gray-300 text-sm block mb-1">Headers (key: value, one per line)</label>
              <textarea
                value={headers}
                onChange={(e) => setHeaders(e.target.value)}
                placeholder="Authorization: Bearer token\\nContent-Type: application/json"
                rows={3}
                className="w-full bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 placeholder-gray-400 text-sm font-mono"
              />
            </div>

            {/* Body (for POST/PUT) */}
            {(method === 'POST' || method === 'PUT') && (
              <div>
                <label className="text-gray-300 text-sm block mb-1">Request Body (JSON)</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder='{"key": "value"}'
                  rows={4}
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 placeholder-gray-400 text-sm font-mono"
                />
              </div>
            )}

            {/* Payment Token */}
            {paymentToken && (
              <div>
                <label className="text-gray-300 text-sm block mb-1">Payment Token (X-Payment header)</label>
                <textarea
                  value={paymentToken}
                  readOnly
                  rows={3}
                  className="w-full bg-gray-700 text-green-100 px-3 py-2 rounded border border-green-600 text-sm font-mono"
                />
              </div>
            )}

            {/* Test Button */}
            <Button
              onClick={testX402Request}
              disabled={!testUrl.trim() || loading}
              className="w-full"
            >
              {loading ? 'Testing...' : 'Send Request'}
            </Button>
          </div>
        </div>

        {/* Payment Required */}
        {paymentRequired && (
          <div className="bg-orange-900/20 border border-orange-600/30 rounded-lg p-4">
            <h3 className="text-orange-400 font-semibold mb-3 flex items-center gap-2">
              <span>💳</span>
              Payment Required (402)
            </h3>
            
            {paymentRequired.accepts && paymentRequired.accepts.length > 0 && (
              <div className="space-y-3">
                {paymentRequired.accepts.map((accept, index) => (
                  <div key={index} className="bg-gray-800 rounded p-3">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="text-gray-400">Amount:</div>
                      <div className="text-white">{(parseInt(accept.maxAmountRequired) / 1e6).toFixed(6)} {accept.extra?.name || 'USDC'}</div>
                      
                      <div className="text-gray-400">Network:</div>
                      <div className="text-white">{accept.network}</div>
                      
                      <div className="text-gray-400">Pay To:</div>
                      <div className="text-white text-xs font-mono">{accept.payTo}</div>
                    </div>
                    
                    {isConnected && !paymentToken && (
                      <div className="mt-3">
                        <SendButton
                          recipientAddress={accept.payTo}
                          amount={(parseInt(accept.maxAmountRequired) / 1e6).toString()}
                          onPaymentCompleted={handlePaymentCompleted}
                          paymentMethod="custom"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {paymentRequired.error && (
              <div className="text-red-400 text-sm mt-2">
                Error: {paymentRequired.error}
              </div>
            )}
          </div>
        )}

        {/* Response */}
        {response && (
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
              <span>📨</span>
              Response
            </h3>

            {/* Status */}
            <div className="mb-3">
              <span className={`inline-block px-2 py-1 rounded text-sm font-mono ${
                response.status >= 200 && response.status < 300 
                  ? 'bg-green-600 text-white' 
                  : response.status === 402
                  ? 'bg-orange-600 text-white'
                  : 'bg-red-600 text-white'
              }`}>
                {response.status} {response.statusText}
              </span>
            </div>

            {/* Headers */}
            <div className="mb-3">
              <div className="text-gray-300 text-sm mb-1">Headers:</div>
              <pre className="bg-gray-700 text-gray-100 p-2 rounded text-xs overflow-auto">
                {Object.entries(response.headers).map(([key, value]) => 
                  `${key}: ${value}`
                ).join('\\n')}
              </pre>
            </div>

            {/* Body */}
            <div>
              <div className="text-gray-300 text-sm mb-1">Body:</div>
              <pre className="bg-gray-700 text-gray-100 p-2 rounded text-xs overflow-auto max-h-64">
                {typeof response.body === 'string' 
                  ? response.body 
                  : JSON.stringify(response.body, null, 2)
                }
              </pre>
            </div>
          </div>
        )}

        {/* Sample URLs */}
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-white font-semibold mb-3">Sample X402 URLs</h3>
          <div className="space-y-2">
            {[
              'https://proxy402.com/aek56kV2rb',
              'https://proxy402.com/wUUbqudYsM',
              '/api/x402/test-content'
            ].map((url, index) => (
              <button
                key={index}
                onClick={() => setTestUrl(url)}
                className="w-full text-left bg-gray-700 hover:bg-gray-600 p-2 rounded text-sm text-blue-400 font-mono"
              >
                {url}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
} 