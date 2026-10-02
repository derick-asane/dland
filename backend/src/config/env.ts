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
  // Platform fees, paid with MTN MoMo / Orange Money. 0 makes listing free.
  LISTING_FEE_AMOUNT: z.coerce.number().int().min(0).default(5000),
  LISTING_FEE_CURRENCY: z.string().length(3).default('XAF'),
  // "simulator" fakes the mobile money provider (development only); "campay" collects for real.
  PAYMENT_PROVIDER: z.enum(['simulator', 'campay']).default('simulator'),
  CAMPAY_ENV: z.enum(['demo', 'live']).default('demo'),
  // Optional override of the API address (defaults to demo.campay.net / www.campay.net per CAMPAY_ENV).
  CAMPAY_BASE_URL: z.string().url().optional(),
  // Either a permanent access token, or the app username/password (a temporary token is fetched).
  CAMPAY_TOKEN: z.string().optional(),
  CAMPAY_USERNAME: z.string().optional(),
  CAMPAY_PASSWORD: z.string().optional(),
  // Signs Campay's webhook calls (Campay dashboard → your app → Webhook key).
  CAMPAY_WEBHOOK_KEY: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

// Never accept fake payments in production.
if (env.NODE_ENV === 'production' && env.PAYMENT_PROVIDER === 'simulator' && env.LISTING_FEE_AMOUNT > 0) {
  console.error('PAYMENT_PROVIDER=simulator is not allowed in production. Set PAYMENT_PROVIDER=campay (or LISTING_FEE_AMOUNT=0).');
  process.exit(1);
}
if (env.PAYMENT_PROVIDER === 'campay' && !env.CAMPAY_TOKEN && !(env.CAMPAY_USERNAME && env.CAMPAY_PASSWORD)) {
  console.error('PAYMENT_PROVIDER=campay needs CAMPAY_TOKEN, or CAMPAY_USERNAME and CAMPAY_PASSWORD.');
  process.exit(1);
}
