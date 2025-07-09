'use client';

import { useState, useEffect } from 'react';
import { Bot, MessageCircle, Copy, Check, Play, Square, Users, Wallet, TrendingUp, Edit3, Shield, Eye, Receipt } from 'lucide-react';

interface AgentInfo {
  inboxId: string;
  address: string;
  status: string;
  features: string[];
}

export default function XMTPAgentManager() {
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [agentStatus, setAgentStatus] = useState<'idle' | 'loading' | 'running' | 'error'>('idle');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState<string>(() => {
    // Load saved prompt from localStorage
    if (typeof window !== 'undefined') {
      return localStorage.getItem('custom_agent_prompt') || 
        "Act as a helpful privacy advisor focused on stealth addresses and anonymous payments. Guide users through creating stealth addresses, generating payment links, and understanding zk receipts for enhanced privacy.";
    }
    return "Act as a helpful privacy advisor focused on stealth addresses and anonymous payments. Guide users through creating stealth addresses, generating payment links, and understanding zk receipts for enhanced privacy.";
  });

  // Load agent info on component mount
  useEffect(() => {
    // 🔧 CRITICAL FIX: Add startup delay to prevent early requests
    const startupDelay = 5000; // Wait 5 seconds before first request (longer than BotChat)
    console.log(`⏳ XMTPAgentManager waiting ${startupDelay/1000}s before fetching agent info...`);
    
    const timer = setTimeout(() => {
      console.log('🚀 XMTPAgentManager starting agent info fetch after startup delay');
      fetchAgentInfo();
    }, startupDelay);

    return () => clearTimeout(timer);
  }, []);

  // Save custom prompt to localStorage when it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('custom_agent_prompt', customPrompt);
    }
  }, [customPrompt]);

  const fetchAgentInfo = async () => {
    try {
      setAgentStatus('loading');
      setError(null);

      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';
      console.log('🔍 Fetching agent info from:', `${backendUrl}/api/agent/info`);
      
      // Note: /api/agent/info is a public endpoint and doesn't require API secret
      const response = await fetch(`${backendUrl}/api/agent/info`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch agent info: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.success) {
        // 🔧 CRITICAL FIX: Better handling of initialization states
        if (data.agent.fallbackMode || 
            data.agent.status === 'initializing' || 
            data.agent.status === 'configuring' ||
            data.agent.status === 'recovery' ||
            data.agent.status === 'error' ||
            data.agent.address === '0x0000000000000000000000000000000000000000') {
          
          console.warn('⚠️ Agent is not ready:', data.agent.status);
          
          // 🔧 NEW: Smarter retry logic
          let retryDelay = 12000; // Default 12s for manager (less frequent than BotChat)
          let errorMessage = `Agent is ${data.agent.status}`;
          
          if (data.agent.status === 'configuring') {
            retryDelay = 8000;
            errorMessage = 'Agent is configuring - almost ready!';
          } else if (data.agent.status === 'recovery') {
            retryDelay = 20000;
            errorMessage = 'Agent initialization failed, auto-recovery in progress';
          } else if (data.agent.status === 'initializing') {
            retryDelay = 15000;
            errorMessage = 'Agent is starting up (this may take 30-60 seconds)';
          }
          
          setError(errorMessage);
          setAgentStatus('error');
          
          // 🔧 NEW: Auto-retry with intelligent delays
          setTimeout(() => {
            if (agentStatus !== 'running') {
              console.log(`🔄 Auto-retrying agent info fetch (${data.agent.status})...`);
              fetchAgentInfo();
            }
          }, retryDelay);
          
          return;
        }
        
        setAgentInfo(data.agent);
        setAgentStatus('running');
        console.log('🥷 dStealth Agent info loaded successfully');
      } else {
        throw new Error(data.message || 'Failed to get agent info');
      }
    } catch (err) {
      console.error('Failed to fetch agent info:', err);
      setError('Failed to connect to backend agent. Please check configuration.');
      setAgentStatus('error');
      
      // 🔧 NEW: Retry on network errors
      setTimeout(() => {
        if (agentStatus !== 'running') {
          console.log('🔄 Retrying after network error...');
          fetchAgentInfo();
        }
      }, 20000);
    }
  };

  // Manual refresh function
  const handleRefresh = () => {
    console.log('🔄 Manual agent info refresh requested');
    fetchAgentInfo();
  };

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const getStatusColor = () => {
    switch (agentStatus) {
      case 'running': return 'text-green-400';
      case 'loading': return 'text-yellow-400';
      case 'error': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getStatusText = () => {
    switch (agentStatus) {
      case 'running': return '🟢 Running';
      case 'loading': return '🟡 Loading...';
      case 'error': return '🔴 Error';
      default: return '⚪ Idle';
    }
  };

  return (
    <div className="space-y-6 mobile-scroll hide-scrollbar overflow-y-auto max-h-full">
      {/* Agent Status Header */}
      <div className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 border border-purple-600/30 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Bot className="h-8 w-8 text-purple-400" />
            <div>
              <h2 className="text-2xl font-bold text-white">dStealth XMTP Agent</h2>
              <p className="text-purple-300">Privacy-focused assistant for stealth addresses & anonymous payments</p>
            </div>
          </div>
          <div className={`text-lg font-semibold ${getStatusColor()}`}>
            {getStatusText()}
          </div>
        </div>

        {/* Agent Controls */}
        <div className="flex gap-3">
          <button
            onClick={handleRefresh}
            disabled={agentStatus === 'loading'}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            <Bot className="h-4 w-4" />
            {agentStatus === 'loading' ? 'Checking...' : 'Refresh Status'}
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-900/20 border border-red-600/30 rounded-lg text-red-300">
            ⚠️ {error}
          </div>
        )}
      </div>

      {/* Agent Contact Information */}
      {agentInfo && (
        <div className="bg-gray-900/50 border border-gray-600/30 rounded-lg p-6">
          <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            Agent Contact Information
          </h3>
          
          <div className="space-y-4">
            {/* Custom Agent Prompt */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
                <Edit3 className="h-4 w-4" />
                Your Custom Privacy Agent Prompt
              </label>
              <div className="mb-2">
                <p className="text-xs text-gray-400">
                  Customize how the agent helps users with stealth addresses, payment links, and privacy features. Focus on tone, privacy education, and key stealth features to emphasize.
                </p>
              </div>
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Enter your custom privacy agent prompt here..."
                rows={4}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <div className="mt-1 text-xs text-gray-500">
                Character count: {customPrompt.length} • Saved automatically
              </div>
            </div>

            {/* Inbox ID */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                XMTP Inbox ID
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={agentInfo.inboxId}
                  readOnly
                  className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white font-mono text-sm"
                />
                <button
                  onClick={() => copyToClipboard(agentInfo.inboxId, 'inboxId')}
                  className="p-2 text-gray-400 hover:text-white transition-colors"
                >
                  {copiedField === 'inboxId' ? (
                    <Check className="h-4 w-4 text-green-400" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Agent Address */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Agent Wallet Address
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={agentInfo.address}
                  readOnly
                  className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white font-mono text-sm"
                />
                <button
                  onClick={() => copyToClipboard(agentInfo.address, 'address')}
                  className="p-2 text-gray-400 hover:text-white transition-colors"
                >
                  {copiedField === 'address' ? (
                    <Check className="h-4 w-4 text-green-400" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Widget Code */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Embeddable Privacy Widget Code
              </label>
              <div className="relative">
                <textarea
                  value={`<iframe 
  src="${process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'}/widget/chat?agent=${agentInfo.inboxId}&prompt=${encodeURIComponent(customPrompt)}"
  width="400" 
  height="600" 
  frameborder="0">
</iframe>`}
                  readOnly
                  rows={6}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white font-mono text-sm"
                />
                <button
                  onClick={() => copyToClipboard(
                    `<iframe src="${process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'}/widget/chat?agent=${agentInfo.inboxId}&prompt=${encodeURIComponent(customPrompt)}" width="400" height="600" frameborder="0"></iframe>`,
                    'widget'
                  )}
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-white transition-colors"
                >
                  {copiedField === 'widget' ? (
                    <Check className="h-4 w-4 text-green-400" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>
              <div className="mt-2 text-xs text-gray-400">
                🥷 This privacy widget includes your custom agent prompt and can be embedded on any website
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Agent Capabilities */}
      <div className="bg-gray-900/50 border border-gray-600/30 rounded-lg p-6">
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Privacy & Stealth Capabilities
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <h4 className="font-semibold text-white flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Stealth Address Generation
            </h4>
            <ul className="space-y-1 text-sm text-gray-300">
              <li>• Generate anonymous stealth addresses</li>
              <li>• fkey.id integration & verification</li>
              <li>• Multi-chain stealth support</li>
              <li>• Privacy score tracking</li>
            </ul>
          </div>
          
          <div className="space-y-3">
            <h4 className="font-semibold text-white flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              ZK Receipts & Payment Links
            </h4>
            <ul className="space-y-1 text-sm text-gray-300">
              <li>• Generate anonymous payment links</li>
              <li>• ZK receipt generation</li>
              <li>• Stealth payment processing</li>
              <li>• Privacy rewards tracking</li>
            </ul>
          </div>
          
          <div className="space-y-3">
            <h4 className="font-semibold text-white">Privacy Education</h4>
            <ul className="space-y-1 text-sm text-gray-300">
              <li>• Stealth address tutorials</li>
              <li>• Privacy best practices</li>
              <li>• FluidKey Score optimization</li>
              <li>• Anonymous transaction guidance</li>
            </ul>
          </div>
          
          <div className="space-y-3">
            <h4 className="font-semibold text-white">AI & Automation</h4>
            <ul className="space-y-1 text-sm text-gray-300">
              <li>• Natural language privacy help</li>
              <li>• Smart stealth recommendations</li>
              <li>• Automated privacy workflows</li>
              <li>• 24/7 privacy assistance</li>
            </ul>
          </div>
        </div>

        {agentInfo && agentInfo.features && (
          <div className="mt-4 p-3 bg-purple-900/20 border border-purple-600/30 rounded-lg">
            <h5 className="font-semibold text-purple-300 mb-2">Active Privacy Features:</h5>
            <ul className="text-sm text-purple-200">
              {agentInfo.features.map((feature, index) => (
                <li key={index}>• {feature}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Performance Metrics */}
      <div className="bg-gray-900/50 border border-gray-600/30 rounded-lg p-6">
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Privacy Performance Metrics
        </h3>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-400">24/7</div>
            <div className="text-sm text-gray-400">Privacy Help</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-400">ZK</div>
            <div className="text-sm text-gray-400">Receipts</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-400">Stealth</div>
            <div className="text-sm text-gray-400">Addresses</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-400">Anonymous</div>
            <div className="text-sm text-gray-400">Payments</div>
          </div>
        </div>
      </div>

      {/* Usage Instructions */}
      <div className="bg-gray-900/50 border border-gray-600/30 rounded-lg p-6">
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          How to Use the dStealth Agent
        </h3>
        
        <div className="space-y-4 text-gray-300">
          <div>
            <h4 className="font-semibold text-white mb-2">1. Message the Agent</h4>
            <p className="text-sm">Use any XMTP-compatible wallet or app to message the agent using its Inbox ID above.</p>
          </div>
          
          <div>
            <h4 className="font-semibold text-white mb-2">2. Try These Privacy Commands</h4>
            <div className="bg-gray-800/50 p-3 rounded-lg font-mono text-sm space-y-1">
              <div>/help - Show all privacy commands</div>
              <div>tantodefi - Set your fkey.id username</div>
              <div>create payment link for $50 - Generate stealth payment</div>
              <div>/scan 0x123... - Check address privacy score</div>
              <div>/links - View your payment links</div>
            </div>
          </div>
          
          <div>
            <h4 className="font-semibold text-white mb-2">3. Natural Language Privacy Help</h4>
            <p className="text-sm">Ask questions like &quot;How do I create a stealth address?&quot; or &quot;What are zk receipts?&quot;</p>
          </div>
        </div>
      </div>
    </div>
  );
} 