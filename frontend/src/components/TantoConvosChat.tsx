"use client";

import { useState, useEffect } from "react";
import { useXMTP } from "@/context/xmtp-context";
import { Button } from "@/components/Button";
import { Conversation, DecodedMessage } from "@xmtp/browser-sdk";

// Hardcoded tantodefi data
const TANTO_DATA = {
  name: "Tantodefi",
  username: "tantodefi", 
  xmtpId: "6bccb45a686245626645d919829c74cfe47475be25febb64ad8fad364af22129",
  turnkeyAddress: "0xf8BEf1469D3EA3A2e4dfAdc6CbDE128160f8731c",
  avatar: "https://convos-attachments-prod.s3.fr-par.scw.cloud/fc0952e7-3e00-4ba0-a1ef-3cc5e32cbd7b.jpeg"
};

export default function TantoConvosChat() {
  const { client } = useXMTP();
  const [conversation, setConversation] = useState<Conversation<any> | null>(null);
  const [messages, setMessages] = useState<DecodedMessage<any>[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Try to initialize conversation with tantodefi
  const initializeConversation = async () => {
    if (!client) return;
    
    setIsConnecting(true);
    try {
      // Create new conversation using the turnkey address
      const newConversation = await client.conversations.newDmWithIdentifier({
        identifier: TANTO_DATA.turnkeyAddress,
        identifierKind: "Ethereum",
      });
      
      setConversation(newConversation);
      
      // Load existing messages if any
      await newConversation.sync();
      const existingMessages = await newConversation.messages();
      setMessages(existingMessages);
      
    } catch (error) {
      console.error("Error connecting to tantodefi:", error);
    } finally {
      setIsConnecting(false);
    }
  };

  // Send message
  const sendMessage = async () => {
    if (!conversation || !newMessage.trim() || isSending) return;
    
    setIsSending(true);
    try {
      await conversation.send(newMessage);
      setNewMessage("");
      
      // Refresh messages
      const updatedMessages = await conversation.messages();
      setMessages(updatedMessages);
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <img 
          src={TANTO_DATA.avatar} 
          alt={TANTO_DATA.name}
          className="w-6 h-6 rounded-full"
        />
        <h2 className="text-xl font-bold text-white">Chat with Dev</h2>
        <div className="text-xs bg-purple-900/30 text-purple-300 px-2 py-1 rounded">
          {TANTO_DATA.username}.convos.org
        </div>
      </div>

      {!client ? (
        <div className="p-4 bg-gray-800 rounded-lg text-center">
          <p className="text-gray-400">Connect your wallet to chat with the dev</p>
        </div>
      ) : !conversation ? (
        <div className="p-4 bg-gray-800 rounded-lg text-center">
          <p className="text-gray-400 mb-3">Connect to chat with the developer</p>
          <Button
            onClick={initializeConversation}
            disabled={isConnecting}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            {isConnecting ? "Connecting..." : "Start Chat"}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Messages */}
          <div className="bg-gray-800 rounded-lg p-4 max-h-60 overflow-y-auto">
            {messages.length === 0 ? (
              <div className="text-center text-gray-400 py-8">
                <p className="text-lg">👋</p>
                <p>Say hi to the dev!</p>
                <p className="text-sm text-gray-500 mt-1">
                  Start a conversation about the app, report bugs, or suggest features
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((msg, index) => {
                  const isFromUser = msg.senderInboxId === client.inboxId;
                  const sentTime = msg.sentAtNs
                    ? new Date(Number(msg.sentAtNs) / 1000000)
                    : new Date();

                  return (
                    <div
                      key={index}
                      className={`flex ${isFromUser ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-xs px-3 py-2 rounded-lg text-sm ${
                          isFromUser
                            ? "bg-purple-600 text-white"
                            : "bg-gray-700 text-gray-200"
                        }`}
                      >
                        <p>{typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}</p>
                        <p className="text-xs opacity-60 mt-1">
                          {sentTime.toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  );
                })
              }
              </div>
            )}
          </div>

          {/* Message input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 bg-gray-700 border border-gray-600 text-white rounded-lg p-2.5 text-sm"
              onKeyPress={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              disabled={isSending}
            />
            <Button
              onClick={sendMessage}
              disabled={!newMessage.trim() || isSending}
              className="bg-purple-600 hover:bg-purple-700 px-4"
            >
              {isSending ? "..." : "Send"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
} 