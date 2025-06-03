import { useAccount } from 'wagmi';

export function useWallet() {
  const { isConnected } = useAccount();
  return { isConnected };
} 