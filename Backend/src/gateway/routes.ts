import type { FastifyInstance } from 'fastify';
import { registerSubsystemARoutes } from '../subsystemA/routes/hazardRoutes.js';
import { registerSubsystemBRoutes } from '../subsystemB/routes/riskRoutes.js';
import { registerSubsystemCRoutes } from '../subsystemC/routes/newsAidChatRoutes.js';
import { logger } from '../../shared/utils/index.js';

/**
 * Gateway Routes
 * ──────────────
 * Thin integration layer that registers all subsystem routes
 * under one Fastify instance. Each subsystem registers its own
 * /api/* routes. The gateway only adds health check + docs.
 *
 * Subsystem boundaries:
 *   A → /api/hazards/*
 *   B → /api/risk/*, /api/weather
 *   C → /api/news/*, /api/aid/*, /api/chat, /api/home/*
 */
export async function registerGatewayRoutes(app: FastifyInstance) {
  // ── Health Check ──────────────────────────────────────────
  app.get('/api/health', {
    schema: {
      tags: ['Health'],
      summary: 'API health check',
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            version: { type: 'string' },
            subsystems: {
              type: 'object',
              properties: {
                hazardIntelligence: { type: 'string' },
                riskPrediction: { type: 'string' },
                aiNewsAid: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      subsystems: {
        hazardIntelligence: 'ok',
        riskPrediction: 'ok',
        aiNewsAid: 'ok',
      },
    };
  });

  // ── Register Subsystem Routes ─────────────────────────────
  try {
    await registerSubsystemARoutes(app);
    logger.info('Subsystem A (Hazard Intelligence) routes registered');
  } catch (err) {
    logger.error({ err }, 'Failed to register Subsystem A routes');
  }

  try {
    await registerSubsystemBRoutes(app);
    logger.info('Subsystem B (Risk & Prediction) routes registered');
  } catch (err) {
    logger.error({ err }, 'Failed to register Subsystem B routes');
  }

  try {
    await registerSubsystemCRoutes(app);
    logger.info('Subsystem C (AI + News + Aid) routes registered');
  } catch (err) {
    logger.error({ err }, 'Failed to register Subsystem C routes');
  }

  logger.info('All gateway routes registered');
}
