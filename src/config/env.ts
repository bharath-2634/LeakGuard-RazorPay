import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  INTERVENTION_REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  GEMINI_API_KEY: z.string().default(''),
  EXECUTION_MODE: z.enum(['mock', 'live']).default('mock'),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_SMS_FROM: z.string().optional(),
  TWILIO_WHATSAPP_FROM: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  TWILIO_WHATSAPP_CONTENT_SID: z.string().optional(),
  TWILIO_WHATSAPP_CONTENT_VARIABLES: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  MASTER_SECRET_KEY: z.string().optional(),
  OUTCOME_QUEUE_NAME: z.string().default('execution-measure-queue'),
});

export const config = envSchema.parse(process.env);
