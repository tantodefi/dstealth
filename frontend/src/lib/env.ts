import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

// https://env.t3.gg/docs/nextjs
export const env = createEnv({
  server: {
    NEYNAR_API_KEY: z.string().default("NEYNAR_API_DOCS"),
    JWT_SECRET: z.string().min(1),
    API_SECRET_KEY: z.string().min(1),
    BACKEND_URL: z.string().url().min(1),
  },
  client: {
    NEXT_PUBLIC_URL: z.string().url().min(1),
    NEXT_PUBLIC_APP_ENV: z
      .enum(["development", "production"])
      .optional()
      .default("development"),
    NEXT_PUBLIC_ENCRYPTION_KEY: z.string().min(1),
    NEXT_PUBLIC_XMTP_ENV: z.enum(["production", "local", "dev"]).default("dev"),
    // Farcaster Manifest
    NEXT_PUBLIC_FARCASTER_HEADER: z.string().min(1),
    NEXT_PUBLIC_FARCASTER_PAYLOAD: z.string().min(1),
    NEXT_PUBLIC_FARCASTER_SIGNATURE: z.string().min(1),
    // Whisk Identity Kit
    NEXT_PUBLIC_WHISK_API_KEY: z.string().min(1),
    // OnchainKit API Key
    NEXT_PUBLIC_ONCHAINKIT_API_KEY: z.string().min(1),
    // Backend URL
    NEXT_PUBLIC_BACKEND_URL: z.string().url().default('http://localhost:3001'),
  },
  // For Next.js >= 13.4.4, you only need to destructure client variables:
  experimental__runtimeEnv: {
    NEXT_PUBLIC_ENCRYPTION_KEY: process.env.NEXT_PUBLIC_ENCRYPTION_KEY,
    NEXT_PUBLIC_URL: process.env.NEXT_PUBLIC_URL,
    NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
    NEXT_PUBLIC_XMTP_ENV: process.env.NEXT_PUBLIC_XMTP_ENV,
    NEXT_PUBLIC_FARCASTER_HEADER: process.env.NEXT_PUBLIC_FARCASTER_HEADER,
    NEXT_PUBLIC_FARCASTER_PAYLOAD: process.env.NEXT_PUBLIC_FARCASTER_PAYLOAD,
    NEXT_PUBLIC_FARCASTER_SIGNATURE:
      process.env.NEXT_PUBLIC_FARCASTER_SIGNATURE,
    NEXT_PUBLIC_WHISK_API_KEY: process.env.NEXT_PUBLIC_WHISK_API_KEY,
    NEXT_PUBLIC_ONCHAINKIT_API_KEY: process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY,
    NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL,
  },
});
