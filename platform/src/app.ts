import express from 'express';
import cors from 'cors';
import { captureRawBody } from './api/webhook.middleware.js';
import merchantRoutes from './api/merchant.routes.js';
import paymentRoutes from './api/payment.routes.js';
import sdkRoutes from './api/sdk.routes.js';
import telemetryRoutes from './api/telemetry.routes.js';
import webhookRoutes from './api/webhook.routes.js';

export const app = express();

app.use(cors());

// Configure body parser to capture raw body for HMAC signature verification
app.use(
  express.json({
    verify: captureRawBody,
  })
);
app.use(express.urlencoded({ extended: true }));

// API Endpoints
app.use('/v1', merchantRoutes);
app.use('/v1', paymentRoutes);
app.use('/v1', sdkRoutes);
app.use('/v1', telemetryRoutes);
app.use('/v1', webhookRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'LeakGuard-RazorPay RevenueRiskDetectionSDK Platform' });
});
