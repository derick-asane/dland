import crypto from 'node:crypto';

export const sha256 = (input: string | Buffer) => crypto.createHash('sha256').update(input).digest('hex');

export const randomToken = (bytes = 48) => crypto.randomBytes(bytes).toString('hex');

export const randomCode = (digits = 6) => crypto.randomInt(0, 10 ** digits).toString().padStart(digits, '0');

/** Pseudonymous on-chain identity for a user, so no personal data is written to the ledger. */
export const walletAddressFor = (userId: string) => '0x' + sha256(`dland:wallet:${userId}`).slice(0, 40);
