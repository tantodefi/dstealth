import Link from "next/link";
import { useEruda } from "@/providers/eruda";
import { WelcomeMessage } from "./WelcomeMessage";
import { useXMTP } from "@/context/xmtp-context";
import { Eye, ChevronDown, Copy, Check, User, Settings, X, RefreshCw, Link as LinkIcon } from "lucide-react";
import { useAccount, useDisconnect } from "wagmi";
import { useState, useEffect, useRef } from "react";
import { privateKeyToAccount } from "viem/accounts";
import { useRouter } from "next/navigation";
import SettingsModal from "./SettingsModal";
import { Proxy402Balance } from "./Proxy402Balance";

interface HeaderProps {
  onLogout?: () => void;
  isConnected?: boolean;
  onShowEarningsChart?: () => void;
}

export function Header({ onLogout, isConnected, onShowEarningsChart }: HeaderProps) {
  // Use the Eruda context to access toggle functionality
  const { isVisible, toggleEruda } = useEruda();
  const { 
    client, 
    disconnect: disconnectXMTP, 
    connectionType, 
    isInFarcasterContext, 
    farcasterUser 
  } = useXMTP();
  const { address, isConnected: walletConnected } = useAccount();
  const { disconnect: disconnectWallet } = useDisconnect();
  
  // Modal states
  const [showSettings, setShowSettings] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [backendStatus, setBackendStatus] = useState<'connected' | 'disconnected' | 'checking'>('checking');

  const router = useRouter();

  // Handle mounting state
  useEffect(() => {
    setMounted(true);
  }, []);

  // Check backend status periodically
  useEffect(() => {
    const checkBackendStatus = async () => {
      try {
        const response = await fetch('/api/agent/info', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        
        if (response.ok) {
          setBackendStatus('connected');
        } else {
          setBackendStatus('disconnected');
        }
      } catch (error) {
        setBackendStatus('disconnected');
      }
    };

    // Check immediately and then every 30 seconds
    checkBackendStatus();
    const interval = setInterval(checkBackendStatus, 30000);

    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-white font-medium">myf⚡key</span>
        </Link>

        {/* Compact Earnings Component - Center */}
        <div className="flex-1 flex justify-center px-4">
          <Proxy402Balance 
            compact={true} 
            onShowChart={onShowEarningsChart}
          />
        </div>

        <div className="flex items-center space-x-2">
          {/* Only Settings Gear Icon */}
          <button
            onClick={() => setShowSettings(true)}
            className="text-gray-400 hover:text-white transition-colors"
            title="Settings"
          >
            <Settings size={20} />
          </button>

          {/* Backend Status Indicator */}
          <div className={`w-2 h-2 rounded-full ${
            backendStatus === 'connected' ? 'bg-green-500' : 
            backendStatus === 'disconnected' ? 'bg-red-500' : 
            'bg-yellow-500'
          }`} title={`Backend: ${backendStatus}`}></div>
        </div>
      </header>

      <WelcomeMessage onShowEarningsChart={onShowEarningsChart} />

      {/* Settings Modal */}
      <SettingsModal 
        isOpen={showSettings} 
        onClose={() => setShowSettings(false)} 
      />
    </>
  );
}
