"use client";

import { useState, useEffect } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { Copy, Check, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";

interface StealthPayment {
  timestamp: number;
  amount: string;
  token: string;
  recipientAddress: string;
  txHash: string;
  txUrl: string;
  zkProofUrl: string;
  fkeyId: string;
  proof?: {
    claimData: {
      provider: string;
      parameters: string;
      owner: string;
      timestampS: number;
      context: string;
      identifier: string;
      epoch: number;
    };
    identifier: string;
    signatures: string[];
    witnesses: {
      id: string;
      url: string;
    }[];
  };
}

function CopyButton({ text, className = "" }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`text-gray-400 hover:text-blue-400 transition-colors ${className}`}
      title="Copy to clipboard"
    >
      {copied ? (
        <Check className="h-4 w-4 text-green-400" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </button>
  );
}

export default function ZkReceipts() {
  const [expandedProofs, setExpandedProofs] = useState<{[key: string]: boolean}>({});
  const [stealthPayments, setStealthPayments] = useLocalStorage<StealthPayment[]>("stealth-payments", []);

  useEffect(() => {
    // Add example proof if no payments exist
    if (stealthPayments.length === 0) {
      const examplePayment: StealthPayment = {
        timestamp: Date.now(),
        amount: "0.1",
        token: "ETH",
        recipientAddress: "0x472d9ec8da4cb9843627e3d7e23ac0b3b6ebf145",
        txHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        txUrl: "https://basescan.org/tx/0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
        zkProofUrl: "https://zkfetch.com/proof",
        fkeyId: "tantodefi.fkey.id",
        proof: {
          claimData: {
            provider: "http",
            parameters: "{\"body\":\"\",\"method\":\"GET\",\"responseMatches\":[{\"type\":\"regex\",\"value\":\"0x[a-fA-F0-9]{40}\"}],\"responseRedactions\":[],\"url\":\"https://tantodefi.fkey.id\"}",
            owner: "0x472d9ec8da4cb9843627e3d7e23ac0b3b6ebf145",
            timestampS: 1749274002,
            context: "{\"providerHash\":\"0x558482a29b398558c08fe72631f2768007fde113cd93720ff2f95544566f999e\"}",
            identifier: "0x5d3f4ad1d927415fa21060d57e531d6e7872f665d105e19f1da290dc2113a3fa",
            epoch: 1
          },
          identifier: "0x5d3f4ad1d927415fa21060d57e531d6e7872f665d105e19f1da290dc2113a3fa",
          signatures: [
            "0xa210a9480a7a9fbb8f91be46c2ce4d90cb9195a42b274361ecde76d73253ca36579a3f80b90d5022631797eb8ea6360897027c24e13242d001c395cab0dcd6821b"
          ],
          witnesses: [
            {
              id: "0x244897572368eadf65bfbc5aec98d8e5443a9072",
              url: "wss://attestor.reclaimprotocol.org:447/ws"
            }
          ]
        }
      };
      setStealthPayments([examplePayment]);
    }
  }, []);

  const toggleProof = (index: number) => {
    setExpandedProofs(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  if (stealthPayments.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white">ZK Receipts</h2>
        <div className="p-8 bg-gray-800 rounded-lg text-center">
          <p className="text-gray-400">No payment receipts yet</p>
          <p className="text-gray-500 text-sm mt-2">
            Completed stealth payments with ZK proofs will appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-white">ZK Receipts</h2>
      <div className="space-y-3">
        {stealthPayments.map((payment, index) => (
          <div key={index} className="bg-gray-800 rounded-lg overflow-hidden">
            {/* Payment Header */}
            <div className="p-4">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-white font-medium">{payment.fkeyId}</p>
                    <CopyButton text={payment.fkeyId} />
                  </div>
                  <p className="text-green-400 font-mono">
                    {payment.amount} {payment.token}
                  </p>
                  <p className="text-gray-400 text-sm">
                    {new Date(payment.timestamp).toLocaleString()}
                  </p>
                  
                  {/* Recipient Address */}
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-gray-500">To:</span>
                    <span className="text-xs text-gray-300 font-mono">
                      {payment.recipientAddress.slice(0, 6)}...{payment.recipientAddress.slice(-4)}
                    </span>
                    <CopyButton text={payment.recipientAddress} />
                  </div>
                </div>

                <div className="flex flex-col gap-2 ml-4">
                  <a
                    href={payment.txUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-blue-400 hover:text-blue-300 text-sm"
                  >
                    Transaction <ExternalLink className="h-3 w-3" />
                  </a>
                  <button
                    onClick={() => toggleProof(index)}
                    className="flex items-center gap-1 text-purple-400 hover:text-purple-300 text-sm"
                  >
                    ZK Proof {expandedProofs[index] ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Collapsible Proof Section */}
            {expandedProofs[index] && payment.proof && (
              <div className="border-t border-gray-700 bg-gray-900 p-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Provider</span>
                    <span className="text-white">{payment.proof.claimData.provider}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Owner</span>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-mono">
                        {payment.proof.claimData.owner.slice(0, 6)}...{payment.proof.claimData.owner.slice(-4)}
                      </span>
                      <CopyButton text={payment.proof.claimData.owner} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Timestamp</span>
                    <span className="text-white">
                      {new Date(payment.proof.claimData.timestampS * 1000).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Identifier</span>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-mono text-xs">
                        {payment.proof.identifier.slice(0, 6)}...{payment.proof.identifier.slice(-4)}
                      </span>
                      <CopyButton text={payment.proof.identifier} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Witnesses</span>
                    <span className="text-white">{payment.proof.witnesses.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Signatures</span>
                    <span className="text-white">{payment.proof.signatures.length}</span>
                  </div>

                  {/* Full Proof Data */}
                  <div className="mt-4 pt-4 border-t border-gray-700">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-400">Full Proof Data</span>
                      <CopyButton text={JSON.stringify(payment.proof, null, 2)} />
                    </div>
                    <pre className="bg-black rounded p-3 overflow-x-auto text-xs">
                      <code className="text-gray-300">
                        {JSON.stringify(payment.proof, null, 2)}
                      </code>
                    </pre>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
} 