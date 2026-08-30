import { app } from './app.js';
import { config } from './config/env.js';

app.listen(config.port, () => {
  console.log(`RevenueRiskDetectionSDK Platform server running on port ${config.port} (${config.nodeEnv})`);
});
