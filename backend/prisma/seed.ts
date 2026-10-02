/**
 * Creates the staff accounts and the chain's genesis block. Safe to run again:
 * existing accounts are left untouched.
 *
 *   admin@dland.app   / Password123!
 *   notary@dland.app  / Password123!
 *
 * Change these passwords after the first sign-in.
 */
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Role } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { ensureGenesisBlock } from '../src/blockchain/ledger';
import { walletAddressFor } from '../src/utils/crypto';

const PASSWORD = 'Password123!';

async function upsertUser(email: string, firstName: string, lastName: string, role: Role, extra: Record<string, string> = {}) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  const id = randomUUID();
  return prisma.user.create({
    data: {
      id,
      email,
      firstName,
      lastName,
      role,
      passwordHash: await bcrypt.hash(PASSWORD, 12),
      walletAddress: walletAddressFor(id),
      city: 'Douala',
      country: 'Cameroon',
      ...extra,
    },
  });
}

async function main() {
  await ensureGenesisBlock();
  await upsertUser('admin@dland.app', 'Ada', 'Admin', 'ADMIN');
  // The notary adds their escrow account in the app (Profile → Escrow account) before taking sale files.
  await upsertUser('notary@dland.app', 'Nora', 'Notaire', 'NOTARY', { licenseNumber: 'NOT-CM-2021-0042' });
  console.log('Seed complete. Accounts (password: %s): admin@dland.app, notary@dland.app', PASSWORD);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
