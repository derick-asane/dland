import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  // Storage keys of private files are never returned unless a query asks for them explicitly
  // (`omit: { storageKey: false }`), so they cannot leak into an API response by accident.
  omit: {
    landDocument: { storageKey: true },
    transferStep: { proofKey: true },
  },
});

/** A Prisma client usable both inside and outside an interactive transaction. */
export type Tx = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>;
