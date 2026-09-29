import type { Prisma } from '@prisma/client';

/** Public-safe user shape (never leaks passwordHash, email or phone). */
export const publicUserSelect = {
  id: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  city: true,
  country: true,
  role: true,
  walletAddress: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export const privateUserSelect = {
  ...publicUserSelect,
  email: true,
  phone: true,
  bio: true,
  language: true,
  isActive: true,
  licenseNumber: true,
  escrowBankName: true,
  escrowAccountName: true,
  escrowAccountNumber: true,
  escrowMobileMoney: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;
