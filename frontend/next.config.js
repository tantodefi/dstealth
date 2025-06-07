import { fileURLToPath } from "node:url";
import createJITI from "jiti";

const jiti = createJITI(fileURLToPath(import.meta.url));
jiti("./src/lib/env.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        hostname: "**",
        protocol: "https",
      },
    ],
  },
  transpilePackages: ['@farcaster/frame-wagmi-connector', '@farcaster/frame-sdk'],
  webpack: (config, { isServer }) => {
    // Add extensionAlias for .js
    config.resolve = config.resolve || {};
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
    };
    
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        ws: false,
        lokijs: false,
        "pino-pretty": false,
      };

      config.module.rules.push({
        test: /\.node$/,
        loader: "null-loader",
      });

      // Handle WalletConnect WebSocket dependencies
      config.resolve.alias = {
        ...config.resolve.alias,
        'ws': false,
      };
      
      // Ignore WalletConnect WebSocket modules in browser
      config.externals = config.externals || [];
      config.externals.push({
        'ws': 'WebSocket',
        'utf-8-validate': 'commonjs utf-8-validate',
        'bufferutil': 'commonjs bufferutil',
      });
    }
    config.externals.push("pino-pretty", "lokijs");
    return config;
  },
};

export default nextConfig;
