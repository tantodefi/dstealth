"use client";

import { useState } from "react";
import { Search, Bot, MessageCircle, List, Settings } from "lucide-react";
import { CollapsibleConnectionInfo } from "./CollapsibleConnectionInfo";
import { Stats } from "./Stats";
import { FkeySearch } from "./FkeySearch";
import TantoConvosChat from "./TantoConvosChat";
import ZkReceipts from "./ZkReceipts";
import GroupChat from "@/examples/GroupChat";
import BotChat from "@/examples/BotChat";
import Proxy402Settings from "./Proxy402Settings";
import { EarningsChart } from "./EarningsChart";

type ViewType = "main" | "search" | "bot" | "chat" | "receipts" | "settings" | "earnings";

interface MainInterfaceProps {
  showEarningsChart?: boolean;
  onCloseEarningsChart?: () => void;
}

export default function MainInterface({ showEarningsChart, onCloseEarningsChart }: MainInterfaceProps) {
  const [currentView, setCurrentView] = useState<ViewType>("main");
  const [showSettings, setShowSettings] = useState(false);

  // Set view to earnings when showEarningsChart becomes true
  if (showEarningsChart && currentView !== "earnings") {
    setCurrentView("earnings");
    setShowSettings(false);
  }

  const renderView = () => {
    switch (currentView) {
      case "search":
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <Search className="h-5 w-5 text-blue-400" />
              <h2 className="text-xl font-bold text-white">.fkey.id Search</h2>
            </div>
            <FkeySearch />
          </div>
        );
      case "bot":
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <Bot className="h-5 w-5 text-green-400" />
              <h2 className="text-xl font-bold text-white">Bot Chat</h2>
            </div>
            <BotChat />
          </div>
        );
      case "chat":
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <MessageCircle className="h-5 w-5 text-purple-400" />
              <h2 className="text-xl font-bold text-white">Group Chat & Dev Chat</h2>
            </div>
            <GroupChat />
            <div className="mt-6">
              <TantoConvosChat />
            </div>
          </div>
        );
      case "receipts":
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <List className="h-5 w-5 text-yellow-400" />
              <h2 className="text-xl font-bold text-white">ZK Receipts</h2>
            </div>
            <ZkReceipts />
          </div>
        );
      case "earnings":
        return (
          <div className="space-y-4">
            <EarningsChart onClose={() => {
              if (onCloseEarningsChart) {
                onCloseEarningsChart();
              }
              setCurrentView("main");
            }} />
          </div>
        );
      default:
        return (
          <div className="space-y-4">
            <Stats />
            <div className="p-6 bg-gray-800 rounded-lg text-center">
              <h2 className="text-xl font-bold text-white mb-4">Welcome to XMTP Mini App</h2>
              <p className="text-gray-400 mb-4">
                Select an option from the navigation bar or click below to get started
              </p>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <button
                  onClick={() => setCurrentView("search")}
                  className="p-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors cursor-pointer group"
                >
                  <Search className="h-6 w-6 text-blue-400 mx-auto mb-2 group-hover:text-blue-300 transition-colors" />
                  <p className="text-white font-medium group-hover:text-blue-100">Search</p>
                  <p className="text-gray-400 text-xs group-hover:text-gray-300">Find .fkey.id users</p>
                </button>
                <button
                  onClick={() => setCurrentView("bot")}
                  className="p-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors cursor-pointer group"
                >
                  <Bot className="h-6 w-6 text-green-400 mx-auto mb-2 group-hover:text-green-300 transition-colors" />
                  <p className="text-white font-medium group-hover:text-green-100">Bot</p>
                  <p className="text-gray-400 text-xs group-hover:text-gray-300">Chat with AI bot</p>
                </button>
                <button
                  onClick={() => setCurrentView("chat")}
                  className="p-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors cursor-pointer group"
                >
                  <MessageCircle className="h-6 w-6 text-purple-400 mx-auto mb-2 group-hover:text-purple-300 transition-colors" />
                  <p className="text-white font-medium group-hover:text-purple-100">Chat</p>
                  <p className="text-gray-400 text-xs group-hover:text-gray-300">Group & dev chat</p>
                </button>
                <button
                  onClick={() => setCurrentView("receipts")}
                  className="p-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors cursor-pointer group"
                >
                  <List className="h-6 w-6 text-yellow-400 mx-auto mb-2 group-hover:text-yellow-300 transition-colors" />
                  <p className="text-white font-medium group-hover:text-yellow-100">Receipts</p>
                  <p className="text-gray-400 text-xs group-hover:text-gray-300">ZK payment proofs</p>
                </button>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Header with connection status and navigation */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <CollapsibleConnectionInfo />
        </div>
        
        {/* Navigation Icons */}
        <div className="flex gap-2">
          <button
            onClick={() => setCurrentView(currentView === "search" ? "main" : "search")}
            className={`p-2 rounded-lg transition-colors ${
              currentView === "search" 
                ? "bg-blue-600 text-white" 
                : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white"
            }`}
            title="Search .fkey.id users"
          >
            <Search className="h-5 w-5" />
          </button>
          
          <button
            onClick={() => setCurrentView(currentView === "bot" ? "main" : "bot")}
            className={`p-2 rounded-lg transition-colors ${
              currentView === "bot" 
                ? "bg-green-600 text-white" 
                : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white"
            }`}
            title="Bot chat"
          >
            <Bot className="h-5 w-5" />
          </button>
          
          <button
            onClick={() => setCurrentView(currentView === "chat" ? "main" : "chat")}
            className={`p-2 rounded-lg transition-colors ${
              currentView === "chat" 
                ? "bg-purple-600 text-white" 
                : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white"
            }`}
            title="Group status & dev chat"
          >
            <MessageCircle className="h-5 w-5" />
          </button>
          
          <button
            onClick={() => setCurrentView(currentView === "receipts" ? "main" : "receipts")}
            className={`p-2 rounded-lg transition-colors ${
              currentView === "receipts" 
                ? "bg-yellow-600 text-white" 
                : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white"
            }`}
            title="ZK receipts"
          >
            <List className="h-5 w-5" />
          </button>
          
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2 rounded-lg transition-colors ${
              showSettings 
                ? "bg-gray-600 text-white" 
                : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white"
            }`}
            title="Settings"
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Settings panel (when gear is clicked) */}
      {showSettings && (
        <div className="p-4 bg-gray-800 rounded-lg border border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-gray-400" />
              <h3 className="text-lg font-semibold text-white">Settings</h3>
            </div>
            <button
              onClick={() => setShowSettings(false)}
              className="text-gray-400 hover:text-white text-sm"
            >
              Close
            </button>
          </div>
          <Proxy402Settings />
        </div>
      )}

      {/* Main content area */}
      {renderView()}
    </div>
  );
} 