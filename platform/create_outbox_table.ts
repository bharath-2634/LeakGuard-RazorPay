import { prisma } from './src/infrastructure/db/prisma-client';

async function main() {
  console.log('Creating outbox_events table in Neon PostgreSQL if not exists...');
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "outbox_events" (
      "id" TEXT NOT NULL,
      "event_type" TEXT NOT NULL,
      "aggregate_id" TEXT,
      "payload" JSONB NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'PENDING',
      "attempts" INTEGER NOT NULL DEFAULT 0,
      "last_error" TEXT,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "processed_at" TIMESTAMP(3),
      CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
    );
  `);
  console.log('✅ outbox_events table created successfully in Neon DB!');
}

main().catch(console.error);
