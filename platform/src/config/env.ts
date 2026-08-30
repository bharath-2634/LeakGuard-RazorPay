import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/leakguard_db?schema=public',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  masterSecretKey: process.env.MASTER_SECRET_KEY || 'leakguard_master_secret_32_bytes_len!!', // Must be 32 bytes for AES-256
  defaultSessionTtlSeconds: parseInt(process.env.DEFAULT_SESSION_TTL_SECONDS || '3600', 10), // 1 hour monitoring window
};
