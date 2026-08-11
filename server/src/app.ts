import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { corsOrigins, env, isProduction } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error';
import { prisma } from './lib/prisma';
import authRoutes from './modules/auth/auth.routes';
import usersRoutes from './modules/users/users.routes';
import customersRoutes from './modules/customers/customers.routes';
import productsRoutes from './modules/products/products.routes';
import stockRoutes from './modules/stock/stock.routes';
import challansRoutes from './modules/challans/challans.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';

export const createApp = () => {
  const app = express();

  app.set('trust proxy', 1); // required for correct client IPs behind Render/Railway proxies
  app.use(helmet());
  app.use(cors({ origin: corsOrigins, credentials: true }));
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan(isProduction ? 'combined' : 'dev'));

  app.use(
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
      max: env.RATE_LIMIT_MAX,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        success: false,
        error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again shortly' },
      },
    }),
  );

  // Liveness probe used by the hosting platform; also verifies the DB connection so a
  // green health check actually means "can serve traffic".
  app.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'unreachable' });
    }
  });

  app.get('/', (_req, res) => {
    res.json({
      name: 'Mini ERP + CRM Operations Portal API',
      version: '1.0.0',
      docs: '/api/v1',
      health: '/health',
    });
  });

  const api = express.Router();
  api.use('/auth', authRoutes);
  api.use('/users', usersRoutes);
  api.use('/customers', customersRoutes);
  api.use('/products', productsRoutes);
  api.use('/stock', stockRoutes);
  api.use('/challans', challansRoutes);
  api.use('/dashboard', dashboardRoutes);

  api.get('/', (_req, res) => {
    res.json({
      success: true,
      data: {
        endpoints: [
          'POST   /api/v1/auth/login',
          'GET    /api/v1/auth/me',
          'POST   /api/v1/auth/register            (ADMIN)',
          'GET    /api/v1/customers                (?page&limit&search&status&type)',
          'POST   /api/v1/customers                (ADMIN, SALES)',
          'GET    /api/v1/customers/:id',
          'PUT    /api/v1/customers/:id            (ADMIN, SALES)',
          'POST   /api/v1/customers/:id/follow-ups (ADMIN, SALES)',
          'GET    /api/v1/products                 (?page&limit&search&lowStock)',
          'POST   /api/v1/products                 (ADMIN, WAREHOUSE)',
          'GET    /api/v1/stock/movements          (?productId&type&from&to)',
          'POST   /api/v1/stock/movements          (ADMIN, WAREHOUSE)',
          'GET    /api/v1/challans                 (?status&search&customerId)',
          'POST   /api/v1/challans                 (ADMIN, SALES)',
          'POST   /api/v1/challans/:id/confirm     (ADMIN, SALES, WAREHOUSE)',
          'POST   /api/v1/challans/:id/cancel      (ADMIN, SALES, WAREHOUSE)',
          'GET    /api/v1/challans/:id/pdf',
          'GET    /api/v1/dashboard/summary',
        ],
      },
    });
  });

  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
