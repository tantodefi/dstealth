"use client";

import { useState, useEffect } from 'react';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Settings({ isOpen, onClose }: SettingsProps) {
  const [proxy402ApiKey, setProxy402ApiKey] = useState('');

  useEffect(() => {
    // Load API key from localStorage when component mounts
    const savedKey = localStorage.getItem('proxy402_api_key');
    if (savedKey) {
      setProxy402ApiKey(savedKey);
    }
  }, []);

  const handleSave = () => {
    // Save API key to localStorage
    localStorage.setItem('proxy402_api_key', proxy402ApiKey);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 p-6 rounded-lg shadow-xl max-w-md w-full">
        <h2 className="text-xl font-bold text-white mb-4">Settings</h2>
        
        <div className="mb-4">
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
            Your API key will be stored securely in your browser's local storage.
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