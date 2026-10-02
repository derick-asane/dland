import http from 'node:http';
import { env } from './config/env';
import { createApp } from './app';
import { prisma } from './lib/prisma';
import { ensureGenesisBlock } from './blockchain/ledger';
import { migratePrivateFiles } from './lib/migratePrivateFiles';
import { attachRealtime, closeRealtime } from './lib/realtime';
import { startDispatcher, stopDispatcher } from './lib/dispatcher';
import { startPaymentReconciler, stopPaymentReconciler } from './lib/payments/service';

async function main() {
  await prisma.$connect();
  await ensureGenesisBlock();
  await migratePrivateFiles();
  // One HTTP server for the REST API and the live connection (Socket.IO).
  const server = http.createServer(createApp());
  attachRealtime(server);
  startDispatcher();
  startPaymentReconciler();
  server.listen(env.PORT, '0.0.0.0', () => {
    console.log(`DLand API listening on http://0.0.0.0:${env.PORT}`);
    const fee = env.LISTING_FEE_AMOUNT ? `${env.LISTING_FEE_AMOUNT} ${env.LISTING_FEE_CURRENCY}` : 'free';
    console.log(`Listing fee: ${fee} · payments: ${env.PAYMENT_PROVIDER}${env.PAYMENT_PROVIDER === 'campay' ? ` (${env.CAMPAY_ENV})` : ''}`);
  });

  const shutdown = async () => {
    stopDispatcher();
    stopPaymentReconciler();
    await closeRealtime();
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
