import './config/env.js';
import { validationWorker } from './application/validation-worker.js';

console.log('🚀 [Validation & Recovery Diagnosis] Worker is starting...');

process.on('SIGINT', async () => {
  console.log('Shutting down worker...');
  await validationWorker.close();
  process.exit(0);
});
