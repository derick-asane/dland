import { Router } from 'express';
import fs from 'node:fs';
import { z } from 'zod';
import { privateFilePath, verifySignedLink } from '../lib/storage';
import { param, parseQuery } from '../middleware/validate';
import { forbidden, notFound } from '../utils/errors';

/**
 * Serves a private file from a signed, short-lived link issued by the API after a permission
 * check (see lands.routes.ts and transfers.routes.ts). The signature is the credential, so the
 * link can be opened in a browser tab or a PDF viewer without an Authorization header.
 */
const router = Router();

const linkQuery = z.object({
  expires: z.coerce.number().int(),
  sig: z.string().regex(/^[0-9a-f]{64}$/),
});

router.get('/:key', async (req, res) => {
  const key = param(req, 'key');
  const parsed = linkQuery.safeParse(req.query);
  if (!parsed.success || !verifySignedLink(key, parsed.data.expires, parsed.data.sig)) {
    throw forbidden('LINK_EXPIRED', 'This link is invalid or has expired');
  }
  const file = privateFilePath(key);
  if (!fs.existsSync(file)) throw notFound('DOCUMENT_NOT_FOUND', 'File not found');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.sendFile(file);
});

export default router;
