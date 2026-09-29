import type { Block, BlockType, Prisma } from '@prisma/client';
import { env } from '../config/env';
import { prisma, type Tx } from '../lib/prisma';
import { sha256 } from '../utils/crypto';
import { signHash, verifySignature } from './signer';
import { anchorBlock } from './anchor';

/**
 * DLand ownership ledger
 * ----------------------
 * A permissioned (proof-of-authority) blockchain stored in Postgres:
 *  - every block embeds the hash of the previous block, so altering any past block
 *    breaks every block after it;
 *  - every block hash carries a light proof-of-work (CHAIN_DIFFICULTY leading zeros);
 *  - every block is signed by the registry authority (Ed25519);
 *  - optionally, every block hash is anchored on a public EVM chain (see anchor.ts).
 */

export const GENESIS_PREVIOUS_HASH = '0'.repeat(64);
// Arbitrary constant used to serialize block creation across concurrent requests.
const CHAIN_LOCK_KEY = 7_202_604;

/** JSON with sorted keys so the hash never depends on key order (Postgres jsonb reorders keys). */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

interface HashInput {
  index: number;
  timestamp: Date;
  type: BlockType;
  previousHash: string;
  dataHash: string;
  nonce: number;
}

export const computeBlockHash = (b: HashInput) =>
  sha256([b.index, b.timestamp.toISOString(), b.type, b.previousHash, b.dataHash, b.nonce].join('|'));

function mine(input: Omit<HashInput, 'nonce'>) {
  const target = '0'.repeat(env.CHAIN_DIFFICULTY);
  let nonce = 0;
  let hash = computeBlockHash({ ...input, nonce });
  while (!hash.startsWith(target)) {
    nonce += 1;
    hash = computeBlockHash({ ...input, nonce });
  }
  return { nonce, hash };
}

export interface AppendBlockInput {
  type: BlockType;
  landId?: string;
  data: Record<string, unknown>;
  signerId?: string;
}

async function createBlock(db: Tx, index: number, previousHash: string, input: AppendBlockInput) {
  // JS Dates and Prisma's timestamp(3) both have millisecond precision, so this re-hashes identically.
  const timestamp = new Date();
  const dataHash = sha256(canonicalJson(input.data));
  const { nonce, hash } = mine({ index, timestamp, type: input.type, previousHash, dataHash });
  return db.block.create({
    data: {
      index,
      timestamp,
      type: input.type,
      landId: input.landId,
      data: input.data as Prisma.InputJsonValue,
      dataHash,
      previousHash,
      nonce,
      hash,
      signature: signHash(hash),
      signerId: input.signerId,
    },
  });
}

/**
 * Appends a block. Must be called inside a transaction (`db` = the tx client) so the
 * block is only persisted if the business change it records (e.g. ownership) commits too.
 */
export async function appendBlock(db: Tx, input: AppendBlockInput): Promise<Block> {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(${CHAIN_LOCK_KEY})`;
  let last = await db.block.findFirst({ orderBy: { index: 'desc' } });
  if (!last) {
    last = await createBlock(db, 0, GENESIS_PREVIOUS_HASH, {
      type: 'GENESIS',
      data: { message: 'DLand land registry genesis block' },
    });
  }
  return createBlock(db, last.index + 1, last.hash, input);
}

/** Call after the surrounding transaction committed. Never throws. */
export function afterBlockCommitted(block: Block) {
  void anchorBlock(block);
}

export async function ensureGenesisBlock() {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CHAIN_LOCK_KEY})`;
    const count = await tx.block.count();
    if (count === 0) {
      await createBlock(tx, 0, GENESIS_PREVIOUS_HASH, {
        type: 'GENESIS',
        data: { message: 'DLand land registry genesis block' },
      });
      console.log('[chain] genesis block created');
    }
  });
}

export interface BlockIssue {
  index: number;
  hash: string;
  problem: 'DATA_HASH_MISMATCH' | 'HASH_MISMATCH' | 'BROKEN_LINK' | 'BAD_SIGNATURE' | 'INDEX_GAP';
}

export function verifyBlock(block: Block, previous: Block | null): BlockIssue['problem'][] {
  const problems: BlockIssue['problem'][] = [];
  if (sha256(canonicalJson(block.data)) !== block.dataHash) problems.push('DATA_HASH_MISMATCH');
  if (computeBlockHash(block) !== block.hash) problems.push('HASH_MISMATCH');
  if (!verifySignature(block.hash, block.signature)) problems.push('BAD_SIGNATURE');
  if (previous) {
    if (block.previousHash !== previous.hash) problems.push('BROKEN_LINK');
    if (block.index !== previous.index + 1) problems.push('INDEX_GAP');
  } else if (block.index !== 0 || block.previousHash !== GENESIS_PREVIOUS_HASH) {
    problems.push('BROKEN_LINK');
  }
  return problems;
}

/** Walks the whole chain in batches and reports every inconsistency. */
export async function verifyChain() {
  const issues: BlockIssue[] = [];
  let previous: Block | null = null;
  let checked = 0;
  const batchSize = 500;
  for (let cursor = 0; ; cursor += batchSize) {
    const blocks = await prisma.block.findMany({ orderBy: { index: 'asc' }, skip: cursor, take: batchSize });
    if (blocks.length === 0) break;
    for (const block of blocks) {
      for (const problem of verifyBlock(block, previous)) issues.push({ index: block.index, hash: block.hash, problem });
      previous = block;
      checked += 1;
    }
  }
  return { valid: issues.length === 0, blocks: checked, lastHash: previous?.hash ?? null, issues, checkedAt: new Date() };
}

/**
 * Verifies the blocks belonging to one land, including the link to the block
 * right before each one (so a land's history cannot be silently rewritten).
 */
export async function landHistory(landId: string) {
  const blocks = await prisma.block.findMany({
    where: { landId },
    orderBy: { index: 'asc' },
    include: { signer: { select: { id: true, firstName: true, lastName: true, walletAddress: true } } },
  });
  const previousBlocks = await prisma.block.findMany({
    where: { index: { in: blocks.map((b) => b.index - 1) } },
  });
  const byIndex = new Map(previousBlocks.map((b) => [b.index, b]));
  const entries = blocks.map((block) => {
    const problems = verifyBlock(block, byIndex.get(block.index - 1) ?? null);
    return { ...block, verified: problems.length === 0, problems };
  });
  return { valid: entries.every((e) => e.verified), blocks: entries };
}
