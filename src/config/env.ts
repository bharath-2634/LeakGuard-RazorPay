import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  INTERVENTION_REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
  GEMINI_API_KEY: z.string().default(''),
});

export const config = envSchema.parse(process.env);
