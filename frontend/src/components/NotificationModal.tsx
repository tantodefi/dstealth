"use client";

import { useEffect } from "react";
import { CheckIcon } from "@/components/icons/CheckIcon";
import { ExternalLink, X, AlertCircle } from 'lucide-react';

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'success' | 'error' | 'loading';
  title: string;
  message: string;
  transactionHash?: string;
  amount?: number;
}

export default function NotificationModal({
  isOpen,
  onClose,
  type,
  title,
  message,
  transactionHash,
  amount
}: NotificationModalProps) {
  // Auto-close success notifications after 5 seconds
  useEffect(() => {
    if (isOpen && type === 'success') {
      const timer = setTimeout(() => {
        onClose();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [isOpen, type, onClose]);

  if (!isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckIcon className="h-8 w-8 text-green-400" />;
      case 'error':
        return <AlertCircle className="h-8 w-8 text-red-400" />;
      case 'loading':
        return (
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
        );
    }
  };

  const getBackgroundColor = () => {
    switch (type) {
      case 'success':
        return 'from-green-900/20 to-emerald-900/20 border-green-600/30';
      case 'error':
        return 'from-red-900/20 to-red-900/20 border-red-600/30';
      case 'loading':
        return 'from-blue-900/20 to-blue-900/20 border-blue-600/30';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className={`bg-gradient-to-r ${getBackgroundColor()} border rounded-lg p-6 max-w-md w-full mx-4 relative`}>
        {/* Close button (only for non-loading states) */}
        {type !== 'loading' && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        )}

        {/* Content */}
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 mt-1">
            {getIcon()}
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-white mb-2">
              {title}
            </h3>
            
            <p className="text-gray-400 text-sm mb-4">
              {message}
            </p>

            {/* Amount display for success */}
            {type === 'success' && amount && (
              <div className="mb-4 p-3 bg-black/20 rounded-lg">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-400">
                    +{amount.toLocaleString()} 🥷
                  </div>
                  <div className="text-xs text-gray-400">
                    Tokens added to your wallet
                  </div>
                </div>
              </div>
            )}

            {/* Transaction hash link */}
            {transactionHash && (
              <div className="mb-4">
                <div className="text-xs text-gray-400 mb-1">Transaction Hash:</div>
                <a
                  href={`https://basescan.org/tx/${transactionHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-300 hover:text-blue-200 text-xs bg-blue-900/20 px-2 py-1 rounded break-all"
                >
                  <span className="truncate max-w-[200px]">{transactionHash}</span>
                  <ExternalLink className="h-3 w-3 flex-shrink-0" />
                </a>
              </div>
            )}

            {/* Loading state */}
            {type === 'loading' && (
              <div className="text-center">
                <div className="text-blue-400 text-sm">
                  Processing your claim...
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  This may take a few moments
                </div>
              </div>
            )}

            {/* Action buttons */}
            {type !== 'loading' && (
              <div className="flex justify-end gap-2 mt-4">
                {type === 'success' && transactionHash && (
                  <a
                    href={`https://basescan.org/tx/${transactionHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors flex items-center gap-1"
                  >
                    View on BaseScan
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                
                <button
                  onClick={onClose}
                  className={`px-3 py-2 text-sm rounded transition-colors ${
                    type === 'success' 
                      ? 'bg-green-600 hover:bg-green-700 text-white' 
                      : 'bg-gray-600 hover:bg-gray-700 text-white'
                  }`}
                >
                  {type === 'success' ? 'Awesome!' : 'Close'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 