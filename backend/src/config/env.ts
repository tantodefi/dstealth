import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('3001'),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  
  // XMTP Configuration
  WALLET_KEY: z.string(),
  API_SECRET_KEY: z.string(),
  ENCRYPTION_KEY: z.string(),
  XMTP_ENV: z.enum(['local', 'dev', 'production']).default('dev'),
  
  // Reclaim Protocol Configuration
  RECLAIM_APP_ID: z.string({
    required_error: "RECLAIM_APP_ID is required. Get it from https://docs.reclaimprotocol.org/"
  }),
  RECLAIM_APP_SECRET: z.string({
    required_error: "RECLAIM_APP_SECRET is required. Get it from https://docs.reclaimprotocol.org/"
  })
});

export const env = envSchema.parse(process.env); 