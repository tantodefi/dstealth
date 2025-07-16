/**
 * ZK Receipt Manager - Export/Import and Sync Status Component
 * 
 * This component provides:
 * 1. Export ZK receipts for backup
 * 2. Import ZK receipts from backup
 * 3. Sync status and statistics
 * 4. Local-first storage management
 */

import React, { useState, useEffect, useRef } from 'react';
import { useAccount } from 'wagmi';
import { 
  exportZKReceipts, 
  importZKReceipts, 
  getAllZKReceipts, 
  getZKReceiptStats,
  type ZKReceipt,
  type ZKReceiptSyncStats
} from '../lib/zk-receipt-storage';
import { Download, Upload, Database, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';

interface ZKReceiptManagerProps {
  className?: string;
}

export default function ZKReceiptManager({ className = '' }: ZKReceiptManagerProps) {
  const { address } = useAccount();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // State management
  const [receipts, setReceipts] = useState<ZKReceipt[]>([]);
  const [syncStats, setSyncStats] = useState<ZKReceiptSyncStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [showStats, setShowStats] = useState(false);

  // Load receipts and stats on component mount
  useEffect(() => {
    if (address) {
      loadReceiptsAndStats();
    }
  }, [address]);

  /**
   * Load receipts and sync statistics
   */
  const loadReceiptsAndStats = async () => {
    if (!address) return;
    
    setLoading(true);
    try {
      const [receiptsData, statsData] = await Promise.all([
        getAllZKReceipts(address),
        getZKReceiptStats(address)
      ]);
      
      setReceipts(receiptsData);
      setSyncStats(statsData);
      
    } catch (error) {
      console.error('Error loading ZK receipts:', error);
      setMessage({ type: 'error', text: 'Failed to load ZK receipts' });
    } finally {
      setLoading(false);
    }
  };

  /**
   * Export ZK receipts to file
   */
  const handleExport = async () => {
    if (!address) return;
    
    setExporting(true);
    try {
      const exportData = await exportZKReceipts(address);
      
      // Create and download file
      const blob = new Blob([exportData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zk-receipts-${address.slice(0, 6)}-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setMessage({ type: 'success', text: `Exported ${receipts.length} ZK receipts to file` });
      
    } catch (error) {
      console.error('Error exporting ZK receipts:', error);
      setMessage({ type: 'error', text: 'Failed to export ZK receipts' });
    } finally {
      setExporting(false);
    }
  };

  /**
   * Import ZK receipts from file
   */
  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !address) return;
    
    setImporting(true);
    try {
      const fileContent = await file.text();
      const result = await importZKReceipts(fileContent);
      
      if (result.errors > 0) {
        setMessage({ 
          type: 'info', 
          text: `Imported ${result.imported} receipts with ${result.errors} errors` 
        });
      } else {
        setMessage({ 
          type: 'success', 
          text: `Successfully imported ${result.imported} ZK receipts` 
        });
      }
      
      // Reload receipts after import
      await loadReceiptsAndStats();
      
    } catch (error) {
      console.error('Error importing ZK receipts:', error);
      setMessage({ type: 'error', text: 'Failed to import ZK receipts' });
    } finally {
      setImporting(false);
      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  /**
   * Clear message after timeout
   */
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  /**
   * Format timestamp for display
   */
  const formatTimestamp = (timestamp: number): string => {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleString();
  };

  /**
   * Get sync status color
   */
  const getSyncStatusColor = (): string => {
    if (!syncStats) return 'text-gray-400';
    
    const lastSync = syncStats.lastSync;
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    
    if (now - lastSync < fiveMinutes) {
      return 'text-green-400';
    } else if (now - lastSync < 60 * 60 * 1000) { // 1 hour
      return 'text-yellow-400';
    } else {
      return 'text-red-400';
    }
  };

  if (!address) {
    return (
      <div className={`bg-gray-800 rounded-lg p-6 ${className}`}>
        <div className="text-center text-gray-400">
          <Database className="h-8 w-8 mx-auto mb-2" />
          <p>Connect wallet to manage ZK receipts</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-gray-800 rounded-lg p-6 ${className}`}>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Database className="h-6 w-6" />
          ZK Receipt Manager
        </h2>
        <button
          onClick={loadReceiptsAndStats}
          disabled={loading}
          className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Status Message */}
      {message && (
        <div className={`mb-4 p-3 rounded-lg flex items-center gap-2 ${
          message.type === 'success' ? 'bg-green-900/30 text-green-400 border border-green-600/30' :
          message.type === 'error' ? 'bg-red-900/30 text-red-400 border border-red-600/30' :
          'bg-blue-900/30 text-blue-400 border border-blue-600/30'
        }`}>
          {message.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-700 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-1">Total Receipts</h3>
          <p className="text-2xl font-bold text-white">{receipts.length}</p>
        </div>
        <div className="bg-gray-700 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-1">Sync Status</h3>
          <p className={`text-sm font-medium ${getSyncStatusColor()}`}>
            {syncStats?.lastSync ? formatTimestamp(syncStats.lastSync) : 'Never'}
          </p>
        </div>
      </div>

      {/* Export/Import Actions */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={handleExport}
          disabled={exporting || receipts.length === 0}
          className="flex-1 flex items-center justify-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          {exporting ? 'Exporting...' : 'Export Receipts'}
        </button>
        
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          <Upload className="h-4 w-4" />
          {importing ? 'Importing...' : 'Import Receipts'}
        </button>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleImport}
        style={{ display: 'none' }}
      />

      {/* Detailed Stats (Collapsible) */}
      <div className="border-t border-gray-700 pt-4">
        <button
          onClick={() => setShowStats(!showStats)}
          className="w-full flex items-center justify-between text-left text-gray-300 hover:text-white"
        >
          <span>Sync Statistics</span>
          <RefreshCw className={`h-4 w-4 transition-transform ${showStats ? 'rotate-180' : ''}`} />
        </button>
        
        {showStats && syncStats && (
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Local Receipts:</span>
              <span className="text-white">{syncStats.localReceipts}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Redis Receipts:</span>
              <span className="text-white">{syncStats.redisReceipts}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Last Sync:</span>
              <span className="text-white">{formatTimestamp(syncStats.lastSync)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Sync Errors:</span>
              <span className={`${syncStats.syncErrors > 0 ? 'text-red-400' : 'text-green-400'}`}>
                {syncStats.syncErrors}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Recent Receipts Preview */}
      {receipts.length > 0 && (
        <div className="mt-6 border-t border-gray-700 pt-4">
          <h3 className="text-sm font-medium text-gray-400 mb-3">Recent Receipts</h3>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {receipts.slice(0, 3).map((receipt) => (
              <div key={receipt.id} className="bg-gray-700 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white">{receipt.fkeyId}</p>
                    <p className="text-xs text-gray-400">{receipt.metadata.transactionType}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">{formatTimestamp(receipt.timestamp)}</p>
                    <p className={`text-xs font-medium ${
                      receipt.status === 'completed' ? 'text-green-400' : 
                      receipt.status === 'pending_payment' ? 'text-yellow-400' : 
                      'text-blue-400'
                    }`}>
                      {receipt.status.replace('_', ' ')}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Storage Info */}
      <div className="mt-6 p-4 bg-gray-700 rounded-lg">
        <h3 className="text-sm font-medium text-gray-400 mb-2">Storage Information</h3>
        <div className="text-xs text-gray-400 space-y-1">
          <p>• ZK receipts are stored locally in your browser (permanent)</p>
          <p>• Redis sync provides 7-day backup and cross-device access</p>
          <p>• Export regularly to create external backups</p>
          <p>• Import to restore receipts from other devices</p>
        </div>
      </div>
    </div>
  );
} 