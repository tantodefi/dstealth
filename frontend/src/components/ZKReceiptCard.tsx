import { useState } from 'react';
import { Button } from '@/components/Button';
import { Eye, EyeOff, ExternalLink, Copy, CheckCircle } from 'lucide-react';

export interface ZKReceipt {
  id: string;
  timestamp: string;
  transactionHash: string;
  farcasterFid?: string;
  convosId?: string;
  proofType: 'farcaster' | 'convos' | 'other';
  status: 'verified' | 'pending' | 'failed';
  metadata: {
    title: string;
    description: string;
    amount?: string;
    currency?: string;
  };
}

interface ZKReceiptCardProps {
  receipt: ZKReceipt;
  onVerify?: () => Promise<void>;
}

export default function ZKReceiptCard({ receipt, onVerify }: ZKReceiptCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const handleVerify = async () => {
    if (!onVerify) return;
    
    try {
      setVerifying(true);
      await onVerify();
    } catch (error) {
      console.error('Error verifying receipt:', error);
    } finally {
      setVerifying(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const getStatusColor = (status: ZKReceipt['status']) => {
    switch (status) {
      case 'verified':
        return 'text-green-400';
      case 'pending':
        return 'text-yellow-400';
      case 'failed':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  const getProofTypeLabel = (type: ZKReceipt['proofType']) => {
    switch (type) {
      case 'farcaster':
        return 'Farcaster Identity';
      case 'convos':
        return 'Convos Membership';
      default:
        return 'Other Proof';
    }
  };

  return (
    <div className="bg-gray-900/50 border border-gray-700 rounded-lg overflow-hidden hover:border-gray-600 transition-colors">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-white font-semibold mb-1">{receipt.metadata.title}</h3>
            <p className="text-sm text-gray-400">{receipt.metadata.description}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs ${getStatusColor(receipt.status)} flex items-center gap-1`}>
              {receipt.status === 'verified' && <CheckCircle className="h-3 w-3" />}
              {receipt.status.charAt(0).toUpperCase() + receipt.status.slice(1)}
            </span>
            <Button
              onClick={() => setShowDetails(!showDetails)}
              className="bg-gray-800 hover:bg-gray-700 text-white"
            >
              {showDetails ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Details */}
      {showDetails && (
        <div className="p-4 space-y-4 bg-gray-800/50">
          {/* Transaction Info */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Transaction</span>
              <div className="flex items-center gap-2">
                <code className="text-purple-400 font-mono text-xs">
                  {receipt.transactionHash.slice(0, 6)}...{receipt.transactionHash.slice(-4)}
                </code>
                <button
                  onClick={() => copyToClipboard(receipt.transactionHash)}
                  className="text-gray-400 hover:text-white"
                >
                  <Copy className="h-3 w-3" />
                </button>
                <a
                  href={`https://sepolia.basescan.org/tx/${receipt.transactionHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-white"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Timestamp</span>
              <span className="text-white">{new Date(receipt.timestamp).toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Proof Type</span>
              <span className="text-white">{getProofTypeLabel(receipt.proofType)}</span>
            </div>
            {receipt.metadata.amount && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Amount</span>
                <span className="text-green-400">
                  {receipt.metadata.amount} {receipt.metadata.currency}
                </span>
              </div>
            )}
          </div>

          {/* Identity Info */}
          {(receipt.farcasterFid || receipt.convosId) && (
            <div className="pt-4 border-t border-gray-700 space-y-2">
              {receipt.farcasterFid && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Farcaster FID</span>
                  <a
                    href={`https://warpcast.com/${receipt.farcasterFid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-400 hover:text-purple-300 flex items-center gap-1"
                  >
                    {receipt.farcasterFid}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
              {receipt.convosId && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Convos ID</span>
                  <a
                    href={`https://convos.xyz/u/${receipt.convosId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 flex items-center gap-1"
                  >
                    {receipt.convosId}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          {receipt.status !== 'verified' && onVerify && (
            <div className="pt-4 border-t border-gray-700">
              <Button
                onClick={handleVerify}
                disabled={verifying}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white flex items-center justify-center gap-2"
              >
                {verifying ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    Verifying...
                  </>
                ) : (
                  'Verify Proof'
                )}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Example usage with dummy data:
export function DummyZKReceipt() {
  const dummyReceipt: ZKReceipt = {
    id: '1',
    timestamp: new Date().toISOString(),
    transactionHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    farcasterFid: 'vitalik.eth',
    convosId: 'vitalik',
    proofType: 'farcaster',
    status: 'verified',
    metadata: {
      title: 'Farcaster Identity Verification',
      description: 'Zero-knowledge proof of Farcaster account ownership',
      amount: '0.01',
      currency: 'ETH'
    }
  };

  return <ZKReceiptCard receipt={dummyReceipt} />;
} 