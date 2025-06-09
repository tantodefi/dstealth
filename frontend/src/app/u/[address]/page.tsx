"use client";

import { useState, useEffect } from 'react';
import UserProfile from '@/components/UserProfile';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

interface PageProps {
  params: Promise<{
    address: string;
  }>;
}

export default function UserProfilePage({ params }: PageProps) {
  const [address, setAddress] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const getParams = async () => {
      const resolvedParams = await params;
      setAddress(resolvedParams.address);
      setIsLoading(false);
    };
    
    getParams();
  }, [params]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center mobile-scroll hide-scrollbar">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white mobile-scroll hide-scrollbar">
      {/* Back Navigation */}
      <div className="max-w-md mx-auto p-4 mobile-scroll hide-scrollbar">
        <Link 
          href="/"
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to App
        </Link>
      </div>

      {/* User Profile Component */}
      <div className="mobile-scroll hide-scrollbar overflow-y-auto">
        <UserProfile address={address} viewOnly={true} />
      </div>
    </div>
  );
} 