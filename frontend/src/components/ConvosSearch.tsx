"use client";

import React, { useState } from "react";
import { useXMTP } from "@/context/xmtp-context";
import { SpinnerIcon } from "./icons/SpinnerIcon";
import { CheckIcon } from "./icons/CheckIcon";
import ConvosChat from "./ConvosChat";
import { XIcon } from "./icons/XIcon";

interface ConvosProfile {
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

export function ConvosSearch() {
  const { client } = useXMTP();
  
  // Search and UI state
  const [username, setUsername] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [convosData, setConvosData] = useState<ConvosProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zkProofError, setZkProofError] = useState<{service: string; error: string; details?: any; attestorError?: any} | null>(null);
  const [searchSuccess, setSearchSuccess] = useState(false);

  const handleSearch = async () => {
    if (!username) return;

    setIsSending(true);
    setError("");
    setZkProofError(null);
    setConvosData(null);
    setSearchSuccess(false);
    
    try {
      // Fetch convos data from backend
      const convosResponse = await fetch(`/api/convos/lookup/${username}`);

      if (convosResponse.ok) {
        const convosData = await convosResponse.json();
        if (convosData.success && convosData.xmtpId) {
          setConvosData(convosData);
          setSearchSuccess(true);
        } else {
          setError("User not found on convos.org");
        }
      } else {
        // Handle ZK proof failure errors
        try {
          const errorData = await convosResponse.json();
          if (errorData.zkProofRequired) {
            console.log('❌ ZK proof generation failed for convos:', errorData);
            setZkProofError({
              service: 'convos.org',
              error: errorData.error,
              details: errorData.details,
              attestorError: errorData.attestorError
            });
          } else {
            setError("User not found on convos.org");
          }
        } catch (parseError) {
          setError("User not found on convos.org");
        }
      }

    } catch (error) {
      setError("Search failed");
    } finally {
      setIsSending(false);
    }
  };

  const startConversation = async () => {
    if (!client) {
      setError("Please connect your wallet first");
      return;
    }
    
    if (!convosData?.profile?.address) {
      setError("No valid address found");
      return;
    }

    setIsSending(true);
    try {
      const newConversation = await client.conversations.newDmWithIdentifier({
        identifier: convosData.profile.address,
        identifierKind: "Ethereum" as const,
      });

      await newConversation.send(`Hey ${username}! 👋`);
      setError("");
      setConvosData(null);
      setUsername("");
    } catch (error) {
      console.error("Error starting conversation:", error);
      setError("Failed to start conversation");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search Form */}
      <div className="flex gap-4">
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Enter convos username"
          className="flex-1 bg-gray-800 border border-gray-700 text-white rounded-lg p-2.5"
          onKeyPress={(e) => {
            if (e.key === "Enter" && !isSending) {
              handleSearch();
            }
          }}
        />
        <button
          onClick={handleSearch}
          disabled={!username || isSending}
          className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
        >
          {isSending ? "Searching..." : "Search convos"}
        </button>
      </div>

      {/* Loading Status */}
      {isSending && (
        <div className="flex items-center gap-2 text-orange-400 bg-gray-800 p-3 rounded-lg">
          <SpinnerIcon className="animate-spin h-5 w-5" />
          <span>Searching convos.org...</span>
        </div>
      )}

      {/* ZK Proof Error */}
      {zkProofError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-3">
            <XIcon className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-red-400 font-medium mb-2">ZK Proof Generation Failed</h3>
              <p className="text-red-300 text-sm mb-2">
                Failed to generate cryptographic proof for <span className="font-mono">{zkProofError.service}</span>
              </p>
              <p className="text-red-300/80 text-xs mb-3">
                {zkProofError.details || "Unable to verify account authenticity through zero-knowledge proofs"}
              </p>
              {zkProofError.attestorError && (
                <div className="bg-red-500/5 border border-red-500/10 rounded p-2 mb-3">
                  <p className="text-red-300/70 text-xs">
                    <span className="font-medium">Attestor Service Issue:</span> This may be due to network connectivity problems or temporary service unavailability.
                  </p>
                </div>
              )}
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="bg-red-500/10 text-red-300 px-2 py-1 rounded">
                  🔒 Cryptographic verification required
                </span>
                <span className="bg-red-500/10 text-red-300 px-2 py-1 rounded">
                  ⚠️ Service temporarily unavailable
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success Status */}
      {searchSuccess && (
        <div className="flex items-center gap-2 text-green-400 bg-gray-800 p-3 rounded-lg">
          <CheckIcon className="h-5 w-5" />
          <span>User found on convos.org ✓</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
          {error}
        </div>
      )}

      {/* Render ConvosChat if we have convos data */}
      {convosData && (
        <>
          <div className="w-full max-w-md mx-auto px-4 mb-2">
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4 text-sm text-orange-200">
              <p>💬 Chat with {convosData.profile.name || convosData.username} below</p>
            </div>
          </div>
          <ConvosChat
            xmtpId={convosData.xmtpId}
            username={convosData.username}
            url={convosData.url}
            profile={convosData.profile}
          />
        </>
      )}
    </div>
  );
} 