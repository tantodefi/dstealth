import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('5001'),
  FRONTEND_URL: z.string().url().default('https://xmtp-mini-app-examples.vercel.app'),
  
  // XMTP Configuration
  WALLET_KEY: z.string(),
  API_SECRET_KEY: z.string(),
  ENCRYPTION_KEY: z.string(),
  XMTP_ENV: z.enum(['local', 'dev', 'production']).default('dev'),
  
  // X402 Protocol Integration
  X402_JWT_SECRET: z.string().optional(),
  
  // Webhook Configuration
  WEBHOOK_SECRET: z.string().optional(),
  
  // Reclaim Protocol Configuration
  RECLAIM_APP_ID: z.string({
    required_error: "RECLAIM_APP_ID is required. Get it from https://docs.reclaimprotocol.org/"
  }),
  RECLAIM_APP_SECRET: z.string({
    required_error: "RECLAIM_APP_SECRET is required. Get it from https://docs.reclaimprotocol.org/"
  }),

  // dStealth Agent Configuration
  OPENAI_API_KEY: z.string().optional(),
  
  // AgentKit Configuration
  CDP_API_KEY_NAME: z.string().optional(),
  CDP_API_KEY_PRIVATE_KEY: z.string().optional(),
  CDP_WALLET_DATA: z.string().optional(),
  
  // Proxy402 Configuration
  PROXY402_JWT_SECRET: z.string().optional(),
  
  // Redis/Upstash Configuration
  REDIS_URL: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
});

const env = envSchema.parse(process.env);

export { env }; 