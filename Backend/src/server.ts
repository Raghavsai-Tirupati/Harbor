import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { loadEnv } from '../shared/config.js';
import { formatApiError, logger } from '../shared/utils/index.js';
import { registerGatewayRoutes } from './gateway/routes.js';

export async function buildApp() {
  const env = loadEnv();

  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
    },
  });

  // ── CORS ──────────────────────────────────────────────────
  await app.register(cors, {
    origin: env.ALLOWED_ORIGINS === '*' ? true : env.ALLOWED_ORIGINS.split(','),
    methods: ['GET', 'POST', 'OPTIONS'],
  });

  // ── Rate Limit ────────────────────────────────────────────
  await app.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute',
  });

  // ── Swagger / OpenAPI ─────────────────────────────────────
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'Harbor API',
        description: 'Safe harbor during disasters – unified backend API',
        version: '1.0.0',
      },
      servers: [{ url: '/' }],
      tags: [
        { name: 'Health', description: 'Health check' },
        { name: 'Hazards', description: 'Subsystem A – Hazard Intelligence' },
        { name: 'Risk', description: 'Subsystem B – Risk & Prediction' },
        { name: 'Weather', description: 'Weather data' },
        { name: 'News', description: 'Subsystem C – News feeds' },
        { name: 'Aid', description: 'Subsystem C – Aid & Resources' },
        { name: 'Chat', description: 'Subsystem C – AI Assistant' },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/api/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  });

  // ── API Key Auth Hook (optional) ──────────────────────────
  if (env.ENABLE_API_KEY === 'true' && env.API_KEY_VALUE) {
    app.addHook('onRequest', async (req, reply) => {
      if (req.url.startsWith('/api/docs') || req.url === '/api/health') return;
      const key = req.headers['x-api-key'];
      if (key !== env.API_KEY_VALUE) {
        reply.status(401).send(formatApiError(401, 'Invalid or missing API key'));
      }
    });
  }

  // ── Global error handler ──────────────────────────────────
  app.setErrorHandler((error, _req, reply) => {
    logger.error(error);
    const status = error.statusCode || 500;
    reply.status(status).send(formatApiError(status, error.message));
  });

  // ── Register Routes ───────────────────────────────────────
  await registerGatewayRoutes(app);

  return app;
}

// ── Start server (local dev) ────────────────────────────────
async function main() {
  const env = loadEnv();
  const app = await buildApp();
  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  logger.info(`🌊 Harbor API running on http://localhost:${env.PORT}`);
  logger.info(`📖 Docs at http://localhost:${env.PORT}/api/docs`);
}

main().catch((err) => {
  logger.error(err);
  process.exit(1);
});
