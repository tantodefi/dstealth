'use client';

import { useState, useEffect } from 'react';
import { Bot, MessageCircle, Copy, Check, Play, Square, Users, Wallet, TrendingUp, Edit3 } from 'lucide-react';

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
        "Act as a helpful sales assistant for my content. Be persuasive but friendly when promoting my paid content to users. Highlight the value and benefits clearly.";
    }
    return "Act as a helpful sales assistant for my content. Be persuasive but friendly when promoting my paid content to users. Highlight the value and benefits clearly.";
  });

  useEffect(() => {
    // Fetch agent info from backend on component mount
    fetchAgentInfo();
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
      const response = await fetch(`${backendUrl}/api/agent/info`, {
        headers: {
          'X-API-SECRET': process.env.NEXT_PUBLIC_API_SECRET_KEY || 'development-secret-key'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch agent info: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.success) {
        setAgentInfo(data.agent);
        setAgentStatus('running');
        console.log('🤖 X402 Agent info loaded successfully');
      } else {
        throw new Error(data.message || 'Failed to get agent info');
      }
    } catch (err) {
      console.error('Failed to fetch agent info:', err);
      setError('Failed to connect to backend agent. Please check configuration.');
      setAgentStatus('error');
    }
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
    <div className="space-y-6">
      {/* Agent Status Header */}
      <div className="bg-gradient-to-r from-blue-900/20 to-purple-900/20 border border-blue-600/30 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Bot className="h-8 w-8 text-blue-400" />
            <div>
              <h2 className="text-2xl font-bold text-white">X402 XMTP Agent</h2>
              <p className="text-blue-300">Intelligent assistant for content monetization</p>
            </div>
          </div>
          <div className={`text-lg font-semibold ${getStatusColor()}`}>
            {getStatusText()}
          </div>
        </div>

        {/* Agent Controls */}
        <div className="flex gap-3">
          <button
            onClick={fetchAgentInfo}
            disabled={agentStatus === 'loading'}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
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
                Your Custom Agent Prompt
              </label>
              <div className="mb-2">
                <p className="text-xs text-gray-400">
                  This is how the agent will act when trying to sell your content. Be specific about tone, approach, and key points to emphasize.
                </p>
              </div>
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Enter your custom agent prompt here..."
                rows={4}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                Embeddable Widget Code
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
                💡 This widget includes your custom agent prompt and can be embedded on any website
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Agent Capabilities */}
      <div className="bg-gray-900/50 border border-gray-600/30 rounded-lg p-6">
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Users className="h-5 w-5" />
          Agent Capabilities
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <h4 className="font-semibold text-white">Content Management</h4>
            <ul className="space-y-1 text-sm text-gray-300">
              <li>• Create paid content via chat</li>
              <li>• Generate X402:// URLs</li>
              <li>• Search content database</li>
              <li>• Track earnings and analytics</li>
            </ul>
          </div>
          
          <div className="space-y-3">
            <h4 className="font-semibold text-white">User Services</h4>
            <ul className="space-y-1 text-sm text-gray-300">
              <li>• Check 🥷 token balances</li>
              <li>• Process payments</li>
              <li>• Manage fkey.id profiles</li>
              <li>• Award milestone rewards</li>
            </ul>
          </div>
          
          <div className="space-y-3">
            <h4 className="font-semibold text-white">Social Features</h4>
            <ul className="space-y-1 text-sm text-gray-300">
              <li>• User discovery and messaging</li>
              <li>• Content recommendations</li>
              <li>• Collaborative features</li>
              <li>• Community building</li>
            </ul>
          </div>
          
          <div className="space-y-3">
            <h4 className="font-semibold text-white">AI & Automation</h4>
            <ul className="space-y-1 text-sm text-gray-300">
              <li>• Natural language processing</li>
              <li>• Smart recommendations</li>
              <li>• Automated workflows</li>
              <li>• 24/7 availability</li>
            </ul>
          </div>
        </div>

        {agentInfo && agentInfo.features && (
          <div className="mt-4 p-3 bg-green-900/20 border border-green-600/30 rounded-lg">
            <h5 className="font-semibold text-green-300 mb-2">Active Features:</h5>
            <ul className="text-sm text-green-200">
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
          Performance Metrics
        </h3>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-400">24/7</div>
            <div className="text-sm text-gray-400">Availability</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-400">AI</div>
            <div className="text-sm text-gray-400">Powered</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-purple-400">Real-time</div>
            <div className="text-sm text-gray-400">Responses</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-400">Multi</div>
            <div className="text-sm text-gray-400">Platform</div>
          </div>
        </div>
      </div>

      {/* Usage Instructions */}
      <div className="bg-gray-900/50 border border-gray-600/30 rounded-lg p-6">
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          How to Interact with the Agent
        </h3>
        
        <div className="space-y-4 text-gray-300">
          <div>
            <h4 className="font-semibold text-white mb-2">1. Message the Agent</h4>
            <p className="text-sm">Use any XMTP-compatible wallet or app to message the agent using its Inbox ID above.</p>
          </div>
          
          <div>
            <h4 className="font-semibold text-white mb-2">2. Try These Commands</h4>
            <div className="bg-gray-800/50 p-3 rounded-lg font-mono text-sm space-y-1">
              <div>/help - Show all available commands</div>
              <div>/create Secret Recipe | Amazing cookies | 299 | USD</div>
              <div>/search defi strategies</div>
              <div>/balance - Check your 🥷 tokens</div>
              <div>/claim - Claim ninja rewards</div>
            </div>
          </div>
          
          <div>
            <h4 className="font-semibold text-white mb-2">3. Natural Language</h4>
            <p className="text-sm">You can also ask questions naturally like &quot;How do I earn tokens?&quot; or &quot;What&apos;s the pricing?&quot;</p>
          </div>
        </div>
      </div>
    </div>
  );
} 