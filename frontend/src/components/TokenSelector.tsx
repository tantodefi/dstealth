"use client";

// Define token types locally since they're not exported from SendButton
type SupportedToken = "USDC" | "EURC" | "WETH" | "cbBTC";

const SUPPORTED_TOKENS = {
  USDC: { symbol: "USDC", name: "USD Coin" },
  EURC: { symbol: "EURC", name: "Euro Coin" },
  WETH: { symbol: "WETH", name: "Wrapped Ether" },
  cbBTC: { symbol: "cbBTC", name: "Coinbase Wrapped BTC" }
};

interface TokenSelectorProps {
  selectedToken: SupportedToken;
  onTokenSelect: (token: SupportedToken) => void;
}

const TOKEN_ICONS = {
  USDC: "https://d3r81g40ycuhqg.cloudfront.net/wallet/wais/44/2b/442b80bd16af0c0d9b22e03a16753823fe826e5bfd457292b55fa0ba8c1ba213-ZWUzYjJmZGUtMDYxNy00NDcyLTg0NjQtMWI4OGEwYjBiODE2",
  EURC: "https://d3r81g40ycuhqg.cloudfront.net/wallet/wais/44/2b/442b80bd16af0c0d9b22e03a16753823fe826e5bfd457292b55fa0ba8c1ba213-ZWUzYjJmZGUtMDYxNy00NDcyLTg0NjQtMWI4OGEwYjBiODE2",
  WETH: "https://wallet-api-production.s3.amazonaws.com/uploads/tokens/eth_288.png",
  cbBTC: "https://d3r81g40ycuhqg.cloudfront.net/wallet/wais/d0/d7/d0d7784975771dbbac9a22c8c0c12928cc6f658cbcf2bbbf7c909f0fa2426dec-NmU4ZWViMDItOTQyYy00Yjk5LTkzODUtNGJlZmJiMTUxOTgy"
};

export default function TokenSelector({
  selectedToken,
  onTokenSelect,
}: TokenSelectorProps) {
  return (
    <div className="w-full">
      <label className="block text-sm font-medium text-gray-300 mb-2">
        Select Token
      </label>
      <div className="relative">
        <select
          value={selectedToken}
          onChange={(e) => onTokenSelect(e.target.value as SupportedToken)}
          className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg pl-10 pr-4 py-2.5 appearance-none focus:ring-blue-500 focus:border-blue-500"
        >
          {Object.entries(SUPPORTED_TOKENS).map(([key, token]) => (
            <option key={key} value={key}>
              {token.symbol} - {token.name}
            </option>
          ))}
        </select>
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <img
            src={TOKEN_ICONS[selectedToken]}
            alt={selectedToken}
            className="w-5 h-5 rounded-full"
          />
        </div>
        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
          <svg
            className="h-5 w-5 text-gray-400"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M10 3a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414L10 5.414 7.707 7.707a1 1 0 01-1.414-1.414l3-3A1 1 0 0110 3zm-3.707 9.293a1 1 0 011.414 0L10 14.586l2.293-2.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </div>
    </div>
  );
} 