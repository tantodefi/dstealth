"use client";

import { useState } from "react";
import { Bot, MessageCircle, List, Settings, Trophy, Umbrella, User, Eye, Link as LinkIcon, Search, ChevronDown, ChevronUp } from "lucide-react";
import { Stats } from "./Stats";
import { FkeySearch } from "./FkeySearch";
import TantoConvosChat from "./TantoConvosChat";
import ZkReceipts from "./ZkReceipts";
import GroupChat from "@/examples/GroupChat";
import BotChat from "@/examples/BotChat";
import Proxy402Settings from "./Proxy402Settings";
import { EarningsChart } from "./EarningsChart";
import StevenRewards from "./NinjaRewards";
import Link from "next/link";
import XMTPAgentManager from './XMTPAgentManager';
import StealthScanner from './StealthScanner';
import ViewerComponent from './ViewerComponent';
import X402TestComponent from './X402TestComponent';
import UserProfile from './UserProfile';
import { DebugJWT } from './DebugJWT';
import { ConvosSearch } from './ConvosSearch';

type ViewType = "main" | "search" | "agent" | "chat" | "receipts" | "x402" | "earnings" | "rewards" | "stealth" | "profile" | "viewer";

interface MainInterfaceProps {
  showEarningsChart?: boolean;
  onCloseEarningsChart?: () => void;
}

