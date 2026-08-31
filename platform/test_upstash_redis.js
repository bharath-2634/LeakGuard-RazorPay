import Redis from 'ioredis';

const upstashRedisUrl = 'rediss://default:gQAAAAAAAfwyAAIgcDI3OThiZGI0NmI0MGM0M2Q0YmNiYTJjOTlkYTAxZGIzNw@engaging-lizard-130098.upstash.io:6379';

async function testUpstash() {
  console.log('Connecting to Upstash Cloud Redis...');
  const redis = new Redis(upstashRedisUrl, {
    tls: { rejectUnauthorized: false },
  });

  try {
    const pingRes = await redis.ping();
    console.log('✅ PING Response:', pingRes);

    await redis.set('leakguard:test_key', 'Cloud Redis Connected Successfully!');
    const val = await redis.get('leakguard:test_key');
    console.log('✅ GET Response:', val);

    await redis.quit();
    console.log('🎉 Upstash Redis Test Passed 100%!');
  } catch (err) {
    console.error('❌ Upstash Test Error:', err);
    process.exit(1);
  }
}

testUpstash();
