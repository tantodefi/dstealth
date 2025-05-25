import { useState } from "react";

interface SearchBarProps {
  onSearch: (username: string) => Promise<void>;
  isLoading?: boolean;
  error?: string | null;
  recoveredAddress?: string | null;
}

export function SearchBar({ onSearch, isLoading, error, recoveredAddress }: SearchBarProps) {
  const [username, setUsername] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    await onSearch(username.trim());
  };

  const getBorderColor = () => {
    if (error) return "border-red-500";
    if (recoveredAddress) return "border-green-500";
    return "border-gray-700";
  };

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <div className="relative flex items-center">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Search username"
            className={`w-full px-4 py-2 bg-gray-900 text-white rounded-lg 
              ${getBorderColor()} 
              focus:outline-none focus:ring-2 focus:ring-blue-500
              transition-colors duration-200`}
            disabled={isLoading}
          />
          <span className="absolute right-24 text-gray-400">.fkey.id</span>
          <button
            type="submit"
            disabled={isLoading || !username.trim()}
            className={`ml-2 px-4 py-2 rounded-lg 
              ${isLoading ? 'bg-gray-700 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'} 
              text-white font-medium transition-colors duration-200`}>
            {isLoading ? "Searching..." : "Search"}
          </button>
        </div>
      </form>
      
      {error && (
        <p className="mt-2 text-red-500 text-sm">{error}</p>
      )}
      
      {recoveredAddress && (
        <div className="mt-2 p-3 bg-gray-800 rounded-lg">
          <p className="text-green-400 text-sm font-medium">Profile found!</p>
          <p className="text-gray-300 text-sm font-mono mt-1">
            Address: {recoveredAddress}
          </p>
        </div>
      )}
    </div>
  );
} 