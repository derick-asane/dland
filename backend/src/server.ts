import { env } from './config/env';
import { createApp } from './app';
import { prisma } from './lib/prisma';
import { ensureGenesisBlock } from './blockchain/ledger';
import { migratePrivateFiles } from './lib/migratePrivateFiles';

async function main() {
  await prisma.$connect();
  await ensureGenesisBlock();
  await migratePrivateFiles();
  const app = createApp();
  const server = app.listen(env.PORT, '0.0.0.0', () => {
    console.log(`DLand API listening on http://0.0.0.0:${env.PORT}`);
  });

  const shutdown = async () => {
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
