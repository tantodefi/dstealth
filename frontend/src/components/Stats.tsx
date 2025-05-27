import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { storage } from '@/lib/storage';

interface AppStats {
  invitesSent: number;
  stealthPaymentsSent: number;
  endpoints: number;
}

export function Stats() {
  const [isOpen, setIsOpen] = useState(false);
  const [stats, setStats] = useState<AppStats>({ invitesSent: 0, stealthPaymentsSent: 0, endpoints: 0 });

  useEffect(() => {
    // Load initial stats
    setStats(storage.getStats());

    // Listen for storage changes from other components
    const handleStorageChange = () => {
      setStats(storage.getStats());
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  return (
    <div className="w-full max-w-md mx-auto">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-2 bg-gray-900 hover:bg-gray-800 rounded-md text-sm text-gray-300"
      >
        <span>Activity Stats</span>
        {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {isOpen && (
        <div className="mt-2 p-4 bg-gray-900 rounded-md">
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-500">{stats.invitesSent}</div>
              <div className="text-xs text-gray-400">Invites Sent</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-500">{stats.stealthPaymentsSent}</div>
              <div className="text-xs text-gray-400">Stealth Payments</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-[#ff6b4a]">{stats.endpoints}</div>
              <div className="text-xs text-gray-400">Endpoints</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 