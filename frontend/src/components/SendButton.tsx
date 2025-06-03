"use client";

import { DaimoPayButton } from "@daimo/pay";
import { getAddress, type Address } from "viem";
import { useEffect, useState, useCallback, useMemo } from "react";

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

interface SendButtonProps {
  recipientAddress: string;
  amount: string;
  onPaymentStarted?: (e: any) => void;
  onPaymentCompleted?: (e: any) => void;
  disabled?: boolean;
}

export default function SendButton({
  recipientAddress,
  amount,
  onPaymentStarted,
  onPaymentCompleted,
  disabled = false,
}: SendButtonProps) {
  const [isValidAmount, setIsValidAmount] = useState(false);
  const [decimalAmount, setDecimalAmount] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [buttonCounter, setButtonCounter] = useState(0);
  
  // Validate amount and format for Daimo
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

      if (numAmount > 0.004) {
        setError(`Amount cannot exceed $0.004 USDC (Daimo limit)`);
        setIsValidAmount(false);
        setDecimalAmount("0");
        return;
      }

      // Daimo expects decimal format, not blockchain units
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
  }, [amount]);

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

  // Generate unique key for forcing re-renders
  const buttonKey = `daimo-pay-${decimalAmount}-${formattedAddress}-${buttonCounter}`;

  // Memoize event handlers to prevent unnecessary re-renders
  const handlePaymentStarted = useCallback((e: any) => {
    console.log('Payment started with amount:', decimalAmount);
    if (onPaymentStarted) onPaymentStarted(e);
  }, [onPaymentStarted, decimalAmount]);

  const handlePaymentCompleted = useCallback((e: any) => {
    console.log('Payment completed with amount:', decimalAmount);
    if (onPaymentCompleted) onPaymentCompleted(e);
  }, [onPaymentCompleted, decimalAmount]);

  // Only render button if we have valid inputs and no errors
  const shouldShowButton = !disabled && isValidAmount && recipientAddress && !error && formattedAddress;

  console.log('SendButton render:', { 
    amount, 
    decimalAmount, 
    shouldShowButton, 
    buttonKey,
    buttonCounter,
    intent: `Pay ${amount} USDC`
  });

  return (
    <div className="w-full">
      {error && (
        <div className="text-red-500 text-sm mb-2">
          {error}
        </div>
      )}
      
      {/* Debug Info */}
      <div className="text-xs text-gray-500 mb-2 font-mono">
        Debug: amount={amount} | decimal={decimalAmount} | counter={buttonCounter}
      </div>
      
      {shouldShowButton ? (
        <div className="relative">
          <DaimoPayButton
            key={buttonKey}
            appId="pay-demo"
            intent={`Pay ${amount} USDC`}
            toChain={USDC_BASE.chainId}
            toUnits={decimalAmount}
            toToken={getAddress(USDC_BASE.address)}
            toAddress={formattedAddress}
            onPaymentStarted={handlePaymentStarted}
            onPaymentCompleted={handlePaymentCompleted}
          />
        </div>
      ) : (
        <button
          className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg opacity-50 cursor-not-allowed"
          disabled
        >
          Pay {amount ? `${amount} USDC` : 'USDC'}
        </button>
      )}
    </div>
  );
} 