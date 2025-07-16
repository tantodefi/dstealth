import React from 'react';
import { useFkeyStatus } from '../hooks/useFkeyStatus';

interface FkeyStatusBadgeProps {
  showText?: boolean;
  className?: string;
}

export function FkeyStatusBadge({ showText = true, className = '' }: FkeyStatusBadgeProps) {
  const { fkeyStatus, isVerified, isLoading } = useFkeyStatus();

  const getBadgeColor = () => {
    switch (fkeyStatus.status) {
      case 'verified':
        return 'bg-green-900/30 border-green-600/30 text-green-300';
      case 'loading':
        return 'bg-yellow-900/30 border-yellow-600/30 text-yellow-300';
      case 'error':
        return 'bg-red-900/30 border-red-600/30 text-red-300';
      default:
        return 'bg-gray-900/30 border-gray-600/30 text-gray-400';
    }
  };

  const getBadgeText = () => {
    if (isLoading) return 'Loading...';
    if (isVerified && fkeyStatus.fkeyId) return `${fkeyStatus.fkeyId}.fkey.id`;
    if (fkeyStatus.status === 'error') return 'Error';
    return 'Not Set';
  };

  const getIcon = () => {
    if (isLoading) return '⏳';
    if (isVerified) return '✅';
    if (fkeyStatus.status === 'error') return '❌';
    return '⚪';
  };

  return (
    <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-xs ${getBadgeColor()} ${className}`}>
      <span>{getIcon()}</span>
      {showText && <span>{getBadgeText()}</span>}
    </div>
  );
}

export default FkeyStatusBadge; 