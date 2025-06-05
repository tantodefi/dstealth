import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

// https://env.t3.gg/docs/nextjs
export const env = createEnv({
  server: {
    NEYNAR_API_KEY: z.string().default("NEYNAR_API_DOCS"),
    JWT_SECRET: z.string().min(1).optional(),
    API_SECRET_KEY: z.string().min(1).optional(),
    BACKEND_URL: z.string().url().optional(),
  },
  client: {
    NEXT_PUBLIC_URL: z.string().url().min(1).optional(),
    NEXT_PUBLIC_APP_ENV: z
      .enum(["development", "production"])
      .optional()
      .default("production"),
    NEXT_PUBLIC_ENCRYPTION_KEY: z.string().min(1).optional(),
    NEXT_PUBLIC_XMTP_ENV: z.enum(["production", "local", "dev"]).default("production"),
    // Farcaster Manifest
    NEXT_PUBLIC_FARCASTER_HEADER: z.string().min(1).optional(),
    NEXT_PUBLIC_FARCASTER_PAYLOAD: z.string().min(1).optional(),
    NEXT_PUBLIC_FARCASTER_SIGNATURE: z.string().min(1).optional(),
    // OnchainKit API Key
    NEXT_PUBLIC_ONCHAINKIT_API_KEY: z.string().min(1).optional(),
    // Backend URL
    NEXT_PUBLIC_BACKEND_URL: z.string().url().default('https://xmtp-mini-app-examples.onrender.com'),
    // Add defaults to prevent crashes during development
    NEXT_PUBLIC_ETHERSCAN_API_KEY: z.string().default("development_key"),
    NEXT_PUBLIC_FARCASTER_APP_FID: z.string().default("0"),
    NEXT_PUBLIC_FARCASTER_DEVELOPER_MNEMONIC: z.string().default("development_mnemonic"),
    NEXT_PUBLIC_FARCASTER_DEVELOPER_FID: z.string().default("0"),
    NEXT_PUBLIC_PROXY402_JWT: z.string().default(""),
    NEXT_PUBLIC_HUB_HTTP_URL: z.string().default("https://nemes.farcaster.xyz:2281"),
    NEXT_PUBLIC_HUB_FALLBACK_URL: z.string().default("https://hoyt.farcaster.xyz:2281"),
  },
  // For Next.js >= 13.4.4, you only need to destructure client variables:
  experimental__runtimeEnv: {
    NEXT_PUBLIC_ENCRYPTION_KEY: process.env.NEXT_PUBLIC_ENCRYPTION_KEY,
    NEXT_PUBLIC_URL: process.env.NEXT_PUBLIC_URL,
    NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
    NEXT_PUBLIC_XMTP_ENV: process.env.NEXT_PUBLIC_XMTP_ENV,
    NEXT_PUBLIC_FARCASTER_HEADER: process.env.NEXT_PUBLIC_FARCASTER_HEADER,
    NEXT_PUBLIC_FARCASTER_PAYLOAD: process.env.NEXT_PUBLIC_FARCASTER_PAYLOAD,
    NEXT_PUBLIC_FARCASTER_SIGNATURE: process.env.NEXT_PUBLIC_FARCASTER_SIGNATURE,
    NEXT_PUBLIC_ONCHAINKIT_API_KEY: process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY,
    NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL,
    NEXT_PUBLIC_ETHERSCAN_API_KEY: process.env.NEXT_PUBLIC_ETHERSCAN_API_KEY,
    NEXT_PUBLIC_FARCASTER_APP_FID: process.env.NEXT_PUBLIC_FARCASTER_APP_FID,
    NEXT_PUBLIC_FARCASTER_DEVELOPER_MNEMONIC: process.env.NEXT_PUBLIC_FARCASTER_DEVELOPER_MNEMONIC,
    NEXT_PUBLIC_FARCASTER_DEVELOPER_FID: process.env.NEXT_PUBLIC_FARCASTER_DEVELOPER_FID,
    NEXT_PUBLIC_PROXY402_JWT: process.env.NEXT_PUBLIC_PROXY402_JWT,
    NEXT_PUBLIC_HUB_HTTP_URL: process.env.NEXT_PUBLIC_HUB_HTTP_URL,
    NEXT_PUBLIC_HUB_FALLBACK_URL: process.env.NEXT_PUBLIC_HUB_FALLBACK_URL,
  },
});
