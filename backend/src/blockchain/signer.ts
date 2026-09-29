import fs from 'node:fs';
import path from 'node:path';
import crypto, { type KeyObject } from 'node:crypto';
import { env } from '../config/env';

/**
 * The registry authority signs every block with an Ed25519 key.
 * Anyone can verify the chain with the public key exposed at GET /api/chain/public-key.
 */
const KEY_DIR = path.resolve(__dirname, '../../.keys');
const KEY_FILE = path.join(KEY_DIR, 'chain-signer.pem');

function loadPrivateKey(): KeyObject {
  if (env.CHAIN_SIGNER_PRIVATE_KEY_B64) {
    return crypto.createPrivateKey(Buffer.from(env.CHAIN_SIGNER_PRIVATE_KEY_B64, 'base64').toString('utf8'));
  }
  if (fs.existsSync(KEY_FILE)) {
    return crypto.createPrivateKey(fs.readFileSync(KEY_FILE, 'utf8'));
  }
  if (env.NODE_ENV === 'production') {
    throw new Error('CHAIN_SIGNER_PRIVATE_KEY_B64 must be set in production');
  }
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  fs.mkdirSync(KEY_DIR, { recursive: true });
  fs.writeFileSync(KEY_FILE, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  console.log(`[chain] generated development signing key at ${KEY_FILE}`);
  return privateKey;
}

const privateKey = loadPrivateKey();
const publicKey = crypto.createPublicKey(privateKey);

export const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

export const signHash = (hash: string) => crypto.sign(null, Buffer.from(hash, 'hex'), privateKey).toString('base64');

export const verifySignature = (hash: string, signature: string) =>
  crypto.verify(null, Buffer.from(hash, 'hex'), publicKey, Buffer.from(signature, 'base64'));
