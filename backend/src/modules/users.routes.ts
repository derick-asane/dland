import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, currentUser } from '../middleware/auth';
import { imageUpload, publicPath, removeUpload } from '../middleware/upload';
import { param, validateBody } from '../middleware/validate';
import { badRequest, notFound } from '../utils/errors';
import { privateUserSelect, publicUserSelect } from '../utils/serialize';
import { landCardInclude } from './lands.shared';

const router = Router();

const updateSchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  bio: z.string().trim().max(1000).nullable().optional(),
  city: z.string().trim().max(80).nullable().optional(),
  country: z.string().trim().max(80).nullable().optional(),
  language: z.enum(['en', 'fr', 'es']).optional(),
});

router.patch('/me', authenticate, validateBody(updateSchema), async (req, res) => {
  const user = await prisma.user.update({
    where: { id: currentUser(req).id },
    data: req.body as z.infer<typeof updateSchema>,
    select: privateUserSelect,
  });
  res.json({ user });
});

router.post('/me/avatar', authenticate, imageUpload.single('avatar'), async (req, res) => {
  if (!req.file) throw badRequest('FILE_REQUIRED', 'An image file is required');
  const me = currentUser(req);
  const previous = await prisma.user.findUniqueOrThrow({ where: { id: me.id }, select: { avatarUrl: true } });
  const user = await prisma.user.update({
    where: { id: me.id },
    data: { avatarUrl: publicPath(req.file.filename) },
    select: privateUserSelect,
  });
  if (previous.avatarUrl) removeUpload(previous.avatarUrl);
  res.json({ user });
});

/** Personal dashboard numbers shown on the profile screen. */
router.get('/me/stats', authenticate, async (req, res) => {
  const userId = currentUser(req).id;
  const [landsByStatus, views, pendingOffersReceived, offersSent, favorites, ownedOnChain, unreadNotifications] =
    await Promise.all([
      prisma.land.groupBy({ by: ['status'], where: { ownerId: userId }, _count: true }),
      prisma.land.aggregate({ where: { ownerId: userId }, _sum: { viewsCount: true } }),
      prisma.offer.count({ where: { status: 'PENDING', land: { ownerId: userId } } }),
      prisma.offer.count({ where: { buyerId: userId } }),
      prisma.favorite.count({ where: { userId } }),
      prisma.land.count({ where: { ownerId: userId, registeredOnChain: true } }),
      prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
  res.json({
    landsByStatus: Object.fromEntries(landsByStatus.map((g) => [g.status, g._count])),
    totalViews: views._sum.viewsCount ?? 0,
    pendingOffersReceived,
    offersSent,
    favorites,
    ownedOnChain,
    unreadNotifications,
  });
});

/** Public profile: identity, trust signals (rating, completed sales) and published listings. */
router.get('/:id', async (req, res) => {
  const id = param(req, 'id');
  const user = await prisma.user.findUnique({
    where: { id },
    select: { ...publicUserSelect, bio: true, isActive: true },
  });
  if (!user || !user.isActive) throw notFound('USER_NOT_FOUND', 'User not found');

  const [rating, sold, lands] = await Promise.all([
    prisma.review.aggregate({ where: { sellerId: id }, _avg: { rating: true }, _count: true }),
    prisma.transfer.count({ where: { sellerId: id, status: 'COMPLETED' } }),
    prisma.land.findMany({
      where: { ownerId: id, status: { in: ['PUBLISHED', 'UNDER_OFFER'] } },
      include: landCardInclude,
      orderBy: { publishedAt: 'desc' },
      take: 30,
    }),
  ]);
  res.json({
    user,
    stats: { averageRating: rating._avg.rating, reviewCount: rating._count, completedSales: sold },
    lands,
  });
});

router.get('/:id/reviews', async (req, res) => {
  const reviews = await prisma.review.findMany({
    where: { sellerId: param(req, 'id') },
    include: { author: { select: publicUserSelect }, transfer: { select: { land: { select: { title: true, reference: true } } } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json({ items: reviews });
});

export default router;
