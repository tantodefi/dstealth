"use client";

import { useState, useEffect } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { Copy, Check, ExternalLink } from "lucide-react";

interface StealthPayment {
  timestamp: number;
  amount: string;
  token: string;
  recipientAddress: string;
  txHash: string;
  txUrl: string;
  zkProofUrl: string;
  fkeyId: string;
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
  const [stealthPayments] = useLocalStorage<StealthPayment[]>("stealth-payments", []);

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
          <div key={index} className="p-4 bg-gray-800 rounded-lg">
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
                <a
                  href={payment.zkProofUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-purple-400 hover:text-purple-300 text-sm"
                >
                  ZK Proof <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
} 