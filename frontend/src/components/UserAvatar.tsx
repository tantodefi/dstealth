'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { User } from 'lucide-react';

interface UserAvatarProps {
  address?: string;
  farcasterUser?: {
    profileImage?: string;
    displayName?: string;
    username?: string;
  };
  size?: number;
  className?: string;
}

export default function UserAvatar({ 
  address, 
  farcasterUser, 
  size = 32, 
  className = "" 
}: UserAvatarProps) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  // Avatar resolution priority:
  // 1. Farcaster profile image
  // 2. ENS avatar
  // 3. Basename avatar
  // 4. Fallback to initials or default

  useEffect(() => {
    if (!address) return;

    const resolveAvatar = async () => {
      setLoading(true);
      setHasError(false);

      try {
        // Priority 1: Farcaster (already handled in props)
        if (farcasterUser?.profileImage) {
          setAvatarUrl(farcasterUser.profileImage);
          setLoading(false);
          return;
        }

        // Priority 2: ENS Avatar - Multiple attempts
        try {
          // Try ENS metadata service first
          const ensMetadataResponse = await fetch(`https://metadata.ens.domains/mainnet/avatar/${address}`);
          if (ensMetadataResponse.ok && ensMetadataResponse.headers.get('content-type')?.includes('image')) {
            setAvatarUrl(ensMetadataResponse.url);
            setLoading(false);
            return;
          }
        } catch (error) {
          console.log('ENS metadata avatar lookup failed:', error);
        }

        try {
          // Try alternative ENS service
          const ensResponse = await fetch(`https://api.ensideas.com/ens/resolve/${address}`);
          if (ensResponse.ok) {
            const ensData = await ensResponse.json();
            if (ensData.avatar) {
              setAvatarUrl(ensData.avatar);
              setLoading(false);
              return;
            }
          }
        } catch (error) {
          console.log('ENS ideas avatar lookup failed:', error);
        }

        // Priority 3: Basename Avatar
        try {
          const basenameResponse = await fetch(`https://api.basenames.org/v1/name/${address}`);
          if (basenameResponse.ok) {
            const basenameData = await basenameResponse.json();
            if (basenameData.avatar) {
              setAvatarUrl(basenameData.avatar);
              setLoading(false);
              return;
            }
          }
        } catch (error) {
          console.log('Basename avatar lookup failed:', error);
        }

        // Priority 4: Try another ENS resolver
        try {
          const ensDirectResponse = await fetch(`https://api.web3.bio/profile/eth/${address}`);
          if (ensDirectResponse.ok) {
            const ensDirectData = await ensDirectResponse.json();
            if (ensDirectData.avatar) {
              setAvatarUrl(ensDirectData.avatar);
              setLoading(false);
              return;
            }
          }
        } catch (error) {
          console.log('Web3.bio avatar lookup failed:', error);
        }

        // Priority 5: Universal avatar service
        try {
          const universalResponse = await fetch(`https://universal-avatar.com/avatar/${address}`);
          if (universalResponse.ok) {
            setAvatarUrl(universalResponse.url);
            setLoading(false);
            return;
          }
        } catch (error) {
          console.log('Universal avatar lookup failed:', error);
        }

        // No avatar found
        setAvatarUrl(null);
      } catch (error) {
        console.error('Avatar resolution failed:', error);
        setAvatarUrl(null);
      } finally {
        setLoading(false);
      }
    };

    const timeoutId = setTimeout(resolveAvatar, 100); // Reduce debounce time
    return () => clearTimeout(timeoutId);
  }, [address, farcasterUser?.profileImage]);

  // Generate initials from address or name
  const getInitials = () => {
    if (farcasterUser?.displayName) {
      return farcasterUser.displayName.slice(0, 2).toUpperCase();
    }
    if (farcasterUser?.username) {
      return farcasterUser.username.slice(0, 2).toUpperCase();
    }
    if (address) {
      return address.slice(2, 4).toUpperCase();
    }
    return '??';
  };

  // Handle image load error
  const handleImageError = () => {
    setHasError(true);
    setAvatarUrl(null);
  };

  // Generate gradient based on address
  const getGradient = () => {
    if (!address) return 'from-gray-500 to-gray-600';
    
    const hash = address.slice(2, 8);
    const hue = parseInt(hash, 16) % 360;
    
    return `from-blue-${Math.floor(hue % 9) + 1}00 to-purple-${Math.floor(hue % 9) + 1}00`;
  };

  const sizeClass = `w-${Math.floor(size/4)} h-${Math.floor(size/4)}`;

  // Show loading state
  if (loading) {
    return (
      <div 
        className={`${sizeClass} bg-gray-600 rounded-full flex items-center justify-center border-2 border-gray-600 animate-pulse ${className}`}
        style={{ width: size, height: size }}
      >
        <User className="text-gray-400" size={size * 0.5} />
      </div>
    );
  }

  // Show avatar image if available and not errored
  if (avatarUrl && !hasError) {
    return (
      <div className={`relative ${className}`} style={{ width: size, height: size }}>
        <Image
          src={avatarUrl}
          alt="User avatar"
          width={size}
          height={size}
          className="rounded-full border-2 border-gray-600 object-cover"
          onError={handleImageError}
          unoptimized // For external URLs
        />
      </div>
    );
  }

  // Fallback to initials with gradient
  return (
    <div 
      className={`bg-gradient-to-br ${getGradient()} rounded-full flex items-center justify-center text-white font-bold border-2 border-gray-600 ${className}`}
      style={{ 
        width: size, 
        height: size, 
        fontSize: size * 0.35 
      }}
    >
      {getInitials()}
    </div>
  );
} 