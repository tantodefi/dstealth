"use client";

import { useState } from 'react';
import { Settings } from './Settings';

export default function SettingsButton() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setIsSettingsOpen(true)}
        className="text-blue-400 hover:text-blue-300 transition-colors px-2 py-1.5 rounded-md border border-gray-200 bg-gray-900"
        title="Settings"
      >
        Settings
      </button>

      {/* Settings modal */}
      <Settings
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </>
  );
} 