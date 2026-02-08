import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  newsGlobalQuerySchema, newsLocalQuerySchema, carouselQuerySchema,
  aidNearbyQuerySchema, chatRequestSchema,
} from '../../../shared/schemas/index.js';
import { getEnv } from '../../../shared/config.js';
import {
  fetchGlobalNews, fetchLocalNews, fetchCarouselNews, getMockNews,
} from '../news/gdeltProvider.js';
import { fetchPlacesNearby, getMockAidItems, getAidHubItems } from '../aid/aidProvider.js';
import { handleChatMessage } from '../chat/chatService.js';
import { logger, haversineKm } from '../../../shared/utils/index.js';

// Lazy imports for cross-subsystem data (interface boundary)
async function getRiskScore(lat: number, lon: number, radiusKm: number, mode: string, horizonDays: number) {
  try {
    const { computeLiveRiskScore, computePredictionRiskScore } = await import('../../subsystemB/scoring/riskEngine.js');
    const { getMarkersFromSources } = await import('../../subsystemA/ingestion/ingestAll.js');
    const markers = await getMarkersFromSources();
    const nearby = markers.filter(m => haversineKm(lat, lon, m.lat, m.lon) <= radiusKm);

    if (mode === 'live') {
      return { mode: 'live' as const, horizonDays, location: { lat, lon, label: null }, ...computeLiveRiskScore(nearby, lat, lon, radiusKm) };
    }
    return { mode: 'prediction' as const, horizonDays, location: { lat, lon, label: null }, ...(await computePredictionRiskScore(nearby, lat, lon, radiusKm, horizonDays)) };
  } catch (err) {
    logger.warn({ err }, 'Failed to get risk score for chat context');
    return null;
  }
}

async function getNearbyHazards(lat: number, lon: number, radiusKm: number) {
  try {
    const { getMarkersFromSources } = await import('../../subsystemA/ingestion/ingestAll.js');
    const markers = await getMarkersFromSources();
    return markers.filter(m => haversineKm(lat, lon, m.lat, m.lon) <= radiusKm);
  } catch {
    return [];
  }
}

function isGdeltMode(): boolean {
  return getEnv().NEWS_MODE === 'gdelt';
}

function isPlacesMode(): boolean {
  return getEnv().AID_MODE === 'places' && !!getEnv().GOOGLE_PLACES_API_KEY;
}

// ─── GET /api/home/carousel ──────────────────────────────────
async function handleCarousel(request: FastifyRequest, reply: FastifyReply) {
  const q = carouselQuerySchema.parse(request.query);

  if (isGdeltMode()) {
    const items = await fetchCarouselNews(q.lat, q.lon);
    return { items };
  }
  return { items: getMockNews(8) };
}

// ─── GET /api/news/global ────────────────────────────────────
async function handleNewsGlobal(request: FastifyRequest, reply: FastifyReply) {
  const q = newsGlobalQuerySchema.parse(request.query);

  if (isGdeltMode()) {
    return fetchGlobalNews({ limit: q.limit, cursor: q.cursor, types: q.types });
  }
  return { items: getMockNews(q.limit), nextCursor: null };
}

// ─── GET /api/news/local ─────────────────────────────────────
async function handleNewsLocal(request: FastifyRequest, reply: FastifyReply) {
  const q = newsLocalQuerySchema.parse(request.query);

  if (isGdeltMode()) {
    return fetchLocalNews({
      lat: q.lat, lon: q.lon, radiusKm: q.radiusKm,
      limit: q.limit, cursor: q.cursor, types: q.types,
    });
  }
  return { items: getMockNews(q.limit), nextCursor: null };
}

// ─── GET /api/aid/nearby ─────────────────────────────────────
async function handleAidNearby(request: FastifyRequest, reply: FastifyReply) {
  const q = aidNearbyQuerySchema.parse(request.query);

  if (isPlacesMode()) {
    const items = await fetchPlacesNearby(q.lat, q.lon, q.radiusKm, q.limit);
    return { items };
  }
  return { items: getMockAidItems(q.lat, q.lon, q.radiusKm, q.limit) };
}

