import { fileURLToPath } from "node:url";
import createJITI from "jiti";
import { createRequire } from "node:module";

const jiti = createJITI(fileURLToPath(import.meta.url));
jiti("./src/lib/env.ts");

// Create require function for ES modules
const require = createRequire(import.meta.url);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        hostname: "**",
        protocol: "https",
      },
    ],
  },
  transpilePackages: [
    '@farcaster/frame-wagmi-connector', 
    '@farcaster/frame-sdk',
    '@daimo/pay',
    '@solana/wallet-adapter-react',
    '@solana/wallet-adapter-wallets',
    '@solana/web3.js',
    '@farcaster/auth-client',
  ],

  experimental: {
    // Enable optimizations for production builds
    optimizeCss: true,
    optimizePackageImports: [
      '@headlessui/react',
      '@heroicons/react',
      'lucide-react',
    ],
  },
  webpack: (config, { isServer, webpack }) => {
    // Add extensionAlias for .js
    config.resolve = config.resolve || {};
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
    };
    
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: require.resolve('crypto-browserify'),
        stream: require.resolve('stream-browserify'),
        assert: require.resolve('assert'),
        http: require.resolve('stream-http'),
        https: require.resolve('https-browserify'),
        os: require.resolve('os-browserify'),
        url: require.resolve('url'),
        zlib: require.resolve('browserify-zlib'),
        path: require.resolve('path-browserify'),
        fs: false,
        net: false,
        tls: false,
      };

      // Add webpack plugins for Node.js compatibility
      config.plugins.push(
        new webpack.ProvidePlugin({
          Buffer: ['buffer', 'Buffer'],
          process: 'process/browser',
        })
      );

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
    
    // Always exclude these from bundling
    config.externals.push("pino-pretty", "lokijs");
    
    return config;
  },
};

export default nextConfig;
