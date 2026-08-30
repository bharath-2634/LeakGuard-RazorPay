import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

// In-memory data store for fallback during testing or offline database mode
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

// Attempt connection on startup
prisma.$connect()
  .then(() => {
    inMemoryStore.isDbConnected = true;
  })
  .catch(() => {
    inMemoryStore.isDbConnected = false;
  });
