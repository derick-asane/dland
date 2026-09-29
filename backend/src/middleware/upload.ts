import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { env } from '../config/env';
import { newKey, privateStorage } from '../lib/storage';
import { badRequest } from '../utils/errors';

export const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const DOCUMENT_TYPES = [...IMAGE_TYPES, 'application/pdf'];

const make = (allowed: string[]) =>
  multer({
    storage,
    limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (allowed.includes(file.mimetype)) cb(null, true);
      else cb(badRequest('INVALID_FILE_TYPE', `Unsupported file type: ${file.mimetype}`));
    },
  });

/** Public images (land photos, avatars), served from /uploads. */
export const imageUpload = make(IMAGE_TYPES);

// Sensitive documents first land in a temporary folder, then move to private storage once the
// request is validated (see storePrivate). They are never written under the public /uploads.
const INCOMING_DIR = path.join(os.tmpdir(), 'dland-incoming');
fs.mkdirSync(INCOMING_DIR, { recursive: true });

export const privateUpload = multer({
  storage: multer.diskStorage({
    destination: INCOMING_DIR,
    filename: (_req, _file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`),
  }),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (DOCUMENT_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(badRequest('INVALID_FILE_TYPE', `Unsupported file type: ${file.mimetype}`));
  },
});

/** Fingerprints an uploaded document and moves it into private storage. */
export async function storePrivate(file: Express.Multer.File) {
  const hash = await fileSha256(file.path);
  const key = newKey(file.originalname);
  await privateStorage.put(file.path, key);
  return { key, sha256: hash };
}

/** Deletes a temporary upload that was not stored (validation failed). */
export function discardIncoming(file?: Express.Multer.File) {
  if (file) fs.promises.unlink(file.path).catch(() => undefined);
}

/** Stored as a relative path so the API host can change without breaking links. */
export const publicPath = (filename: string) => `/uploads/${filename}`;

export function fileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(filePath)
      .on('data', (d) => hash.update(d))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });
}

export function removeUpload(relativeUrl: string) {
  const file = path.join(UPLOAD_DIR, path.basename(relativeUrl));
  fs.promises.unlink(file).catch(() => undefined);
}
