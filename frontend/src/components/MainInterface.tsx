"use client";

import React, { useState } from "react";
import { 
  User, 
  Eye, 
  Link as LinkIcon, 
  Bot, 
  MessageCircle, 
  Receipt, 
  Trophy,
  Umbrella,
  Search,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import Link from "next/link";
import { useAccount } from "wagmi";
import UserProfile from "./UserProfile";
import { FkeySearch } from "./FkeySearch";
import ViewerComponent from "./ViewerComponent";
import X402TestComponent from "./X402TestComponent";
import XMTPAgentManager from "./XMTPAgentManager";
import BotChat from "@/examples/BotChat";
import ConvosChat from "./ConvosChat";
import TantoConvosChat from "./TantoConvosChat";
import ZkReceipts from "./ZkReceipts";
import NinjaRewards from "./NinjaRewards";
import StealthScanner from "./StealthScanner";
import { EarningsChart } from "./EarningsChart";
import GroupChat from "@/examples/GroupChat";
import { Stats } from "./Stats";
import { DebugJWT } from './DebugJWT';
import { ConvosSearch } from './ConvosSearch';
import ProfileMenu from "./ProfileMenu";

type ViewType = "main" | "agent" | "chat" | "receipts" | "x402" | "earnings" | "rewards" | "privacy" | "profile" | "viewer";

interface MainInterfaceProps {
  showEarningsChart?: boolean;
  onCloseEarningsChart?: () => void;
}

export default function MainInterface({ showEarningsChart, onCloseEarningsChart }: MainInterfaceProps) {
  const [currentView, setCurrentView] = useState<ViewType>("main");
  const [showActivityStats, setShowActivityStats] = useState(true);
  const { address } = useAccount();

  // Get current user address (either wallet or ephemeral)
  const getCurrentUserAddress = () => {
    if (address) return address;
    
    // Check for ephemeral address
    const savedPrivateKey = localStorage.getItem("xmtp:ephemeralKey");
    if (savedPrivateKey) {
      try {
        const { privateKeyToAccount } = require('viem/accounts');
        const formattedKey = savedPrivateKey.startsWith("0x")
          ? savedPrivateKey as `0x${string}`
          : `0x${savedPrivateKey}` as `0x${string}`;
        const account = privateKeyToAccount(formattedKey);
        return account.address;
      } catch (error) {
        console.error("Error getting ephemeral address:", error);
      }
    }
    
    return null;
  };

  const currentAddress = getCurrentUserAddress();

  const renderCurrentView = () => {
    if (showEarningsChart) {
      return (
        <div className="h-full mobile-scroll hide-scrollbar overflow-y-auto">
          <EarningsChart onClose={onCloseEarningsChart || (() => {})} />
        </div>
      );
    }

    switch (currentView) {
      case "agent":
        return (
          <div className="h-full space-y-4 mobile-scroll hide-scrollbar overflow-y-auto">
            <BotChat />
            <XMTPAgentManager />
          </div>
        );
      case "chat":
        return (
          <div className="h-full space-y-4 mobile-scroll hide-scrollbar overflow-y-auto">
            <TantoConvosChat />
            <div className="bg-gradient-to-r from-orange-900/20 to-red-900/20 border border-orange-600/30 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-3">
                <Search className="h-5 w-5 text-orange-400" />
                <h2 className="text-lg font-semibold text-white">Search convos</h2>
                <span className="text-sm text-orange-300">Find users on convos.org</span>
              </div>
              <ConvosSearch />
            </div>
            <GroupChat />
          </div>
        );
      case "receipts":
        return (
          <div className="h-full mobile-scroll hide-scrollbar overflow-y-auto">
            <ZkReceipts />
          </div>
        );
      case "x402":
        return (
          <div className="h-full mobile-scroll hide-scrollbar overflow-y-auto">
            <X402TestComponent />
          </div>
        );
      case "earnings":
        return (
          <div className="h-full mobile-scroll hide-scrollbar overflow-y-auto">
            <EarningsChart onClose={() => setCurrentView("main")} />
          </div>
        );
      case "rewards":
        return (
          <div className="h-full mobile-scroll hide-scrollbar overflow-y-auto">
            <NinjaRewards />
          </div>
        );
      case "privacy":
        return (
          <div className="h-full mobile-scroll hide-scrollbar overflow-y-auto">
            <StealthScanner />
          </div>
        );
      case "profile":
        return (
          <div className="h-full space-y-4 mobile-scroll hide-scrollbar overflow-y-auto">
            <ProfileMenu />
            <UserProfile address={currentAddress || undefined} viewOnly={false} />
          </div>
        );
      case "viewer":
        return (
          <div className="h-full mobile-scroll hide-scrollbar overflow-y-auto">
            <ViewerComponent />
          </div>
        );
      default:
        return (
          <div className="h-full space-y-4 mobile-scroll hide-scrollbar overflow-y-auto">
            {/* Always show search component prominently */}
            <div className="bg-gradient-to-r from-purple-900/20 to-blue-900/20 border border-purple-600/30 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-3">
                <Search className="h-5 w-5 text-purple-400" />
                <h2 className="text-lg font-semibold text-white">Stealth Address Lookup</h2>
                <span className="text-sm text-purple-300">Find users & create anonymous payments</span>
              </div>
              <FkeySearch />
            </div>

            {/* Collapsible Activity Stats */}
            <div className="bg-gray-900/50 border border-gray-600/30 rounded-lg">
              <button
                onClick={() => setShowActivityStats(!showActivityStats)}
                className="w-full p-4 flex items-center justify-between hover:bg-gray-800/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-blue-600 rounded-lg flex items-center justify-center">
                    <span className="text-white font-bold text-sm">📊</span>
                  </div>
                  <div className="text-left">
                    <h3 className="text-lg font-semibold text-white">Privacy Dashboard</h3>
                    <p className="text-sm text-gray-400">Stealth transactions, zk receipts, and privacy metrics</p>
                  </div>
                </div>
                {showActivityStats ? (
                  <ChevronUp className="h-5 w-5 text-gray-400" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-gray-400" />
                )}
              </button>
              
              {showActivityStats && (
                <div className="px-4 pb-4">
                  <Stats />
                </div>
              )}
            </div>

            {/* Debug JWT Component - Moved to bottom */}
            <DebugJWT />
          </div>
        );
    }
  };

  return (
    <div className="h-full flex flex-col mobile-scroll hide-scrollbar">
      {/* Enhanced Navigation Icons - Two Rows */}
      <div className="w-full flex-shrink-0 mb-6">        
        {/* First Row - 4 icons */}
        <div className="grid grid-cols-4 gap-3 mb-3">
          <button
            onClick={() => setCurrentView(currentView === "profile" ? "main" : "profile")}
            className={`flex flex-col items-center justify-center p-4 rounded-lg transition-all duration-200 ${
              currentView === "profile" 
                ? "bg-gradient-to-r from-blue-900/20 to-purple-900/20 border border-blue-600/30 text-white shadow-lg" 
                : "bg-gray-800/80 text-gray-400 hover:bg-gray-700/80 hover:text-white border border-gray-600/30"
            }`}
          >
            <User className="h-6 w-6 mb-2" />
            <span className="text-xs font-medium">Profile</span>
          </button>

          <button
            onClick={() => setCurrentView(currentView === "viewer" ? "main" : "viewer")}
            className={`flex flex-col items-center justify-center p-4 rounded-lg transition-all duration-200 ${
              currentView === "viewer" 
                ? "bg-gradient-to-r from-blue-900/20 to-purple-900/20 border border-blue-600/30 text-white shadow-lg" 
                : "bg-gray-800/80 text-gray-400 hover:bg-gray-700/80 hover:text-white border border-gray-600/30"
            }`}
          >
            <Eye className="h-6 w-6 mb-2" />
            <span className="text-xs font-medium">Viewer</span>
          </button>

          <button
            onClick={() => setCurrentView(currentView === "x402" ? "main" : "x402")}
            className={`flex flex-col items-center justify-center p-4 rounded-lg transition-all duration-200 ${
              currentView === "x402" 
                ? "bg-gradient-to-r from-green-900/20 to-blue-900/20 border border-green-600/30 text-white shadow-lg" 
                : "bg-gray-800/80 text-gray-400 hover:bg-gray-700/80 hover:text-white border border-gray-600/30"
            }`}
          >
            <LinkIcon className="h-6 w-6 mb-2" />
            <span className="text-xs font-medium">X402</span>
          </button>

          <button
            onClick={() => setCurrentView(currentView === "agent" ? "main" : "agent")}
            className={`flex flex-col items-center justify-center p-4 rounded-lg transition-all duration-200 ${
              currentView === "agent" 
                ? "bg-gradient-to-r from-blue-900/20 to-purple-900/20 border border-blue-600/30 text-white shadow-lg" 
                : "bg-gray-800/80 text-gray-400 hover:bg-gray-700/80 hover:text-white border border-gray-600/30"
            }`}
          >
            <Bot className="h-6 w-6 mb-2" />
            <span className="text-xs font-medium">Agent</span>
          </button>
        </div>

        {/* Second Row - 4 icons */}
        <div className="grid grid-cols-4 gap-3">
          <button
            onClick={() => setCurrentView(currentView === "chat" ? "main" : "chat")}
            className={`flex flex-col items-center justify-center p-4 rounded-lg transition-all duration-200 ${
              currentView === "chat" 
                ? "bg-gradient-to-r from-purple-900/20 to-pink-900/20 border border-purple-600/30 text-white shadow-lg" 
                : "bg-gray-800/80 text-gray-400 hover:bg-gray-700/80 hover:text-white border border-gray-600/30"
            }`}
          >
            <MessageCircle className="h-6 w-6 mb-2" />
            <span className="text-xs font-medium">Chat</span>
          </button>

          <button
            onClick={() => setCurrentView(currentView === "receipts" ? "main" : "receipts")}
            className={`flex flex-col items-center justify-center p-4 rounded-lg transition-all duration-200 ${
              currentView === "receipts" 
                ? "bg-gradient-to-r from-purple-900/20 to-blue-900/20 border border-purple-600/30 text-white shadow-lg" 
                : "bg-gray-800/80 text-gray-400 hover:bg-gray-700/80 hover:text-white border border-gray-600/30"
            }`}
          >
            <Receipt className="h-6 w-6 mb-2" />
            <span className="text-xs font-medium">Receipts</span>
          </button>

          <button
            onClick={() => setCurrentView(currentView === "rewards" ? "main" : "rewards")}
            className={`flex flex-col items-center justify-center p-4 rounded-lg transition-all duration-200 ${
              currentView === "rewards" 
                ? "bg-gradient-to-r from-yellow-900/20 to-orange-900/20 border border-yellow-600/30 text-white shadow-lg" 
                : "bg-gray-800/80 text-gray-400 hover:bg-gray-700/80 hover:text-white border border-gray-600/30"
            }`}
          >
            <Trophy className="h-6 w-6 mb-2" />
            <span className="text-xs font-medium">Rewards</span>
          </button>

          <button
            onClick={() => setCurrentView(currentView === "privacy" ? "main" : "privacy")}
            className={`flex flex-col items-center justify-center p-4 rounded-lg transition-all duration-200 ${
              currentView === "privacy" 
                ? "bg-gradient-to-r from-gray-900/20 to-slate-900/20 border border-gray-600/30 text-white shadow-lg" 
                : "bg-gray-800/80 text-gray-400 hover:bg-gray-700/80 hover:text-white border border-gray-600/30"
            }`}
          >
            <Umbrella className="h-6 w-6 mb-2" />
            <span className="text-xs font-medium">Privacy</span>
          </button>
        </div>
      </div>
      
      {/* Current view content - flex-1 with height constraint for proper scrolling */}
      <div className="flex-1 relative">
        {renderCurrentView()}
      </div>
    </div>
  );
} 