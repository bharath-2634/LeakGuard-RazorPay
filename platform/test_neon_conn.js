import net from 'net';
import tls from 'tls';

// Test TCP to Neon
const neonHost = 'ep-orange-cell-axyxwxyj.c-4.us-east-2.aws.neon.tech';
const neonPort = 5432;

console.log(`Connecting to Neon (${neonHost}:${neonPort})...`);
const client = net.createConnection({ host: neonHost, port: neonPort }, () => {
  console.log('✅ Successfully established TCP connection to Neon PostgreSQL!');
  client.end();
});

client.on('error', (err) => {
  console.error('❌ Neon TCP Connection Error:', err.message);
});

// Test TLS to Upstash
const upstashHost = 'engaging-lizard-130098.upstash.io';
const upstashPort = 6379;

console.log(`Connecting to Upstash (${upstashHost}:${upstashPort})...`);
const tlsSocket = tls.connect({ host: upstashHost, port: upstashPort, rejectUnauthorized: false }, () => {
  console.log('✅ Successfully established TLS connection to Upstash Redis!');
  tlsSocket.end();
});

tlsSocket.on('error', (err) => {
  console.error('❌ Upstash TLS Connection Error:', err.message);
});
