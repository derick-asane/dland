import type { Block } from '@prisma/client';
import { Contract, JsonRpcProvider, Wallet } from 'ethers';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';

/**
 * Optional public-chain anchoring.
 * When ANCHOR_ENABLED=true, each block hash is written to the DlandAnchor contract
 * (see /blockchain/contracts/DlandAnchor.sol) on any EVM chain, e.g. Polygon Amoy.
 * This makes the private ledger tamper-evident even against the platform operator.
 */
const ABI = ['function anchor(uint256 index, bytes32 blockHash) external'];

let contract: Contract | null = null;

function getContract(): Contract | null {
  if (!env.ANCHOR_ENABLED) return null;
  if (!env.ANCHOR_RPC_URL || !env.ANCHOR_PRIVATE_KEY || !env.ANCHOR_CONTRACT_ADDRESS) {
    console.warn('[anchor] ANCHOR_ENABLED=true but RPC URL / private key / contract address is missing');
    return null;
  }
  if (!contract) {
    const wallet = new Wallet(env.ANCHOR_PRIVATE_KEY, new JsonRpcProvider(env.ANCHOR_RPC_URL));
    contract = new Contract(env.ANCHOR_CONTRACT_ADDRESS, ABI, wallet);
  }
  return contract;
}

export async function anchorBlock(block: Block): Promise<void> {
  const c = getContract();
  if (!c) return;
  try {
    const tx = await c.anchor(block.index, '0x' + block.hash);
    await prisma.block.update({ where: { id: block.id }, data: { anchorTxHash: tx.hash } });
    console.log(`[anchor] block #${block.index} anchored in tx ${tx.hash}`);
  } catch (err) {
    console.error(`[anchor] failed to anchor block #${block.index}`, err);
  }
}
