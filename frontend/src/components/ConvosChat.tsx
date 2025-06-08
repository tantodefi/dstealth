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
    <div className="space-y-3">
      {/* Connection Status */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <img 
            src={profile.avatar} 
            alt={profile.name || username}
            className="w-6 h-6 rounded-full border border-gray-600"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.src = `https://api.dicebear.com/7.x/identicon/svg?seed=${username}`;
            }}
          />
          <div className={`w-2 h-2 rounded-full ${streamActive ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
          <span className={streamActive ? 'text-green-400' : 'text-yellow-400'}>
            {streamActive ? 'Connected to' : 'Connecting to'} {profile.name || username}
          </span>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:text-blue-300 flex items-center gap-1"
        >
          <ExternalLink size={12} />
          Open
        </a>
      </div>

      {/* Debug Info */}
      {debugLog.length > 0 && (
        <div className="text-xs text-gray-600">
          <details>
            <summary className="cursor-pointer">Debug Info</summary>
            <div className="mt-2 bg-gray-900 rounded p-2 max-h-24 overflow-y-auto">
              {debugLog.slice(-3).map((log, i) => (
                <div key={i} className="text-xs break-words">{log}</div>
              ))}
            </div>
          </details>
        </div>
      )}

      {/* Messages */}
      <div className="bg-gray-800 rounded p-3 h-40 overflow-y-auto space-y-2">
        {messages.map((message, index) => {
          const isFromUser = message.senderInboxId === client.inboxId;
          const sentTime = message.sentAtNs 
            ? new Date(Number(message.sentAtNs) / 1000000)
            : new Date();

          // Handle message content
          let messageContent = '';
          let isSystemMessage = false;
          
          if (typeof message.content === 'string') {
            messageContent = message.content;
          } else {
            // Try to detect system messages (conversation initialization, etc.)
            const contentObj = message.content;
            if (contentObj && typeof contentObj === 'object') {
              // Check if it's a conversation system message
              if (contentObj.initiatedByInboxId || contentObj.addedInboxes || contentObj.removedInboxes) {
                isSystemMessage = true;
                if (contentObj.addedInboxes && contentObj.addedInboxes.length > 0) {
                  messageContent = `${profile.name || username} was added to the conversation`;
                } else if (contentObj.removedInboxes && contentObj.removedInboxes.length > 0) {
                  messageContent = 'Someone left the conversation';
                } else {
                  messageContent = 'Conversation started';
                }
              } else {
                // Other JSON content - format it nicely
                messageContent = JSON.stringify(contentObj, null, 2);
              }
            } else {
              messageContent = String(message.content);
            }
          }

          return (
            <div
              key={index}
              className={`text-xs ${isFromUser ? 'text-right' : 'text-left'}`}
            >
              <div
                className={`inline-block p-2 rounded max-w-[85%] break-words ${
                  isSystemMessage
                    ? 'bg-gray-700 text-gray-300 italic text-center mx-auto'
                    : isFromUser
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-600 text-gray-200'
                }`}
                style={{ 
                  wordBreak: 'break-word',
                  overflowWrap: 'break-word',
                  whiteSpace: 'pre-wrap'
                }}
              >
                {messageContent}
                {!isSystemMessage && (
                  <div className="text-gray-400 text-xs mt-1 opacity-75">
                    {sentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Message Input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Type a message..."
          className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-1 text-sm text-white"
        />
        <button
          onClick={sendMessage}
          disabled={!conversation || !newMessage.trim()}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1 rounded text-sm"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
} 