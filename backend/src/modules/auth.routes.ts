import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Role } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { audit } from '../lib/audit';
import { authenticate, currentUser } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { badRequest, conflict, forbidden, unauthorized } from '../utils/errors';
import { randomCode, randomToken, sha256, walletAddressFor } from '../utils/crypto';
import { privateUserSelect } from '../utils/serialize';

const router = Router();

const password = z.string().min(8).max(128);

function signAccessToken(userId: string, role: Role) {
  return jwt.sign({ sub: userId, role }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'],
  });
}

async function issueTokens(userId: string, role: Role) {
  const refreshToken = randomToken();
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + env.JWT_REFRESH_EXPIRES_DAYS * 24 * 3600 * 1000),
    },
  });
  return { accessToken: signAccessToken(userId, role), refreshToken };
}

const registerSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password,
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(30).optional(),
  language: z.enum(['en', 'fr', 'es']).default('en'),
});

router.post('/register', validateBody(registerSchema), async (req, res) => {
  const body = req.body as z.infer<typeof registerSchema>;
  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) throw conflict('EMAIL_TAKEN', 'This email is already registered');

  const id = randomUUID();
  const user = await prisma.user.create({
    data: {
      id,
      email: body.email,
      passwordHash: await bcrypt.hash(body.password, 12),
      firstName: body.firstName,
      lastName: body.lastName,
      phone: body.phone,
      language: body.language,
      walletAddress: walletAddressFor(id),
    },
    select: privateUserSelect,
  });
  await audit({ actorId: user.id, action: 'USER_REGISTERED', entityType: 'User', entityId: user.id, req });
  res.status(201).json({ user, ...(await issueTokens(user.id, user.role)) });
});

const loginSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1),
});

router.post('/login', validateBody(loginSchema), async (req, res) => {
  const { email, password: pwd } = req.body as z.infer<typeof loginSchema>;
  const found = await prisma.user.findUnique({ where: { email } });
  if (!found || !(await bcrypt.compare(pwd, found.passwordHash))) {
    throw unauthorized('INVALID_CREDENTIALS', 'Invalid email or password');
  }
  if (!found.isActive) throw forbidden('ACCOUNT_SUSPENDED', 'This account is suspended');
  const user = await prisma.user.findUniqueOrThrow({ where: { id: found.id }, select: privateUserSelect });
  res.json({ user, ...(await issueTokens(user.id, user.role)) });
});

const refreshSchema = z.object({ refreshToken: z.string().min(1) });

/** Rotates the refresh token: the old one is revoked on every use. */
router.post('/refresh', validateBody(refreshSchema), async (req, res) => {
  const { refreshToken } = req.body as z.infer<typeof refreshSchema>;
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: sha256(refreshToken) },
    include: { user: { select: { id: true, role: true, isActive: true } } },
  });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    // Reuse of a revoked token may indicate theft: revoke the whole family.
    if (stored?.revokedAt) {
      await prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    throw unauthorized('REFRESH_INVALID', 'Session expired, please sign in again');
  }
  if (!stored.user.isActive) throw forbidden('ACCOUNT_SUSPENDED', 'This account is suspended');
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
  res.json(await issueTokens(stored.user.id, stored.user.role));
});

router.post('/logout', validateBody(refreshSchema), async (req, res) => {
  const { refreshToken } = req.body as z.infer<typeof refreshSchema>;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: sha256(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
  res.status(204).end();
});

router.get('/me', authenticate, async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: currentUser(req).id }, select: privateUserSelect });
  res.json({ user });
});

const forgotSchema = z.object({ email: z.string().email().toLowerCase().trim() });

/**
 * Sends a 6-digit reset code. No mail provider is wired yet: in development the code is
 * logged to the console (plug your email/SMS service in here).
 */
router.post('/forgot-password', validateBody(forgotSchema), async (req, res) => {
  const { email } = req.body as z.infer<typeof forgotSchema>;
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const code = randomCode();
    await prisma.passwordReset.create({
      data: { userId: user.id, codeHash: sha256(code), expiresAt: new Date(Date.now() + 15 * 60 * 1000) },
    });
    if (env.NODE_ENV !== 'production') console.log(`[auth] password reset code for ${email}: ${code}`);
  }
  // Same response whether or not the account exists, to avoid email enumeration.
  res.json({ ok: true });
});

const resetSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  code: z.string().length(6),
  password,
});

router.post('/reset-password', validateBody(resetSchema), async (req, res) => {
  const body = req.body as z.infer<typeof resetSchema>;
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  const reset =
    user &&
    (await prisma.passwordReset.findFirst({
      where: { userId: user.id, codeHash: sha256(body.code), usedAt: null, expiresAt: { gt: new Date() } },
    }));
  if (!user || !reset) throw badRequest('RESET_CODE_INVALID', 'Invalid or expired code');

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(body.password, 12) } }),
    prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
    prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  await audit({ actorId: user.id, action: 'PASSWORD_RESET', entityType: 'User', entityId: user.id, req });
  res.json({ ok: true });
});

const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: password });

router.post('/change-password', authenticate, validateBody(changePasswordSchema), async (req, res) => {
  const body = req.body as z.infer<typeof changePasswordSchema>;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: currentUser(req).id } });
  if (!(await bcrypt.compare(body.currentPassword, user.passwordHash))) {
    throw badRequest('WRONG_PASSWORD', 'Current password is incorrect');
  }
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(body.newPassword, 12) } });
  await audit({ action: 'PASSWORD_CHANGED', entityType: 'User', entityId: user.id, req });
  res.json({ ok: true });
});

export default router;
