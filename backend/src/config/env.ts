import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  PUBLIC_URL: z.string().default('http://localhost:4000'),
  CORS_ORIGIN: z.string().default('*'),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(8),
  JWT_REFRESH_SECRET: z.string().min(8),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_DAYS: z.coerce.number().default(30),
  CHAIN_DIFFICULTY: z.coerce.number().int().min(0).max(6).default(3),
  CHAIN_SIGNER_PRIVATE_KEY_B64: z.string().optional(),
  ANCHOR_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  ANCHOR_RPC_URL: z.string().optional(),
  ANCHOR_PRIVATE_KEY: z.string().optional(),
  ANCHOR_CONTRACT_ADDRESS: z.string().optional(),
  MAX_UPLOAD_MB: z.coerce.number().default(10),
  // Private documents (title deeds, IDs, receipts): folder outside the public /uploads,
  // secret used to sign the temporary download links, and how long a link stays valid.
  PRIVATE_STORAGE_DIR: z.string().optional(),
  FILES_SIGNING_SECRET: z.string().min(16).optional(),
  FILE_LINK_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
