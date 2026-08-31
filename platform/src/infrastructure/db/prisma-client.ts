import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

function getSanitizedDbUrl(): string | undefined {
  let dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return undefined;

  // Ensure pgbouncer=true parameter is present for Neon PostgreSQL pooler connections
  if (dbUrl.includes('neon.tech') && !dbUrl.includes('pgbouncer=true')) {
    const separator = dbUrl.includes('?') ? '&' : '?';
    dbUrl = `${dbUrl}${separator}pgbouncer=true`;
  }
  return dbUrl;
}

const sanitizedUrl = getSanitizedDbUrl();

export const prisma = new PrismaClient(
  sanitizedUrl
    ? {
        datasources: {
          db: { url: sanitizedUrl },
        },
      }
    : undefined
);

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
if (sanitizedUrl) {
  prisma.$connect()
    .then(() => {
      inMemoryStore.isDbConnected = true;
      console.log('🐘 [DATABASE] Successfully connected to Neon Cloud PostgreSQL (PgBouncer Mode)!');
    })
    .catch((err) => {
      console.warn('⚠️ [DATABASE WARNING] Could not connect to primary DB, falling back to memory store:', err.message);
      inMemoryStore.isDbConnected = false;
    });
}
