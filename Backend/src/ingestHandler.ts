import { loadEnv } from '../shared/config.js';
import { runFullIngestion } from './subsystemA/ingestion/ingestAll.js';
import { logger } from '../shared/utils/index.js';

/**
 * Lambda handler for scheduled hazard ingestion.
 * Triggered by EventBridge rule every 15-30 minutes.
 */
export const handler = async (event: any) => {
  loadEnv();
  logger.info({ event }, 'Ingestion Lambda triggered');

  try {
    const results = await runFullIngestion();
    const totalIngested = results.reduce((s, r) => s + r.count, 0);
    const errors = results.flatMap(r => r.errors);

    logger.info({ totalIngested, errors }, 'Ingestion complete');

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, totalIngested, results }),
    };
  } catch (err: any) {
    logger.error({ err }, 'Ingestion Lambda failed');
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: err.message }),
    };
  }
};
