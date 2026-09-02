import './config/env.js';
import { validationWorker } from './application/validation-worker.js';
import { OutboxRelay } from './application/outbox-relay.js';

console.log('🚀 [Validation & Recovery Diagnosis] Worker is starting...');

const relayInterval = setInterval(() => {
  OutboxRelay.relayPendingEvents().catch(console.error);
}, 5000);

process.on('SIGINT', async () => {
  console.log('Shutting down worker...');
  clearInterval(relayInterval);
  await validationWorker.close();
  process.exit(0);
});
