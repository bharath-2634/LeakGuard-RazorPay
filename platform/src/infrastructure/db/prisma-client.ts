import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

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
prisma.$connect()
  .then(() => {
    inMemoryStore.isDbConnected = true;
    console.log('🐘 [DATABASE] Successfully connected to Neon Cloud PostgreSQL!');
  })
  .catch((err) => {
    console.warn('⚠️ [DATABASE WARNING] Could not connect to primary DB, falling back to memory store:', err.message);
    inMemoryStore.isDbConnected = false;
  });
