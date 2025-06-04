"use client";

import { DaimoPayButton } from "@daimo/pay";
import { getAddress, type Address } from "viem";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useWriteContract, useWaitForTransactionReceipt, useSwitchChain, useChainId } from "wagmi";
import { Transaction } from '@coinbase/onchainkit/transaction';
import { useMiniKit } from '@coinbase/onchainkit/minikit';
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

  // MiniKit hook for context (checking if we're in a frame)
  const { context } = useMiniKit();

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
        chainId: USDC_BASE.chainId, // Explicitly set chain ID
      });
    } catch (error) {
      console.error("Custom payment error:", error);
      setError("Transaction failed. Please ensure you're connected to Base network.");
    }
  }, [formattedAddress, isValidAmount, decimalAmount, writeContract, onPaymentStarted, chainId, switchChain]);

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
              <DaimoPayButton
                key={buttonKey}
                appId="pay-demo"
                intent={`Pay ${decimalAmount} USDC`}
                toChain={USDC_BASE.chainId}
                toUnits={decimalAmount}
                toToken={getAddress(USDC_BASE.address)}
                toAddress={formattedAddress}
                onPaymentStarted={handlePaymentStarted}
                onPaymentCompleted={handlePaymentCompleted}
              />
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
            <Transaction
              calls={miniKitCalls}
              chainId={USDC_BASE.chainId}
              onStatus={(status) => {
                console.log('MiniKit transaction status:', status);
                if (status.statusName === 'transactionPending') {
                  handleMiniKitStart();
                } else if (status.statusName === 'success') {
                  handleMiniKitSuccess(status.statusData);
                }
              }}
            />
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