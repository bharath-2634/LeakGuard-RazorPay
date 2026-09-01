import { PrismaClient } from '@prisma/client';
import { config } from '../../config/env.js';

// Setup Prisma Client (Singleton to avoid connection limit issues)
const prismaGlobal = global as typeof global & {
  prisma?: PrismaClient;
};

export const prisma = prismaGlobal.prisma || new PrismaClient({
  datasourceUrl: config.DATABASE_URL,
});

if (config.NODE_ENV !== 'production') {
  prismaGlobal.prisma = prisma;
}
