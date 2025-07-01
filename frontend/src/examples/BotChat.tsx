"use client";

import React from "react";
import { type Conversation, type DecodedMessage } from "@xmtp/browser-sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { Button } from "@/components/Button";
import { useXMTP } from "@/context/xmtp-context";

// Backend dStealth Agent address - will be fetched dynamically
const AGENT_ADDRESS = "";

export default function BotChat() {
  const { client } = useXMTP();
  const { address, isConnected } = useAccount();

  // State
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [botConversation, setBotConversation] = useState<Conversation<any> | null>(
    null,
  );
  const [messages, setMessages] = useState<DecodedMessage<any>[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [streamActive, setStreamActive] = useState(false);
  const [agentAddress, setAgentAddress] = useState<string | null>(null);
  const [agentInfo, setAgentInfo] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Use ref to track if stream is already started to prevent infinite loops
  const streamStartedRef = useRef(false);

  // Check if user has any connection (wallet or ephemeral)
  const hasConnection = isConnected || !!client;

  // Get effective address for display
  const effectiveAddress = address || (client ? 'ephemeral' : null);

  // Fetch agent information from backend
  const fetchAgentInfo = useCallback(async () => {
    if (!client) return;
    
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5001';
      console.log('Fetching agent info from:', `${backendUrl}/api/agent/info`);
      
      const response = await fetch(`${backendUrl}/api/agent/info`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.agent) {
        setAgentAddress(data.agent.address);
        setAgentInfo(data.agent);
        console.log('✅ dStealth agent info loaded:', data.agent);
      } else {
        console.warn('⚠️ Agent info request succeeded but no agent data received');
      }
    } catch (error) {
      console.error('❌ Error fetching agent info:', error);
    }
  }, [client]);

  // Initialize the conversation with the backend agent
  const initializeConversation = useCallback(async () => {
    if (!client || !agentAddress || isConnecting) return;

    setIsConnecting(true);
    
    try {
      console.log("🚀 Initializing conversation with dStealth agent:", agentAddress);
      
      // Create conversation with the agent using address
      const conversation = await client.conversations.newDm(agentAddress);
      
      // Sync to get any existing messages
      await conversation.sync();
      const existingMessages = await conversation.messages();
      
      console.log("✅ dStealth agent conversation initialized");
      console.log("📬 Existing messages:", existingMessages.length);
      
      setBotConversation(conversation);
      setMessages(existingMessages);
      
      setIsConnecting(false);
    } catch (error) {
      console.error("❌ Error initializing dStealth agent conversation:", error);
      setIsConnecting(false);
    }
  }, [client, agentAddress, isConnecting]);

  // Start a stream to listen for new messages
  const startMessageStream = useCallback(async () => {
    // Prevent double initialization and infinite loops
    if (!client || !botConversation || streamActive || streamStartedRef.current)
      return;

    try {
      console.log("Starting message stream for dStealth agent conversation");
      // Set flag before state to prevent race conditions
      streamStartedRef.current = true;
      setStreamActive(true);

      const streamPromise = botConversation.stream();
      const stream = await streamPromise;

      // Handle the stream with for await...of loop
      const streamMessages = async () => {
        try {
          for await (const message of stream) {
            console.log("Received message from dStealth agent:", message);
            // Ensure we don't add undefined to the messages array
            if (message) {
              setMessages((prevMessages) => [...prevMessages, message]);
            }
          }
        } catch (error) {
          console.error("Error in message stream:", error);
          setStreamActive(false);
          streamStartedRef.current = false;
        }
      };

      // Start listening for messages
      streamMessages();

      // Return a cleanup function
      return () => {
        if (stream && typeof stream.return === "function") {
          stream.return(undefined);
        }
        setStreamActive(false);
        streamStartedRef.current = false;
      };
    } catch (error) {
      console.error("Error starting message stream:", error);
      setStreamActive(false);
      streamStartedRef.current = false;
      return undefined;
    }
  }, [client, botConversation]);

  // Fetch agent info on component mount
  useEffect(() => {
    fetchAgentInfo();
  }, [fetchAgentInfo]);

  // Initialize conversation when client and agent address are available
  useEffect(() => {
    if (agentAddress && client && !botConversation && !isConnecting) {
      initializeConversation();
    }
  }, [agentAddress, client, botConversation, isConnecting, initializeConversation]);

  // Start stream when conversation is available
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    // Only start the stream if we have a conversation and the stream isn't already active
    if (
      client &&
      botConversation &&
      !streamStartedRef.current
    ) {
      startMessageStream().then((cleanupFn) => {
        cleanup = cleanupFn;
      });
    }

    // Clean up when component unmounts or dependencies change
    return () => {
      if (cleanup) {
        cleanup();
      }
    };
  }, [client, botConversation, startMessageStream]);

  // Send message to the dStealth agent
  const handleSendMessage = async () => {
    if (!client || !botConversation || !message.trim()) return;

    setSending(true);

    try {
      // Send the message to the dStealth agent
      await botConversation.send(message);

      // Clear input
      setMessage("");
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="w-full flex flex-col gap-3">
      <div className="w-full bg-gray-900 p-3 rounded-md">
        <div className="flex justify-between items-center">
          <h2 className="text-white text-sm font-medium">dStealth Agent Chat</h2>
          <div className="flex items-center">
            <div
              className={`h-2 w-2 rounded-full mr-2 ${streamActive ? "bg-green-500" : "bg-red-500"}`}
            />
            <span className="text-xs text-gray-400">
              {streamActive ? "Stream active" : "Stream inactive"}
            </span>
          </div>
        </div>

        {/* Agent Info Display */}
        {agentInfo && (
          <div className="mt-2 p-2 bg-gray-800 rounded text-xs">
            <div className="text-green-400 font-medium">🥷 Agent Status: {agentInfo.status}</div>
            <div className="text-gray-300">📬 Address: {agentAddress?.slice(0, 6)}...{agentAddress?.slice(-4)}</div>
            <div className="text-gray-300">✨ Features: {agentInfo.features?.slice(0, 2).join(', ')}</div>
          </div>
        )}

        {!hasConnection ? (
          <p className="text-red-500 text-xs mt-2">
            Connect your wallet to chat with the dStealth agent
          </p>
        ) : !client ? (
          <p className="text-yellow-500 text-xs mt-2">
            Initializing XMTP client...
          </p>
        ) : !agentAddress ? (
          <p className="text-yellow-500 text-xs mt-2">
            Loading agent information...
          </p>
        ) : error ? (
          <div className="mt-2 p-2 bg-red-900/30 border border-red-700 rounded text-xs">
            <p className="text-red-400 font-medium">Connection Error</p>
            <p className="text-red-300">{error}</p>
            <button
              onClick={() => {
                setError(null);
                fetchAgentInfo();
              }}
              className="mt-2 px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs"
            >
              Retry
            </button>
          </div>
        ) : isConnecting ? (
          <p className="text-yellow-500 text-xs mt-2">Connecting to dStealth agent...</p>
        ) : !botConversation ? (
          <div className="mt-2">
            <Button
              size="sm"
              variant="default"
              onClick={initializeConversation}
              disabled={isConnecting}
              className="w-full">
              Connect to dStealth Agent
            </Button>
          </div>
        ) : (
          <>
            {/* Message history */}
            <div className="mt-2 border border-gray-800 rounded-md p-2 max-h-40 overflow-y-auto">
              {messages.length > 0 ? (
                messages.map((msg, index) => {
                  // Get sender address safely
                  const senderAddress = agentAddress;

                  // Get client address
                  const clientAddress = client.inboxId;

                  // Get message sent time safely
                  const sentTime = msg.sentAtNs
                    ? new Date(Number(msg.sentAtNs) / 1000000)
                    : new Date();

                  return (
                    <div
                      key={index}
                      className={`mb-2 text-xs ${
                        senderAddress === clientAddress
                          ? "text-right"
                          : "text-left"
                      }`}>
                      <div
                        className={`inline-block px-2 py-1 rounded-md ${
                          senderAddress === clientAddress
                            ? "bg-blue-900 text-white"
                            : "bg-gray-800 text-gray-200"
                        }`}>
                        <p>{String(msg.content)}</p>
                        <p className="text-[10px] mt-1 opacity-60">
                          {sentTime.toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-gray-500 text-xs">
                  No messages yet. Try &quot;/help&quot; to see what the dStealth agent can do!
                </p>
              )}
            </div>

            {/* Message input */}
            <div className="mt-2 flex">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Ask the dStealth agent anything..."
                className="flex-1 bg-gray-800 text-white text-sm rounded-l-md px-3 py-2 outline-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !sending) {
                    handleSendMessage();
                  }
                }}
              />
              <Button
                size="sm"
                variant="default"
                onClick={handleSendMessage}
                disabled={sending || !message.trim()}
                className="rounded-l-none">
                {sending ? "Sending..." : "Send"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
