import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  DATABASE_URL: z.string().default('postgresql://neondb_owner:npg_yzMGPcU9O8Nr@ep-orange-cell-axyxwxyj.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require&connect_timeout=30'),
  BULLMQ_REDIS_URL: z.string().default('rediss://default:gQAAAAAAA0b9AAIgcDE3ODA4MGE2ZTI0ZjU0ZDc4OTk0MWI4NGViYTM3ZmNiNQ@together-octopus-214781.upstash.io:6379'),
  INTERVENTION_REDIS_URL: z.string().default('rediss://default:gQAAAAAAAjo2AAIgcDJhOTEwY2NkMjE4Y2Q0YWZhODlhY2Q4MTJmOGNiZTYxYg@artistic-anchovy-145974.upstash.io:6379'),
  VALIDATION_PROCESSING_LEASE_MS: z.coerce.number().default(120000), // 2 minutes by default
});

export const config = envSchema.parse(process.env);
