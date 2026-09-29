import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { forbidden, unauthorized } from '../utils/errors';

export interface AuthUser {
  id: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

interface AccessPayload {
  sub: string;
  role: Role;
}

async function resolveUser(req: Request): Promise<AuthUser | undefined> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return undefined;
  let payload: AccessPayload;
  try {
    payload = jwt.verify(header.slice(7), env.JWT_ACCESS_SECRET) as AccessPayload;
  } catch {
    throw unauthorized('TOKEN_INVALID', 'Invalid or expired token');
  }
  // Re-read the role so promotions and suspensions apply immediately.
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, role: true, isActive: true },
  });
  if (!user) throw unauthorized('TOKEN_INVALID', 'Invalid or expired token');
  if (!user.isActive) throw forbidden('ACCOUNT_SUSPENDED', 'This account is suspended');
  return { id: user.id, role: user.role };
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const user = await resolveUser(req);
  if (!user) throw unauthorized();
  req.user = user;
  next();
}

/** Attaches req.user when a valid token is present, but never rejects. */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    req.user = await resolveUser(req);
  } catch {
    req.user = undefined;
  }
  next();
}

export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw unauthorized();
    if (!roles.includes(req.user.role)) throw forbidden('ROLE_REQUIRED', `Requires role: ${roles.join(', ')}`);
    next();
  };

/** Returns the authenticated user in handlers mounted behind `authenticate`. */
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
