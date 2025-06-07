import { z } from 'zod';

const envSchema = z.object({
  NEXT_PUBLIC_BACKEND_URL: z.string().url().default('https://xmtp-mini-app-examples.onrender.com'),
  PONDER_GRAPHQL_URL: z.string().url().optional(),
  PONDER_RPC_URL_1: z.string().url().default('https://mainnet.llamarpc.com'),
  PONDER_RPC_URL_8453: z.string().url().default('https://base.llamarpc.com'),
  PONDER_RPC_URL_11155111: z.string().url().default('https://sepolia.llamarpc.com'),
  PONDER_RPC_URL_84532: z.string().url().default('https://base-sepolia.llamarpc.com'),
});

export const env = envSchema.parse(process.env); 