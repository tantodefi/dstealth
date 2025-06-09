"use client";

import { useState, useEffect, useRef } from 'react';
import { MessageCircle, Send, ExternalLink } from 'lucide-react';
import { useXMTP } from '@/context/xmtp-context';
import { Conversation, DecodedMessage, Dm } from '@xmtp/browser-sdk';

interface ConvosChatProps {
  xmtpId: string;
  username: string;
  url: string;
  profile: {
    name: string;
    username: string;
    description: string | null;
    avatar: string;
    address: string;
  };
}

export default function ConvosChat({ xmtpId, username, url, profile }: ConvosChatProps) {
  const { client } = useXMTP();
  const [conversation, setConversation] = useState<Conversation<any> | null>(null);
  const [messages, setMessages] = useState<DecodedMessage<any>[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamActive, setStreamActive] = useState(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const streamStartedRef = useRef(false);

  // Add debug logging function
  const addDebugLog = (message: string, data?: any) => {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}${data ? ` - ${JSON.stringify(data)}` : ''}`;
    console.log(`ConvosChat: ${logEntry}`);
    setDebugLog(prev => [...prev.slice(-10), logEntry]); // Keep last 10 logs
  };

  // Initialize XMTP conversation
  useEffect(() => {
    if (!client || !xmtpId) {
      addDebugLog('Missing client or xmtpId', { hasClient: !!client, xmtpId });
      return;
    }

    // Prevent duplicate initialization
    if (streamStartedRef.current) {
      addDebugLog('Stream already started, skipping initialization');
      return;
    }

    const initConversation = async () => {
      setLoading(true);
      setError(null);
      addDebugLog('Starting conversation initialization', { xmtpId, username });
      
      try {
        addDebugLog('Syncing conversations...');
        await client.conversations.sync();
        
        addDebugLog('Fetching conversation list...');
        const conversations = await client.conversations.list();
        addDebugLog(`Found ${conversations.length} conversations`);
        
        // Look for existing DM conversation with the specified xmtpId
        let existingConversation = null;
        for (const conv of conversations) {
          try {
            // Only check peerInboxId for DM conversations
            if (conv instanceof Dm) {
              const peerInboxId = await conv.peerInboxId();
              addDebugLog(`Checking DM conversation with peer: ${peerInboxId}`);
              if (peerInboxId?.toLowerCase() === xmtpId.toLowerCase()) {
                existingConversation = conv;
                addDebugLog('Found matching DM conversation');
                break;
              }
            } else {
              addDebugLog('Skipping Group conversation in DM search');
            }
          } catch (error) {
            addDebugLog('Error checking conversation', error);
            // Skip this conversation and continue
          }
        }

        if (!existingConversation) {
          addDebugLog('No existing DM found, creating new DM');
          try {
            existingConversation = await client.conversations.newDm(xmtpId);
            addDebugLog('New DM created successfully');
          } catch (dmError) {
            addDebugLog('Failed to create new DM', dmError);
            throw dmError;
          }
        } else {
          addDebugLog('Found existing DM conversation');
        }
        
        setConversation(existingConversation);
        
        // Load existing messages
        addDebugLog('Loading existing messages...');
        const existingMessages = await existingConversation.messages();
        addDebugLog(`Loaded ${existingMessages.length} existing messages`);
        setMessages(existingMessages);
        
        // Start streaming new messages
        addDebugLog('Starting message stream...');
        streamStartedRef.current = true;
        
        try {
          const stream = await existingConversation.stream();
          setStreamActive(true);
          addDebugLog('Message stream started successfully');
          
          const streamMessages = async () => {
            try {
              for await (const message of stream) {
                if (message) {
                  addDebugLog('Received new message via stream');
                  setMessages(prev => [...prev, message]);
                }
              }
            } catch (streamError) {
              addDebugLog('Error in message stream', streamError);
              setStreamActive(false);
              streamStartedRef.current = false;
            }
          };
          
          streamMessages();
        } catch (streamError) {
          addDebugLog('Failed to start message stream', streamError);
          // Continue without streaming - conversation still works for sending
        }
        
      } catch (error) {
        addDebugLog('Failed to initialize conversation', error);
        setError(`Failed to connect to chat: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setLoading(false);
      }
    };

    initConversation();

    // Cleanup function
    return () => {
      streamStartedRef.current = false;
      setStreamActive(false);
      addDebugLog('Cleaning up conversation');
    };
  }, [client, xmtpId, username]);

  const sendMessage = async () => {
    if (!conversation || !newMessage.trim()) return;
    
    addDebugLog('Sending message', { messageLength: newMessage.length });
    
    try {
      await conversation.send(newMessage);
      addDebugLog('Message sent successfully');
      setNewMessage('');
    } catch (error) {
      addDebugLog('Failed to send message', error);
      setError(`Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  if (!client) {
    return (
      <div className="text-center py-8">
        <MessageCircle className="mx-auto mb-3 text-gray-500" size={32} />
        <p className="text-sm text-gray-400">
          Connect your wallet to chat
        </p>
        <div className="mt-2 text-xs text-gray-600">
          Debug: No XMTP client available
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
        <span className="ml-2 text-sm text-gray-400">Connecting to chat...</span>
        {debugLog.length > 0 && (
          <div className="mt-4 text-xs text-gray-600 max-w-sm">
            <details>
              <summary className="cursor-pointer">Debug Log</summary>
              <div className="mt-2 bg-gray-900 rounded p-2 max-h-32 overflow-y-auto">
                {debugLog.map((log, i) => (
                  <div key={i} className="text-xs break-words">{log}</div>
                ))}
              </div>
            </details>
          </div>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <MessageCircle className="mx-auto mb-3 text-gray-500" size={32} />
        <p className="text-sm text-red-400 mb-3">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded text-sm"
        >
          Retry
        </button>
        {debugLog.length > 0 && (
          <div className="mt-4 text-xs text-gray-600 max-w-sm mx-auto">
            <details>
              <summary className="cursor-pointer">Debug Log</summary>
              <div className="mt-2 bg-gray-900 rounded p-2 max-h-32 overflow-y-auto text-left">
                {debugLog.map((log, i) => (
                  <div key={i} className="text-xs break-words">{log}</div>
                ))}
              </div>
            </details>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 mobile-scroll hide-scrollbar">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700 mobile-scroll hide-scrollbar">
        <div className="flex items-center gap-3">
          <img 
            src={profile.avatar} 
            alt={profile.name} 
            className="w-8 h-8 rounded-full"
          />
          <div>
            <h3 className="text-white font-medium text-sm">{profile.name}</h3>
            <p className="text-gray-400 text-xs">@{profile.username}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${streamActive ? 'bg-green-500' : 'bg-gray-500'}`}></div>
          <span className="text-xs text-gray-400">
            {streamActive ? 'Live' : 'Offline'}
          </span>
          <a 
            href={url} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="text-gray-400 hover:text-white ml-2"
          >
            <ExternalLink size={14} />
          </a>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border-b border-red-500/20 mobile-scroll hide-scrollbar">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Messages */}
      <div className="h-64 overflow-y-auto p-4 space-y-3 mobile-scroll hide-scrollbar">
        {messages.length === 0 ? (
          <div className="text-center text-gray-400 text-sm">
            <MessageCircle className="mx-auto mb-2" size={24} />
            <p>No messages yet. Send a message to start the conversation!</p>
          </div>
        ) : (
          <div className="space-y-2 mobile-scroll hide-scrollbar">
            {messages.map((message, index) => (
              <div key={index} className="flex flex-col mobile-scroll hide-scrollbar">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span>
                    {message.senderInboxId === client?.inboxId ? 'You' : profile.name}
                  </span>
                  <span>•</span>
                  <span>{message.sentAt ? message.sentAt.toLocaleTimeString() : 'Unknown time'}</span>
                </div>
                <div className={`p-2 rounded-lg max-w-xs break-words text-sm ${
                  message.senderInboxId === client?.inboxId
                    ? 'bg-blue-600 text-white ml-auto'
                    : 'bg-gray-700 text-gray-100'
                }`}>
                  {typeof message.content === 'string' 
                    ? message.content 
                    : typeof message.content === 'object' 
                      ? JSON.stringify(message.content) 
                      : String(message.content)
                  }
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Message Input */}
      <div className="p-4 border-t border-gray-700 mobile-scroll hide-scrollbar">
        <div className="flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={`Message ${profile.name}...`}
            className="flex-1 bg-gray-700 text-white rounded-lg px-3 py-2 text-sm border border-gray-600 focus:border-blue-500 focus:outline-none"
            onKeyPress={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
          />
          <button
            onClick={sendMessage}
            disabled={!newMessage.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg px-3 py-2 text-sm flex items-center gap-1"
          >
            <Send size={14} />
          </button>
        </div>
      </div>

      {/* Debug Panel (visible in development) */}
      {process.env.NODE_ENV === 'development' && debugLog.length > 0 && (
        <details className="p-4 border-t border-gray-700 mobile-scroll hide-scrollbar">
          <summary className="text-xs text-gray-500 cursor-pointer">Debug Information</summary>
          <div className="mt-2 bg-gray-900 rounded p-2 max-h-32 overflow-y-auto text-xs mobile-scroll hide-scrollbar">
            {debugLog.map((log, i) => (
              <div key={i} className="text-gray-400 font-mono break-words">{log}</div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
} 