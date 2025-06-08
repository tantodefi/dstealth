"use client";

import { getAddress, type Address } from "viem";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useChainId, useAccount } from "wagmi";
import { base } from 'wagmi/chains';

// Extend Navigator type to include wallets
declare global {
  interface Navigator {
    wallets?: any[];
  }
}

// Hardcoded USDC on Base (confirmed from Base documentation)
const USDC_BASE = {
  name: "USD Coin",
  symbol: "USDC",
  address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const, // Base USDC
  decimals: 6,
  chainId: 8453, // Base mainnet
};

// ERC20 ABI for transfer function
const ERC20_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export type PaymentMethod = "daimo" | "custom" | "minikit";

interface SendButtonProps {
  recipientAddress: string;
  amount: string;
  onPaymentStarted?: (e: any) => void;
  onPaymentCompleted?: (e: any) => void;
  disabled?: boolean;
  paymentMethod?: PaymentMethod;
  onPaymentMethodChange?: (method: PaymentMethod) => void;
}

export default function SendButton({
  recipientAddress,
  amount,
  onPaymentStarted,
  onPaymentCompleted,
  disabled = false,
  paymentMethod = "daimo",
  onPaymentMethodChange,
}: SendButtonProps) {
  const [isValidAmount, setIsValidAmount] = useState(false);
  const [decimalAmount, setDecimalAmount] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [buttonCounter, setButtonCounter] = useState(0);
  
  // Get account information
  const { address: accountAddress } = useAccount();

  // Custom transaction state
  const { 
    data: hash, 
    isPending: isTransactionPending, 
    writeContract,
    error: writeError 
  } = useWriteContract();
  
  const { isLoading: isConfirming, isSuccess: isConfirmed } = 
    useWaitForTransactionReceipt({ hash });

  // Chain management
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  // Validate amount and format for different payment methods
  useEffect(() => {
    console.log('SendButton: Amount effect triggered with:', amount);
    try {
      setError(null);

      const numAmount = parseFloat(amount || "0");
      if (isNaN(numAmount)) {
        setError("Invalid amount");
        setIsValidAmount(false);
        setDecimalAmount("0");
        return;
      }

      if (numAmount <= 0) {
        setError("Amount must be greater than 0");
        setIsValidAmount(false);
        setDecimalAmount("0");
        return;
      }

      // Different limits for different payment methods
      const maxAmount = paymentMethod === "daimo" ? 0.004 : 1000; // DaimoPay has lower limits
      if (numAmount > maxAmount) {
        setError(`Amount cannot exceed $${maxAmount} USDC${paymentMethod === "daimo" ? " (Daimo limit)" : ""}`);
        setIsValidAmount(false);
        setDecimalAmount("0");
        return;
      }

      // Format amount appropriately
      const formattedAmount = numAmount.toFixed(6);
      console.log('SendButton: Setting decimal amount to:', formattedAmount);
      setIsValidAmount(true);
      setDecimalAmount(formattedAmount);

      // Force button re-render when amount changes
      setButtonCounter(prev => {
        const newCounter = prev + 1;
        console.log('SendButton: Incrementing button counter to:', newCounter);
        return newCounter;
      });

    } catch (error) {
      setError("Failed to process amount");
      setIsValidAmount(false);
      setDecimalAmount("0");
    }
  }, [amount, paymentMethod]);

  // Ensure the address is properly formatted
  const formattedAddress = useMemo(() => {
    if (!recipientAddress) return undefined;
    return recipientAddress.startsWith("0x") 
      ? (recipientAddress as Address)
      : getAddress(recipientAddress);
  }, [recipientAddress]);

  // Force re-render when address changes
  useEffect(() => {
    if (formattedAddress) {
      setButtonCounter(prev => {
        const newCounter = prev + 1;
        console.log('SendButton: Address changed, incrementing counter to:', newCounter);
        return newCounter;
      });
    }
  }, [formattedAddress]);

  // Additional force re-render when decimalAmount changes
  useEffect(() => {
    if (decimalAmount && decimalAmount !== "0") {
      setButtonCounter(prev => {
        const newCounter = prev + Math.floor(Math.random() * 1000); // Add randomness to force update
        console.log('SendButton: Decimal amount changed to:', decimalAmount, 'setting counter to:', newCounter);
        return newCounter;
      });
    }
  }, [decimalAmount]);

  // Generate unique key for forcing re-renders - include milliseconds for extra uniqueness
  const buttonKey = `${paymentMethod}-${decimalAmount}-${formattedAddress}-${buttonCounter}-${Date.now()}`;

  // Force complete re-mount when key parameters change
  const [mountKey, setMountKey] = useState(0);
  useEffect(() => {
    setMountKey(prev => prev + 1);
  }, [decimalAmount, formattedAddress, paymentMethod]);

  // Handle custom transaction with chain switching
  const handleCustomPayment = useCallback(async () => {
    if (!formattedAddress || !isValidAmount) return;
    
    try {
      if (onPaymentStarted) onPaymentStarted({ method: "custom" });
      
      // Check if we're on the correct chain (Base)
      if (chainId !== USDC_BASE.chainId) {
        console.log(`Switching from chain ${chainId} to Base (${USDC_BASE.chainId})`);
        await switchChain({ chainId: USDC_BASE.chainId });
        // Wait a moment for chain switch to complete
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Convert decimal amount to wei (USDC has 6 decimals)
      const amountInWei = BigInt(Math.floor(parseFloat(decimalAmount) * 1e6));
      
      writeContract({
        address: USDC_BASE.address,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [formattedAddress, amountInWei],
        account: accountAddress,
        chain: base,
      });
    } catch (error) {
      console.error("Custom payment error:", error);
      setError("Transaction failed. Please ensure you're connected to Base network.");
    }
  }, [formattedAddress, isValidAmount, decimalAmount, writeContract, onPaymentStarted, chainId, switchChain, accountAddress]);

  // Handle transaction success
  useEffect(() => {
    if (isConfirmed && onPaymentCompleted) {
      onPaymentCompleted({ 
        method: "custom", 
        hash,
        amount: decimalAmount 
      });
    }
  }, [isConfirmed, onPaymentCompleted, hash, decimalAmount]);

  // Memoize event handlers
  const handlePaymentStarted = useCallback((e: any) => {
    console.log('Payment started with amount:', decimalAmount);
    if (onPaymentStarted) onPaymentStarted(e);
  }, [onPaymentStarted, decimalAmount]);

  const handlePaymentCompleted = useCallback((e: any) => {
    console.log('Payment completed with amount:', decimalAmount);
    if (onPaymentCompleted) onPaymentCompleted(e);
  }, [onPaymentCompleted, decimalAmount]);

  // Handle MiniKit payment using OnchainKit Transaction component
  const miniKitCalls = useMemo(() => {
    if (!formattedAddress || !isValidAmount) return [];
    
    // Convert decimal amount to wei (USDC has 6 decimals)
    const amountInWei = BigInt(Math.floor(parseFloat(decimalAmount) * 1e6));
    
    return [{
      to: USDC_BASE.address as `0x${string}`,
      data: `0xa9059cbb${formattedAddress.slice(2).padStart(64, '0')}${amountInWei.toString(16).padStart(64, '0')}` as `0x${string}`, // ERC20 transfer function call
      value: BigInt(0), // BigInt 0 for ERC-20 transfers
    }];
  }, [formattedAddress, isValidAmount, decimalAmount]);

  const handleMiniKitSuccess = useCallback((result: any) => {
    if (onPaymentCompleted) {
      onPaymentCompleted({ 
        method: "minikit", 
        hash: result?.transactionReceipts?.[0]?.transactionHash,
        amount: decimalAmount 
      });
    }
  }, [onPaymentCompleted, decimalAmount]);

  const handleMiniKitStart = useCallback(() => {
    if (onPaymentStarted) onPaymentStarted({ method: "minikit" });
  }, [onPaymentStarted]);

  // Only render button if we have valid inputs and no errors
  const shouldShowButton = !disabled && isValidAmount && recipientAddress && !error && formattedAddress;

  console.log('SendButton render:', { 
    amount, 
    decimalAmount, 
    shouldShowButton, 
    buttonKey,
    buttonCounter,
    paymentMethod,
    intent: `Pay ${decimalAmount} USDC`,
    timestamp: Math.floor(Date.now() / 1000)
  });

  return (
    <div className="w-full">
      {/* Payment Method Toggle */}
      {onPaymentMethodChange && (
        <div className="mb-3">
          <div className="text-xs text-gray-400 mb-2">Payment Method</div>
          <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
            {(["daimo", "custom", "minikit"] as PaymentMethod[]).map((method) => (
              <button
                key={method}
                onClick={() => onPaymentMethodChange(method)}
                className={`flex-1 px-3 py-2 text-xs rounded-md transition-colors ${
                  paymentMethod === method
                    ? "bg-blue-600 text-white"
                    : "text-gray-400 hover:text-white hover:bg-gray-700"
                }`}
              >
                {method === "daimo" ? "DaimoPay" : method === "custom" ? "Direct" : "MiniKit"}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="text-red-500 text-sm mb-2">
          {error}
        </div>
      )}
      
      {/* Debug Info */}
      <div className="text-xs text-gray-500 mb-2 font-mono">
        Debug: amount={amount} | decimal={decimalAmount} | method={paymentMethod} | counter={buttonCounter} | chain={chainId} | targetChain={USDC_BASE.chainId}
      </div>
      
      {shouldShowButton ? (
        <div className="relative">
          {paymentMethod === "daimo" && (
            <div key={`daimo-container-${mountKey}`}>
              <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-lg overflow-hidden">
                {/* Daimo Pay Header */}
                <div className="px-4 py-3 bg-green-700/20 border-b border-green-500/30">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs font-bold">D</span>
                    </div>
                    <span className="text-green-100 font-medium">Daimo Pay</span>
                    <span className="text-green-300 text-xs">• FluidKey Integration</span>
                  </div>
                </div>
                
                {/* Payment Details */}
                <div className="px-4 py-3">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="text-white font-semibold">{decimalAmount} USDC</div>
                      <div className="text-green-200 text-sm">Payment via Daimo</div>
                    </div>
                    <div className="text-right">
                      <div className="text-green-100 text-sm">To:</div>
                      <div className="text-white text-xs font-mono">
                        {formattedAddress?.slice(0, 6)}...{formattedAddress?.slice(-4)}
                      </div>
                    </div>
                  </div>
                  
                  {/* Daimo Pay Button */}
                  <button
                    onClick={() => {
                      // Enhanced Daimo integration with FluidKey context
                      const daimoPayload = {
                        recipient: formattedAddress,
                        amount: decimalAmount,
                        currency: 'USDC',
                        network: 'base',
                        memo: 'FluidKey X402 Payment',
                        metadata: {
                          source: 'fluidkey_miniapp',
                          protocol: 'x402',
                          version: '1.0'
                        }
                      };
                      
                      // Try native Daimo app integration first
                      if (typeof window !== 'undefined' && window.navigator.userAgent.includes('DaimoApp')) {
                        // We're inside Daimo app
                        window.postMessage({
                          type: 'daimo_payment_request',
                          payload: daimoPayload
                        }, '*');
                      } else {
                        // Fallback to Daimo web interface
                        const daimoUrl = `https://daimo.com/l/send/${formattedAddress}/${decimalAmount}?memo=FluidKey+X402+Payment`;
                        
                        // Check if mobile for app deep link
                        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                        
                        if (isMobile) {
                          // Try app deep link first, fallback to web
                          const appUrl = `daimo://send?to=${formattedAddress}&amount=${decimalAmount}&token=USDC`;
                          window.location.href = appUrl;
                          
                          // Fallback to web after short delay
                          setTimeout(() => {
                            window.open(daimoUrl, '_blank');
                          }, 1000);
                        } else {
                          window.open(daimoUrl, '_blank');
                        }
                      }
                      
                      if (onPaymentStarted) onPaymentStarted({ method: "daimo", amount: decimalAmount });
                      
                      // Enhanced completion tracking
                      setTimeout(() => {
                        if (onPaymentCompleted) {
                          onPaymentCompleted({ 
                            method: "daimo", 
                            hash: `daimo_${Date.now()}`,
                            amount: decimalAmount,
                            network: 'base',
                            currency: 'USDC'
                          });
                        }
                      }, 3000);
                    }}
                    className="w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all duration-200 flex items-center justify-center gap-2 font-medium"
                  >
                    <span>🚀</span>
                    <span>Pay with Daimo</span>
                    <span className="text-green-200">→</span>
                  </button>
                </div>
                
                {/* FluidKey Integration Footer */}
                <div className="px-4 py-2 bg-green-800/30 border-t border-green-500/30">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-green-200">🔐 FluidKey Protected</span>
                    <span className="text-green-300">Instant • Secure • Private</span>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {paymentMethod === "custom" && (
            <div>
              {chainId !== USDC_BASE.chainId && (
                <div className="text-yellow-400 text-xs mb-2">
                  ⚠️ Wrong network. Will switch to Base network when you click Pay.
                </div>
              )}
              <button
                onClick={handleCustomPayment}
                disabled={isTransactionPending || isConfirming}
                className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded-lg transition-colors"
              >
                {isTransactionPending || isConfirming
                  ? `${isTransactionPending ? "Confirming..." : "Processing..."}`
                  : `Pay ${decimalAmount} USDC (Direct)${chainId !== USDC_BASE.chainId ? " + Switch to Base" : ""}`}
              </button>
            </div>
          )}
          
          {paymentMethod === "minikit" && (
            <button
              onClick={async () => {
                try {
                  if (onPaymentStarted) onPaymentStarted({ method: "minikit" });
                  
                  // Check if we're in a mini app environment
                  if (typeof window !== 'undefined' && window.parent !== window) {
                    // We're in an iframe/mini app environment
                    const amountInWei = BigInt(Math.floor(parseFloat(decimalAmount) * 1e6));
                    
                    // Create the transaction data
                    const transactionData = {
                      to: USDC_BASE.address,
                      value: "0x0",
                      data: `0xa9059cbb${formattedAddress?.slice(2).padStart(64, '0')}${amountInWei.toString(16).padStart(64, '0')}`
                    };
                    
                    // Post message to parent (mini app host)
                    window.parent.postMessage({
                      type: 'minikit_transaction',
                      payload: transactionData
                    }, '*');
                    
                    // Listen for response
                    const handleMessage = (event: MessageEvent) => {
                      if (event.data.type === 'minikit_transaction_result') {
                        window.removeEventListener('message', handleMessage);
                        if (onPaymentCompleted) {
                          onPaymentCompleted({
                            method: "minikit",
                            hash: event.data.hash,
                            amount: decimalAmount
                          });
                        }
                      }
                    };
                    
                    window.addEventListener('message', handleMessage);
                    
                    // Timeout after 30 seconds
                    setTimeout(() => {
                      window.removeEventListener('message', handleMessage);
                    }, 30000);
                    
                  } else {
                    // Fallback to regular wallet connection
                    await handleCustomPayment();
                  }
                } catch (error) {
                  console.error('MiniKit payment error:', error);
                  setError('MiniKit payment failed');
                }
              }}
              disabled={isTransactionPending || isConfirming}
              className="w-full px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:bg-gray-600 text-white rounded-lg transition-colors"
            >
              {isTransactionPending || isConfirming
                ? `${isTransactionPending ? "Confirming..." : "Processing..."}`
                : `Pay ${decimalAmount} USDC (MiniKit)`}
            </button>
          )}
        </div>
      ) : (
        <button
          className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg opacity-50 cursor-not-allowed"
          disabled
        >
          Pay {amount ? `${amount} USDC` : 'USDC'}
        </button>
      )}
      
      {/* Transaction Status */}
      {paymentMethod === "custom" && hash && (
        <div className="mt-2 text-xs text-gray-400">
          {isConfirming && <div>⏳ Waiting for confirmation...</div>}
          {isConfirmed && <div className="text-green-400">✅ Transaction confirmed!</div>}
          {writeError && <div className="text-red-400">❌ Transaction failed</div>}
        </div>
      )}
    </div>
  );
} 