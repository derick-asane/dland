import { prisma } from '../lib/prisma';
import { verifyChain } from '../blockchain/ledger';

/** CLI: `npm run chain:verify` — exits with code 1 if the ledger was tampered with. */
verifyChain()
  .then((result) => {
    console.log(`Checked ${result.blocks} blocks. Last hash: ${result.lastHash}`);
    if (result.valid) {
      console.log('Chain is VALID');
    } else {
      console.error('Chain is INVALID:');
      console.table(result.issues);
      process.exitCode = 1;
    }
  })
  .finally(() => prisma.$disconnect());
