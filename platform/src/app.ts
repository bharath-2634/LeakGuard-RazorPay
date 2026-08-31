import express from 'express';
import cors from 'cors';
import { captureRawBody } from './api/webhook.middleware.js';
import merchantRoutes from './api/merchant.routes.js';
import paymentRoutes from './api/payment.routes.js';
import sdkRoutes from './api/sdk.routes.js';
import telemetryRoutes from './api/telemetry.routes.js';
import webhookRoutes from './api/webhook.routes.js';
import { prisma } from './infrastructure/db/prisma-client.js';

export const app = express();

app.use(cors());

// Configure body parser to capture raw body for HMAC signature verification
app.use(
  express.json({
    verify: captureRawBody,
  })
);
app.use(express.urlencoded({ extended: true }));

// Health Check Endpoints
app.get(['/health', '/v1/health'], (req, res) => {
  res.json({ status: 'ok', service: 'LeakGuard-RazorPay RevenueRiskDetectionSDK Platform' });
});

// DB Diagnostic Endpoint
app.get('/v1/db-status', async (req, res) => {
  try {
    const dbUrlSet = Boolean(process.env.DATABASE_URL);
    const merchantCount = await prisma.merchant.count();
    res.json({
      success: true,
      dbUrlSet,
      databaseUrlPrefix: process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 25) + '...' : 'NOT_SET',
      merchantCount,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      dbUrlSet: Boolean(process.env.DATABASE_URL),
      databaseUrlPrefix: process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 25) + '...' : 'NOT_SET',
      error: err.message,
      stack: err.stack,
    });
  }
});

// API Endpoints
app.use('/v1', merchantRoutes);
app.use('/v1', paymentRoutes);
app.use('/v1', sdkRoutes);
app.use('/v1', telemetryRoutes);
app.use('/v1', webhookRoutes);
