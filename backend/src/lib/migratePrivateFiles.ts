import fs from 'node:fs';
import path from 'node:path';
import { UPLOAD_DIR } from '../middleware/upload';
import { prisma } from './prisma';
import { isValidKey, privateFilePath } from './storage';

/**
 * One-time move of documents and receipts uploaded before private storage existed: they were
 * saved under the public /uploads folder and referenced as "/uploads/<file>". Safe to run at
 * every start: rows already migrated hold a bare storage key and are skipped.
 */
export async function migratePrivateFiles() {
  const legacyDocs = await prisma.landDocument.findMany({
    where: { storageKey: { startsWith: '/uploads/' } },
    select: { id: true, storageKey: true },
  });
  const legacyProofs = await prisma.transferStep.findMany({
    where: { proofKey: { startsWith: '/uploads/' } },
    select: { id: true, proofKey: true },
  });
  if (legacyDocs.length + legacyProofs.length === 0) return;

  const move = async (legacyUrl: string) => {
    // Old names were "<timestamp>-<hex>.<ext>"; normalise to a valid storage key.
    const key = path.basename(legacyUrl).toLowerCase().replace(/[^a-z0-9.-]/g, '-');
    if (!isValidKey(key)) throw new Error(`Cannot migrate ${legacyUrl}`);
    const from = path.join(UPLOAD_DIR, path.basename(legacyUrl));
    if (fs.existsSync(from)) await fs.promises.rename(from, privateFilePath(key));
    else console.warn(`[storage] ${legacyUrl} is missing on disk; reference updated anyway`);
    return key;
  };

  for (const doc of legacyDocs) {
    await prisma.landDocument.update({ where: { id: doc.id }, data: { storageKey: await move(doc.storageKey) } });
  }
  for (const step of legacyProofs) {
    await prisma.transferStep.update({ where: { id: step.id }, data: { proofKey: await move(step.proofKey!) } });
  }
  console.log(`[storage] moved ${legacyDocs.length} document(s) and ${legacyProofs.length} receipt(s) to private storage`);
}
