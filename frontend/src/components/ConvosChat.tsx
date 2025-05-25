"use client";

import { Client, Conversation, DecodedMessage } from "@xmtp/browser-sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { useXMTP } from "@/context/xmtp-context";
import { CheckCircle2 } from "lucide-react";

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

  // State
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<DecodedMessage[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [streamActive, setStreamActive] = useState(false);

  // Use ref to track if stream is already started to prevent infinite loops
  const streamStartedRef = useRef(false);

  // Listen for invite message event
  useEffect(() => {
    console.log("Setting up invite message listener");
    
    const handleInviteMessage = (event: Event) => {
      const customEvent = event as CustomEvent<{ message: string }>;
      console.log("Received invite message event:", customEvent.detail.message);
      setMessage(customEvent.detail.message);
    };

    // Add event listener
    window.addEventListener('setInviteMessage', handleInviteMessage);

    // Cleanup
    return () => {
      console.log("Removing invite message listener");
      window.removeEventListener('setInviteMessage', handleInviteMessage);
    };
  }, []);

  // Initialize the conversation
  const initializeConversation = useCallback(async () => {
    if (!client) return;
    let newConversation: Conversation | null = null;
    setIsConnecting(true);
    try {
      newConversation = await client.conversations.newDmWithIdentifier({
        identifier: profile.address,
        identifierKind: "Ethereum",
      });
      setConversation(newConversation);
    } catch (error) {
      console.error("Error initializing convos conversation:", error);
    } finally {
      setIsConnecting(false);
    }
  }, [client, profile.address]);

  // Start a stream to listen for new messages
  const startMessageStream = useCallback(async () => {
    if (!client || !conversation || streamActive || streamStartedRef.current)
      return;

    try {
      console.log("Starting message stream for convos conversation");
      streamStartedRef.current = true;
      setStreamActive(true);

      const streamPromise = conversation.stream();
      const stream = await streamPromise;

      const streamMessages = async () => {
        try {
          for await (const message of stream) {
            console.log("Received message:", message);
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

      streamMessages();

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
  }, [client, conversation, streamActive]);

  // Initialize conversation when client is available
  useEffect(() => {
    if (client && !conversation && !isConnecting) {
      initializeConversation();
    }
  }, [client, conversation, isConnecting, initializeConversation]);

  // Start stream when conversation is available
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    if (
      client &&
      conversation &&
      !streamActive &&
      !streamStartedRef.current
    ) {
      startMessageStream().then((cleanupFn) => {
        cleanup = cleanupFn;
      });
    }

    return () => {
      if (cleanup) {
        cleanup();
      }
    };
  }, [client, conversation, streamActive, startMessageStream]);

  // Send message
  const handleSendMessage = async () => {
    if (!client || !conversation || !message.trim()) return;

    setSending(true);

    try {
      await conversation.send(message);
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
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              {profile.avatar && (
                <img 
                  src={profile.avatar} 
                  alt={profile.name || username}
                  className="w-6 h-6 rounded-full"
                />
              )}
              <div>
                <h2 className="text-white text-sm font-medium flex items-center gap-1">
                  {profile.name || username}
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                </h2>
                <a 
                  href={url} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-xs text-gray-400 hover:text-gray-300"
                >
                  {username}.convos.org
                </a>
              </div>
            </div>
          </div>
          <div className="flex items-center">
            <div
              className={`h-2 w-2 rounded-full mr-2 ${streamActive ? "bg-green-500" : "bg-red-500"}`}
            />
            <span className="text-xs text-gray-400">
              {streamActive ? "Stream active" : "Stream inactive"}
            </span>
          </div>
        </div>

        {!client ? (
          <p className="text-gray-400 text-xs mt-2">
            Connect your wallet to chat
          </p>
        ) : isConnecting ? (
          <p className="text-yellow-500 text-xs mt-2">Connecting...</p>
        ) : !conversation ? (
          <div className="mt-2">
            <Button
              size="sm"
              variant="default"
              onClick={initializeConversation}
              disabled={isConnecting}
              className="w-full">
              Connect to {profile.name || username}
            </Button>
          </div>
        ) : (
          <>
            {/* Message history */}
            <div className="mt-2 border border-gray-800 rounded-md p-2 max-h-40 overflow-y-auto">
              {messages.length > 0 ? (
                messages.map((msg, index) => {
                  const senderAddress = xmtpId;
                  const clientAddress = client.inboxId;
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
                  No messages yet. Send a message to get started!
                </p>
              )}
            </div>

            {/* Message input */}
            <div className="mt-2 flex">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={`Message ${profile.name || username}...`}
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