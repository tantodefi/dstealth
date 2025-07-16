"use client";

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useFkeyStatus } from '../hooks/useFkeyStatus';
import { storageManager } from '../lib/localStorage-manager';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

interface UserStealthData {
  fkeyId: string;
  stealthAddress: string;
  setupStatus: string;
  lastUpdated: number;
}

export function Settings({ isOpen, onClose }: SettingsProps) {
  const { address, isConnected } = useAccount();
  const { fkeyStatus, updateFkeyStatus, isLoading, isVerified, fkeyId: currentFkeyId } = useFkeyStatus();
  const [proxy402ApiKey, setProxy402ApiKey] = useState('');
  const [fkeyId, setFkeyId] = useState('');
  const [stealthNotifications, setStealthNotifications] = useState({
    paymentsReceived: true,
    announcements: true,
    registrations: true,
    scanComplete: true,
    monitoring: true
  });

  useEffect(() => {
    // Load API key from storage manager
    const savedKey = storageManager.getItem<string>(storageManager.KEYS.PROXY402_API_KEY);
    if (savedKey) {
      setProxy402ApiKey(savedKey);
    }

    // Load stealth notification preferences
    const savedPrefs = storageManager.getItem<typeof stealthNotifications>(storageManager.KEYS.NOTIFICATION_SETTINGS);
    if (savedPrefs) {
      setStealthNotifications(savedPrefs);
    }

    // Load fkey data from hook
    if (currentFkeyId) {
      setFkeyId(currentFkeyId);
    }
  }, [isConnected, address, currentFkeyId]);

  const handleSave = async () => {
    // Save API key using storage manager
    storageManager.setItem(storageManager.KEYS.PROXY402_API_KEY, proxy402ApiKey);
    
    // Save stealth notification preferences
    storageManager.setItem(storageManager.KEYS.NOTIFICATION_SETTINGS, stealthNotifications);
    
    // Save fkey if changed and user is connected
    if (isConnected && address && fkeyId.trim()) {
      if (currentFkeyId !== fkeyId.trim()) {
        const success = await updateFkeyStatus(fkeyId.trim());
        if (!success) {
          alert('Failed to save fkey.id to backend. Changes saved locally only.');
        }
      }
    }
    
    onClose();
  };

  const handleStealthNotificationChange = (key: keyof typeof stealthNotifications) => {
    setStealthNotifications(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const getFkeyStatusDisplay = () => {
    switch (fkeyStatus.status) {
      case 'verified':
        return <span className="text-green-400">✅ Verified</span>;
      case 'loading':
        return <span className="text-yellow-400">⏳ Loading...</span>;
      case 'error':
        return <span className="text-red-400">❌ Error</span>;
      default:
        return <span className="text-gray-400">❌ Not Set</span>;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 p-6 rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold text-white mb-4">Settings</h2>
        
        {/* FluidKey / Fkey Settings */}
        {isConnected && address && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🔑</span>
              <h3 className="text-sm font-medium text-gray-300">FluidKey Identity</h3>
              {getFkeyStatusDisplay()}
            </div>
            
            <div className="space-y-3 bg-gray-700/50 p-3 rounded-lg">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Your fkey.id
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={fkeyId}
                    onChange={(e) => setFkeyId(e.target.value)}
                    className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="yourname"
                    disabled={isLoading}
                  />
                  <span className="flex items-center text-gray-400 text-sm">.fkey.id</span>
                </div>
                <p className="mt-1 text-sm text-gray-400">
                  Your FluidKey identity for anonymous payments
                </p>
              </div>
              
              <div className="text-xs text-gray-500">
                <p>💡 This syncs with the agent database and enables:</p>
                <ul className="list-disc list-inside ml-2 mt-1">
                  <li>Anonymous payments via stealth addresses</li>
                  <li>Social discovery via agent search</li>
                  <li>Farcaster integration</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Proxy402 API Key
          </label>
          <input
            type="password"
            value={proxy402ApiKey}
            onChange={(e) => setProxy402ApiKey(e.target.value)}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter your Proxy402 API key"
          />
          <p className="mt-1 text-sm text-gray-400">
            Your API key will be stored securely in your browser&apos;s local storage.
          </p>
        </div>

        {/* Stealth Notification Settings */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🥷</span>
            <h3 className="text-sm font-medium text-gray-300">Stealth Address Notifications</h3>
          </div>
          
          <div className="space-y-3 bg-gray-700/50 p-3 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">💰 Payment Received</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={stealthNotifications.paymentsReceived}
                  onChange={() => handleStealthNotificationChange('paymentsReceived')}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
              </label>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">📢 Payment Announcements</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={stealthNotifications.announcements}
                  onChange={() => handleStealthNotificationChange('announcements')}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
              </label>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">🔐 Registry Updates</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={stealthNotifications.registrations}
                  onChange={() => handleStealthNotificationChange('registrations')}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
              </label>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">🔍 Scan Complete</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={stealthNotifications.scanComplete}
                  onChange={() => handleStealthNotificationChange('scanComplete')}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
              </label>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">👁️ Real-time Monitoring</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={stealthNotifications.monitoring}
                  onChange={() => handleStealthNotificationChange('monitoring')}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
              </label>
            </div>
          </div>
          
          <p className="mt-2 text-xs text-gray-400">
            🔒 Stealth notifications are privacy-enhanced and respect your stealth address usage
          </p>
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white focus:outline-none"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {isLoading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
} 