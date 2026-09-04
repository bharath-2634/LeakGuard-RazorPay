import { startInterventionWorker } from './recovery/intervention/orchestration/intervention-worker.js';
import { startExecutionWorker } from './execution/execution.worker.js';
import { relayOutcomeOutbox } from './infrastructure/queue/outcome-outbox-relay.js';

async function main() {
  console.log('--- SELECT INTERVENTION PIPELINE ORCHESTRATION ---');
  await startInterventionWorker();
  await startExecutionWorker();
  setInterval(() => relayOutcomeOutbox().catch(console.error), 5000);
}

main().catch(console.error);
