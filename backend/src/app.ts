import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { UPLOAD_DIR } from './middleware/upload';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import authRoutes from './modules/auth.routes';
import usersRoutes from './modules/users.routes';
import landsRoutes from './modules/lands.routes';
import offersRoutes from './modules/offers.routes';
import transfersRoutes from './modules/transfers.routes';
import notaryRoutes from './modules/notary.routes';
import conversationsRoutes from './modules/conversations.routes';
import notificationsRoutes from './modules/notifications.routes';
import chainRoutes from './modules/chain.routes';
import filesRoutes from './modules/files.routes';
import adminRoutes from './modules/admin.routes';
import disputesRoutes from './modules/disputes.routes';
import visitsRoutes from './modules/visits.routes';
import paymentsRoutes from './modules/payments.routes';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',') }));
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  if (env.NODE_ENV !== 'test') app.use(morgan('dev'));

  app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Guards password guessing; session upkeep (/me, /refresh) runs on every app start and is not limited.
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 50,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === '/me' || req.path === '/refresh',
  });

  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/lands', landsRoutes);
  app.use('/api/offers', offersRoutes);
  app.use('/api/transfers', transfersRoutes);
  app.use('/api/notary', notaryRoutes);
  app.use('/api/disputes', disputesRoutes);
  app.use('/api/visits', visitsRoutes);
  app.use('/api/payments', paymentsRoutes);
  app.use('/api/conversations', conversationsRoutes);
  app.use('/api/notifications', notificationsRoutes);
  app.use('/api/chain', chainRoutes);
  // Private documents, opened through signed short-lived links only
  app.use('/api/files', filesRoutes);
  app.use('/api/admin', adminRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
