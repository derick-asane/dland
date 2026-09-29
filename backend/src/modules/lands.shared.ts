import crypto from 'node:crypto';
import type { Land, LandStatus, Prisma } from '@prisma/client';
import type { AuthUser } from '../middleware/auth';
import { publicUserSelect } from '../utils/serialize';

/** Statuses anyone (even anonymous visitors) may see. */
export const PUBLIC_STATUSES: LandStatus[] = ['PUBLISHED', 'UNDER_OFFER', 'SOLD'];

/** Statuses from which the owner may edit and (re)submit a listing. */
export const EDITABLE_STATUSES: LandStatus[] = ['DRAFT', 'REJECTED', 'SOLD', 'ARCHIVED'];

export const landCardInclude = {
  images: { orderBy: { position: 'asc' }, take: 1 },
  owner: { select: publicUserSelect },
  _count: { select: { favorites: true } },
} satisfies Prisma.LandInclude;

export const landDetailInclude = {
  images: { orderBy: { position: 'asc' } },
  documents: { orderBy: { createdAt: 'asc' } },
  owner: { select: { ...publicUserSelect, bio: true } },
  notary: { select: { ...publicUserSelect, licenseNumber: true } },
  verifications: {
    orderBy: { createdAt: 'desc' },
    include: { notary: { select: publicUserSelect } },
  },
  _count: { select: { favorites: true, offers: true } },
} satisfies Prisma.LandInclude;

export function isStaff(user?: AuthUser) {
  return user?.role === 'NOTARY' || user?.role === 'ADMIN';
}

export function canViewLand(land: Pick<Land, 'status' | 'ownerId'>, user?: AuthUser) {
  return PUBLIC_STATUSES.includes(land.status) || land.ownerId === user?.id || isStaff(user);
}

/**
 * Buyers can see which documents exist and their SHA-256 fingerprints (to compare with
 * the chain), but only the owner and staff can download the files themselves.
 */
export function canDownloadDocuments(land: Pick<Land, 'ownerId'>, user?: AuthUser) {
  return land.ownerId === user?.id || isStaff(user);
}

export const newLandReference = () =>
  `DL-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
