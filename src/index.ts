import { startInterventionWorker } from './recovery/intervention/orchestration/intervention-worker.js';

async function main() {
  console.log('--- SELECT INTERVENTION PIPELINE ORCHESTRATION ---');
  await startInterventionWorker();
}

main().catch(console.error);
