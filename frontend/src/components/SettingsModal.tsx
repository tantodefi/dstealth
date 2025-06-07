'use client';

import { useState, useEffect } from 'react';
import { X, Save, ExternalLink, Key, Database, Download } from 'lucide-react';
import { useAccount } from 'wagmi';
import { database } from '@/lib/database';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { address, isConnected } = useAccount();
  const [jwtToken, setJwtToken] = useState('');
  const [fkeyUsername, setFkeyUsername] = useState('');
  const [convosUsername, setConvosUsername] = useState('');
  const [isValidJWT, setIsValidJWT] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  // Load saved settings
  useEffect(() => {
    if (isOpen && address) {
      // Load from database first
      const userData = database.getUser(address);
      
      // Fallback to localStorage for backward compatibility
      const savedJWT = userData?.jwtToken || localStorage.getItem('fkey:jwt') || '';
      const savedFkeyUsername = userData?.fkeyId || localStorage.getItem('fkey:username') || '';
      const savedConvosUsername = userData?.convosUsername || localStorage.getItem('convos:username') || '';
      
      setJwtToken(savedJWT);
      setFkeyUsername(savedFkeyUsername);
      setConvosUsername(savedConvosUsername);
      setIsValidJWT(validateJWT(savedJWT));
    }
  }, [isOpen, address]);

  // Validate JWT token format
  const validateJWT = (token: string): boolean => {
    if (!token) return false;
    const parts = token.split('.');
    return parts.length === 3;
  };

  // Handle JWT input change
  const handleJWTChange = (value: string) => {
    setJwtToken(value);
    setIsValidJWT(validateJWT(value));
  };

  // Import legacy data
  const handleImportLegacyData = async () => {
    if (!address) return;
    
    setImporting(true);
    try {
      await database.importLegacyData(address);
      setNotification({
        type: 'success',
        message: 'Legacy data imported successfully!'
      });
      
      // Reload settings from database
      const userData = database.getUser(address);
      if (userData) {
        setJwtToken(userData.jwtToken || '');
        setFkeyUsername(userData.fkeyId || '');
        setConvosUsername(userData.convosUsername || '');
      }
    } catch (error) {
      console.error('Import failed:', error);
      setNotification({
        type: 'error',
        message: 'Failed to import legacy data'
      });
    } finally {
      setImporting(false);
      setTimeout(() => setNotification(null), 3000);
    }
  };

  // Export user data
  const handleExportData = async () => {
    if (!address) return;
    
    try {
      const userData = database.exportUserData(address);
      const blob = new Blob([JSON.stringify(userData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `xmtp-user-data-${address.slice(0, 8)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setNotification({
        type: 'success',
        message: 'User data exported successfully!'
      });
    } catch (error) {
      console.error('Export failed:', error);
      setNotification({
        type: 'error',
        message: 'Failed to export user data'
      });
    }
    setTimeout(() => setNotification(null), 3000);
  };

  // Save settings
  const handleSave = async () => {
    if (!address) return;
    
    setSaving(true);
    
    try {
      // Save to database
      await database.createOrUpdateUser({
        address,
        jwtToken,
        fkeyId: fkeyUsername,
        convosUsername,
      });
      
      // Keep localStorage for backward compatibility
      localStorage.setItem('fkey:jwt', jwtToken);
      localStorage.setItem('fkey:username', fkeyUsername);
      localStorage.setItem('convos:username', convosUsername);
      
      // Test JWT validity and fetch user data if provided
      if (jwtToken && isValidJWT) {
        try {
          const response = await fetch('/api/proxy402/dashboard/stats', {
            headers: {
              'Authorization': `Bearer ${jwtToken}`
            }
          });
          
          if (response.ok) {
            const stats = await response.json();
            // Update earnings stats in database
            database.updateEarningsStats(address, {
              proxy402Revenue: (stats.total_earnings || 0) / 100,
              totalPurchases: stats.total_purchases || 0,
            });
            
            // Dispatch custom event to refresh earnings display
            window.dispatchEvent(new CustomEvent('proxy402-earnings-refresh'));
            
            setNotification({
              type: 'success',
              message: 'Settings saved and proxy402 data synced!'
            });
          } else {
            setNotification({
              type: 'info',
              message: 'Settings saved (JWT validation pending)'
            });
          }
        } catch (error) {
          console.warn('Could not validate JWT:', error);
          setNotification({
            type: 'info',
            message: 'Settings saved (JWT validation failed)'
          });
        }
      } else {
        setNotification({
          type: 'success',
          message: 'Settings saved successfully!'
        });
      }
      
      setTimeout(() => {
        setSaving(false);
        setNotification(null);
        onClose();
      }, 1500);
    } catch (error) {
      console.error('Error saving settings:', error);
      setNotification({
        type: 'error',
        message: 'Failed to save settings'
      });
      setSaving(false);
      setTimeout(() => setNotification(null), 3000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Key size={20} />
            Settings
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* Notification */}
        {notification && (
          <div className={`mx-6 mt-4 p-3 rounded-lg text-sm ${
            notification.type === 'success' ? 'bg-green-900/20 text-green-400 border border-green-600/30' :
            notification.type === 'error' ? 'bg-red-900/20 text-red-400 border border-red-600/30' :
            'bg-blue-900/20 text-blue-400 border border-blue-600/30'
          }`}>
            {notification.message}
          </div>
        )}

        {/* Content */}
        <div className="p-6 space-y-6">
          {!isConnected && (
            <div className="bg-yellow-900/20 border border-yellow-600/30 rounded-lg p-4 text-center">
              <p className="text-yellow-400 text-sm">Connect your wallet to save settings</p>
            </div>
          )}

          {/* JWT Token Section */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Proxy402 JWT Token
            </label>
            <textarea
              value={jwtToken}
              onChange={(e) => handleJWTChange(e.target.value)}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              className="w-full p-3 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm"
              rows={3}
              disabled={!isConnected}
            />
            <div className="flex items-center justify-between mt-2">
              <span className={`text-xs ${
                jwtToken ? (isValidJWT ? 'text-green-400' : 'text-red-400') : 'text-gray-500'
              }`}>
                {jwtToken ? (isValidJWT ? '✓ Valid JWT format' : '✗ Invalid JWT format') : 'No token provided'}
              </span>
              <a
                href="https://proxy402.com/dashboard"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 text-xs flex items-center gap-1"
              >
                Get Token <ExternalLink size={12} />
              </a>
            </div>
          </div>

          {/* Fkey.id Username Section */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Fkey.id Username
            </label>
            <div className="flex">
              <input
                type="text"
                value={fkeyUsername}
                onChange={(e) => setFkeyUsername(e.target.value.toLowerCase())}
                placeholder="username"
                className="flex-1 p-3 bg-gray-800 border border-gray-600 rounded-l-lg text-white"
                disabled={!isConnected}
              />
              <div className="bg-gray-700 border border-gray-600 border-l-0 rounded-r-lg px-3 py-3 text-gray-300 text-sm">
                .fkey.id
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Associate your profile with a fkey.id domain
            </p>
          </div>

          {/* Convos.org Username Section */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Convos.org Username
            </label>
            <div className="flex">
              <input
                type="text"
                value={convosUsername}
                onChange={(e) => setConvosUsername(e.target.value.toLowerCase())}
                placeholder="username"
                className="flex-1 p-3 bg-gray-800 border border-gray-600 rounded-l-lg text-white"
                disabled={!isConnected}
              />
              <div className="bg-gray-700 border border-gray-600 border-l-0 rounded-r-lg px-3 py-3 text-gray-300 text-sm">
                .convos.org
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Enable direct messaging integration
            </p>
          </div>

          {/* Data Management */}
          {isConnected && (
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
                <Database size={16} />
                Data Management
              </h3>
              <div className="space-y-2">
                <button
                  onClick={handleImportLegacyData}
                  disabled={importing}
                  className="w-full px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 text-white text-xs rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {importing ? (
                    <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Database size={12} />
                  )}
                  Import Legacy Data
                </button>
                <button
                  onClick={handleExportData}
                  className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <Download size={12} />
                  Export User Data
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Import existing data from localStorage or export your current data as JSON.
              </p>
            </div>
          )}

          {/* URL Management Info */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-white mb-2">URL Management</h3>
            <p className="text-xs text-gray-400 mb-2">
              Manage your X402:// and Proxy402 URLs in the X402 tab.
            </p>
            <div className="space-y-1 text-xs text-gray-500">
              <div>• X402:// - Direct protocol URLs</div>
              <div>• Proxy402 - HTTP proxy URLs</div>
              <div>• Test payment flows</div>
              <div>• Track earnings and analytics</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-700">
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !isConnected}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {saving ? (
                <div className="w-4 h-4 border border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Save size={16} />
              )}
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 