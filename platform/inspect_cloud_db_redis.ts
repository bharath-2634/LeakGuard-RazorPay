import { prisma } from './src/infrastructure/db/prisma-client';
import { getHotPaymentState } from './src/infrastructure/redis/redis-client';
import Redis from 'ioredis';

async function inspectCloudServices() {
  console.log('\n================================================================');
  console.log('🔍 LIVE CLOUD PERSISTENCE INSPECTION SESSION');
  console.log('================================================================\n');

  // 1. NEON POSTGRESQL INSPECTION
  console.log('----------------------------------------------------------------');
  console.log('🐘 1. INSPECTING NEON CLOUD POSTGRESQL DATABASE');
  console.log('----------------------------------------------------------------');
  try {
    const merchants = await prisma.merchant.findMany({
      include: { economics: true },
      take: 5,
      orderBy: { createdAt: 'desc' },
    });
    console.log(`✅ Retrieved ${merchants.length} Merchants from Neon PostgreSQL:`);
    console.log(JSON.stringify(merchants, null, 2));

    const attempts = await prisma.paymentAttempt.findMany({
      include: { paymentEvents: true },
      take: 5,
      orderBy: { createdAt: 'desc' },
    });
    console.log(`\n✅ Retrieved ${attempts.length} Payment Attempts from Neon PostgreSQL:`);
    console.log(JSON.stringify(attempts, null, 2));
  } catch (err: any) {
    console.error('❌ Neon DB Query Error:', err.message);
  }

  // 2. UPSTASH REDIS INSPECTION
  console.log('\n----------------------------------------------------------------');
  console.log('⚡ 2. INSPECTING UPSTASH CLOUD REDIS CACHE');
  console.log('----------------------------------------------------------------');
  try {
    const redisUrl = process.env.REDIS_URL || 'rediss://default:gQAAAAAAAfwyAAIgcDI3OThiZGI0NmI0MGM0M2Q0YmNiYTJjOTlkYTAxZGIzNw@engaging-lizard-130098.upstash.io:6379';
    const redis = new Redis(redisUrl, { tls: { rejectUnauthorized: false } });

    const pingRes = await redis.ping();
    console.log('✅ Upstash Redis PING Response:', pingRes);

    const keys = await redis.keys('*');
    console.log(`✅ Total Active Keys in Upstash Redis (${keys.length}):`, keys);

    for (const key of keys.slice(0, 5)) {
      const type = await redis.type(key);
      if (type === 'hash') {
        const hashData = await redis.hgetall(key);
        console.log(`   [HASH KEY] ${key}:`, hashData);
      } else if (type === 'string') {
        const val = await redis.get(key);
        console.log(`   [STRING KEY] ${key}:`, val);
      }
    }
    await redis.quit();
  } catch (err: any) {
    console.error('❌ Upstash Redis Error:', err.message);
  }

  console.log('\n================================================================');
  console.log(' ✅ CLOUD PERSISTENCE VERIFICATION COMPLETE');
  console.log('================================================================\n');
}

inspectCloudServices().catch(console.error);