export default function MainInterface({ showEarningsChart, onCloseEarningsChart }: MainInterfaceProps) {
  const [currentView, setCurrentView] = useState<ViewType>("main");
  const [showActivityStats, setShowActivityStats] = useState(true);

  const renderCurrentView = () => {
    if (showEarningsChart) {
      return <EarningsChart onClose={onCloseEarningsChart || (() => {})} />;
    }

    switch (currentView) {
      case "search":
        return <FkeySearch />;
      case "agent":
        return (
          <div className="space-y-4">
            <BotChat />
            <XMTPAgentManager />
          </div>
        );
      case "chat":
        return (
          <div className="space-y-4">
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
        return <ZkReceipts />;
      case "x402":
        return <X402TestComponent />;
      case "earnings":
        return <EarningsChart onClose={() => setCurrentView("main")} />;
      case "rewards":
        return <StevenRewards />;
      case "stealth":
        return <StealthScanner />;
      case "profile":
        return <UserProfile address="0x0000000000000000000000000000000000000000" />;
      case "viewer":
        return <ViewerComponent />;
      default:
        return (
          <div className="space-y-4">
            {/* Debug JWT Component - Temporary for troubleshooting */}
            <DebugJWT />
            
            {/* Always show search component prominently */}
            <div className="bg-gradient-to-r from-blue-900/20 to-purple-900/20 border border-blue-600/30 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-3">
                <Search className="h-5 w-5 text-blue-400" />
                <h2 className="text-lg font-semibold text-white">User Search</h2>
                <span className="text-sm text-blue-300">Find stealth address to pay</span>
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
                    <h3 className="text-lg font-semibold text-white">Activity Dashboard</h3>
                    <p className="text-sm text-gray-400">Privacy actions, earnings, and user metrics</p>
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
          </div>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Enhanced Navigation Icons - Two Rows */}
      <div className="w-full">        
        {/* First Row - 4 icons */}
        <div className="grid grid-cols-4 gap-3 mb-3">
          <button
            onClick={() => setCurrentView(currentView === "profile" ? "main" : "profile")}
            className={`flex flex-col items-center justify-center p-4 rounded-lg transition-all duration-200 ${
              currentView === "profile" 
                ? "bg-gradient-to-r from-blue-900/20 to-purple-900/20 border border-blue-600/30 text-white shadow-lg" 
                : "bg-gray-800/80 text-gray-400 hover:bg-gray-700/80 hover:text-white border border-gray-600/30"
            }`}
            title="User Profile"
          >
            <User className="h-9 w-9 mb-1" />
            <span className="text-xs font-medium text-white">Profile</span>
          </button>
          
          <button
            onClick={() => setCurrentView(currentView === "viewer" ? "main" : "viewer")}
            className={`flex flex-col items-center justify-center p-4 rounded-lg transition-all duration-200 ${
              currentView === "viewer" 
                ? "bg-gradient-to-r from-blue-900/20 to-purple-900/20 border border-blue-600/30 text-white shadow-lg" 
                : "bg-gray-800/80 text-gray-400 hover:bg-gray-700/80 hover:text-white border border-gray-600/30"
            }`}
            title="Content Viewer"
          >
            <Eye className="h-9 w-9 mb-1" />
            <span className="text-xs font-medium text-white">Viewer</span>
          </button>
          
          <button
            onClick={() => setCurrentView(currentView === "x402" ? "main" : "x402")}
            className={`flex flex-col items-center justify-center p-4 rounded-lg transition-all duration-200 ${
              currentView === "x402" 
                ? "bg-gradient-to-r from-blue-900/20 to-purple-900/20 border border-blue-600/30 text-white shadow-lg" 
                : "bg-gray-800/80 text-gray-400 hover:bg-gray-700/80 hover:text-white border border-gray-600/30"
            }`}
            title="X402 Test Tool & Link Creator"
          >
            <LinkIcon className="h-9 w-9 mb-1" />
            <span className="text-xs font-medium text-white">X402</span>
          </button>
          
          <button
            onClick={() => setCurrentView(currentView === "agent" ? "main" : "agent")}
            className={`flex flex-col items-center justify-center p-4 rounded-lg transition-all duration-200 ${
              currentView === "agent" 
                ? "bg-gradient-to-r from-blue-900/20 to-purple-900/20 border border-blue-600/30 text-white shadow-lg" 
                : "bg-gray-800/80 text-gray-400 hover:bg-gray-700/80 hover:text-white border border-gray-600/30"
            }`}
            title="X402 Agent Chat & Management"
          >
            <Bot className="h-9 w-9 mb-1" />
            <span className="text-xs font-medium text-white">Agent</span>
          </button>
        </div>

        {/* Second Row - 4 icons */}
        <div className="grid grid-cols-4 gap-3">
          <button
            onClick={() => setCurrentView(currentView === "chat" ? "main" : "chat")}
            className={`flex flex-col items-center justify-center p-4 rounded-lg transition-all duration-200 ${
              currentView === "chat" 
                ? "bg-gradient-to-r from-blue-900/20 to-purple-900/20 border border-blue-600/30 text-white shadow-lg" 
                : "bg-gray-800/80 text-gray-400 hover:bg-gray-700/80 hover:text-white border border-gray-600/30"
            }`}
            title="Group status & dev chat"
          >
            <MessageCircle className="h-9 w-9 mb-1" />
            <span className="text-xs font-medium text-white">Chat</span>
          </button>
          
          <button
            onClick={() => setCurrentView(currentView === "receipts" ? "main" : "receipts")}
            className={`flex flex-col items-center justify-center p-4 rounded-lg transition-all duration-200 ${
              currentView === "receipts" 
                ? "bg-gradient-to-r from-blue-900/20 to-purple-900/20 border border-blue-600/30 text-white shadow-lg" 
                : "bg-gray-800/80 text-gray-400 hover:bg-gray-700/80 hover:text-white border border-gray-600/30"
            }`}
            title="ZK receipts"
          >
            <List className="h-9 w-9 mb-1" />
            <span className="text-xs font-medium text-white">Receipts</span>
          </button>

          <button
            onClick={() => setCurrentView(currentView === "rewards" ? "main" : "rewards")}
            className={`flex flex-col items-center justify-center p-4 rounded-lg transition-all duration-200 ${
              currentView === "rewards" 
                ? "bg-gradient-to-r from-blue-900/20 to-purple-900/20 border border-blue-600/30 text-white shadow-lg" 
                : "bg-gray-800/80 text-gray-400 hover:bg-gray-700/80 hover:text-white border border-gray-600/30"
            }`}
            title="Ninja Rewards"
          >
            <Trophy className="h-9 w-9 mb-1" />
            <span className="text-xs font-medium text-white">Rewards</span>
          </button>

          <button
            onClick={() => setCurrentView(currentView === "stealth" ? "main" : "stealth")}
            className={`flex flex-col items-center justify-center p-4 rounded-lg transition-all duration-200 ${
              currentView === "stealth" 
                ? "bg-gradient-to-r from-blue-900/20 to-purple-900/20 border border-blue-600/30 text-white shadow-lg" 
                : "bg-gray-800/80 text-gray-400 hover:bg-gray-700/80 hover:text-white border border-gray-600/30"
            }`}
            title="Stealth Address Scanner - Base & Veil Cash Privacy"
          >
            <Umbrella className="h-9 w-9 mb-1" />
            <span className="text-xs font-medium text-white">Privacy</span>
          </button>
        </div>
      </div>
      
      {/* Current view content */}
      {renderCurrentView()}
    </div>
  );
} 