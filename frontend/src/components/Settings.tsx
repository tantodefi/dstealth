"use client";

import { useState, useEffect } from 'react';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Settings({ isOpen, onClose }: SettingsProps) {
  const [proxy402ApiKey, setProxy402ApiKey] = useState('');
  const [stealthNotifications, setStealthNotifications] = useState({
    paymentsReceived: true,
    announcements: true,
    registrations: true,
    scanComplete: true,
    monitoring: true
  });

  useEffect(() => {
    // Load API key from localStorage when component mounts
    const savedKey = localStorage.getItem('proxy402_api_key');
    if (savedKey) {
      setProxy402ApiKey(savedKey);
    }

    // Load stealth notification preferences
    const savedPrefs = localStorage.getItem('stealth_notification_prefs');
    if (savedPrefs) {
      try {
        setStealthNotifications(JSON.parse(savedPrefs));
      } catch (error) {
        console.warn('Failed to load stealth notification preferences:', error);
      }
    }
  }, []);

  const handleSave = () => {
    // Save API key to localStorage
    localStorage.setItem('proxy402_api_key', proxy402ApiKey);
    
    // Save stealth notification preferences
    localStorage.setItem('stealth_notification_prefs', JSON.stringify(stealthNotifications));
    
    onClose();
  };

  const handleStealthNotificationChange = (key: keyof typeof stealthNotifications) => {
    setStealthNotifications(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 p-6 rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold text-white mb-4">Settings</h2>
        
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
            className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
} 