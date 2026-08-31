import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const rawDbUrl = process.env.DATABASE_URL || '';

// Automatically append connection pooling parameters for Neon PostgreSQL if needed
let formattedDbUrl = rawDbUrl;
if (rawDbUrl && !rawDbUrl.includes('connection_limit=')) {
  const separator = rawDbUrl.includes('?') ? '&' : '?';
  formattedDbUrl = `${rawDbUrl}${separator}connection_limit=10&connect_timeout=15`;
}

export const prisma = new PrismaClient({
  datasources: formattedDbUrl
    ? {
        db: {
          url: formattedDbUrl,
        },
      }
    : undefined,
});

class InMemoryDbStore {
  public merchants = new Map<string, any>();
  public merchantEconomics = new Map<string, any>();
  public paymentAttempts = new Map<string, any>();
  public paymentEvents: any[] = [];
  public razorpayWebhookEvents = new Map<string, any>();
  public riskEvents: any[] = [];

  public isDbConnected = false;
}

export const inMemoryStore = new InMemoryDbStore();

// Connect to PostgreSQL database on startup
if (process.env.DATABASE_URL) {
  prisma.$connect()
    .then(() => {
      inMemoryStore.isDbConnected = true;
      console.log('🐘 [DATABASE] Successfully connected to Neon Cloud PostgreSQL!');
    })
    .catch((err) => {
      console.warn('⚠️ [DATABASE WARNING] Connection failed:', err.message);
      inMemoryStore.isDbConnected = false;
    });
}