// ─── GET /api/aid/hub ────────────────────────────────────────
async function handleAidHub(request: FastifyRequest, reply: FastifyReply) {
  return getAidHubItems();
}

// ─── POST /api/chat ──────────────────────────────────────────
async function handleChat(request: FastifyRequest, reply: FastifyReply) {
  const body = chatRequestSchema.parse(request.body);

  // Assemble context from other subsystems
  const { lat, lon, label } = body.context.selected;
  const radiusKm = 100;

  const [riskScore, nearbyHazards, nearbyNewsResult, nearbyShelters] = await Promise.all([
    getRiskScore(lat, lon, radiusKm, body.context.mode, body.context.horizonDays),
    getNearbyHazards(lat, lon, radiusKm),
    isGdeltMode()
      ? fetchLocalNews({ lat, lon, radiusKm, limit: 5 })
      : Promise.resolve({ items: getMockNews(5), nextCursor: null }),
    isPlacesMode()
      ? fetchPlacesNearby(lat, lon, 25, 5)
      : Promise.resolve(getMockAidItems(lat, lon, 25, 5)),
  ]);

  return handleChatMessage(body, {
    riskScore,
    nearbyHazards,
    nearbyNews: nearbyNewsResult.items,
    nearbyShelters,
  });
}

// ─── Register Subsystem C routes ─────────────────────────────
export async function registerSubsystemCRoutes(app: FastifyInstance) {
  app.get('/api/home/carousel', {
    schema: {
      tags: ['News'],
      summary: 'Get curated news carousel (5-10 items)',
      querystring: {
        type: 'object',
        properties: {
          lat: { type: 'number' },
          lon: { type: 'number' },
        },
      },
    },
  }, handleCarousel);

  app.get('/api/news/global', {
    schema: {
      tags: ['News'],
      summary: 'Get global disaster news feed with pagination',
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'number', default: 20 },
          cursor: { type: 'string' },
          types: { type: 'string', description: 'Comma-separated hazard types' },
        },
      },
    },
  }, handleNewsGlobal);

  app.get('/api/news/local', {
    schema: {
      tags: ['News'],
      summary: 'Get local disaster news near a location',
      querystring: {
        type: 'object',
        properties: {
          lat: { type: 'number' },
          lon: { type: 'number' },
          radiusKm: { type: 'number', default: 50 },
          limit: { type: 'number', default: 20 },
          cursor: { type: 'string' },
          types: { type: 'string' },
        },
        required: ['lat', 'lon'],
      },
    },
  }, handleNewsLocal);

  app.get('/api/aid/nearby', {
    schema: {
      tags: ['Aid'],
      summary: 'Find shelters and aid resources near a location',
      querystring: {
        type: 'object',
        properties: {
          lat: { type: 'number' },
          lon: { type: 'number' },
          radiusKm: { type: 'number', default: 50 },
          limit: { type: 'number', default: 10 },
        },
        required: ['lat', 'lon'],
      },
    },
  }, handleAidNearby);

  app.get('/api/aid/hub', {
    schema: {
      tags: ['Aid'],
      summary: 'Get curated global aid resource hub',
    },
  }, handleAidHub);

  app.post('/api/chat', {
    schema: {
      tags: ['Chat'],
      summary: 'Send a message to Harbor AI assistant',
      body: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', nullable: true },
          messages: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                role: { type: 'string', enum: ['user', 'assistant'] },
                content: { type: 'string' },
              },
            },
          },
          context: {
            type: 'object',
            properties: {
              selected: {
                type: 'object',
                properties: {
                  lat: { type: 'number' },
                  lon: { type: 'number' },
                  label: { type: 'string', nullable: true },
                },
              },
              mode: { type: 'string', enum: ['live', 'prediction'] },
              horizonDays: { type: 'number' },
            },
          },
        },
      },
    },
  }, handleChat);
}
