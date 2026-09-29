import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, currentUser } from '../middleware/auth';
import { param, parseQuery } from '../middleware/validate';
import { pageResult, paginate, paginationSchema } from '../utils/pagination';

const router = Router();
router.use(authenticate);

router.get('/', async (req, res) => {
  const userId = currentUser(req).id;
  const { page, pageSize } = parseQuery(paginationSchema, req);
  const [items, total] = await Promise.all([
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, ...paginate(page, pageSize) }),
    prisma.notification.count({ where: { userId } }),
  ]);
  res.json(pageResult(items, total, page, pageSize));
});

router.get('/unread-count', async (req, res) => {
  const count = await prisma.notification.count({ where: { userId: currentUser(req).id, readAt: null } });
  res.json({ count });
});

router.post('/read-all', async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: currentUser(req).id, readAt: null }, data: { readAt: new Date() } });
  res.status(204).end();
});

router.post('/:id/read', async (req, res) => {
  await prisma.notification.updateMany({
    where: { id: param(req, 'id'), userId: currentUser(req).id, readAt: null },
    data: { readAt: new Date() },
  });
  res.status(204).end();
});

export default router;
