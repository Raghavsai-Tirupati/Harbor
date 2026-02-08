import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { riskScoreQuerySchema, weatherQuerySchema, riskCompareQuerySchema } from '../../../shared/schemas/index.js';
import { computeLiveRiskScore, computePredictionRiskScore } from '../scoring/riskEngine.js';
import { fetchWeather } from '../weather/openMeteo.js';
import { queryMarkersNear } from '../../subsystemA/models/hazardStore.js';
import { getMarkersFromSources } from '../../subsystemA/ingestion/ingestAll.js';
import { haversineKm, inBbox } from '../../../shared/utils/index.js';
import type { RiskScoreResponse, WeatherResponse, HazardMarker } from '../../../shared/types/index.js';

const USE_DIRECT_FETCH = process.env.NODE_ENV === 'development' || process.env.USE_DIRECT_FETCH === 'true';

async function getNearbyMarkers(lat: number, lon: number, radiusKm: number): Promise<HazardMarker[]> {
  if (USE_DIRECT_FETCH) {
    const all = await getMarkersFromSources();
    return all.filter(m => haversineKm(lat, lon, m.lat, m.lon) <= radiusKm);
  }
  return queryMarkersNear(lat, lon, radiusKm);
}

// ─── GET /api/risk/score ─────────────────────────────────────
export async function handleRiskScore(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<RiskScoreResponse> {
  const q = riskScoreQuerySchema.parse(request.query);
  const markers = await getNearbyMarkers(q.lat, q.lon, q.radiusKm);

  let result;
  if (q.mode === 'live') {
    result = computeLiveRiskScore(markers, q.lat, q.lon, q.radiusKm);
  } else {
    result = await computePredictionRiskScore(markers, q.lat, q.lon, q.radiusKm, q.horizonDays, q.month);
  }

  return {
    mode: q.mode,
    horizonDays: q.horizonDays,
    location: { lat: q.lat, lon: q.lon, label: null },
    ...result,
  };
}

// ─── GET /api/weather ────────────────────────────────────────
export async function handleWeather(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<WeatherResponse> {
  const q = weatherQuerySchema.parse(request.query);
  return fetchWeather(q.lat, q.lon, q.mode, q.days);
}

// ─── GET /api/risk/compare (judge-wow bonus) ─────────────────
export async function handleRiskCompare(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const q = riskCompareQuerySchema.parse(request.query);

  const [markers1, markers2] = await Promise.all([
    getNearbyMarkers(q.lat1, q.lon1, 50),
    getNearbyMarkers(q.lat2, q.lon2, 50),
  ]);

  const compute = async (markers: HazardMarker[], lat: number, lon: number) => {
    if (q.mode === 'live') {
      return computeLiveRiskScore(markers, lat, lon, 50);
    }
    return computePredictionRiskScore(markers, lat, lon, 50, q.horizonDays);
  };

  const [result1, result2] = await Promise.all([
    compute(markers1, q.lat1, q.lon1),
    compute(markers2, q.lat2, q.lon2),
  ]);

  return {
    mode: q.mode,
    horizonDays: q.horizonDays,
    locations: [
      { lat: q.lat1, lon: q.lon1, label: null, ...result1 },
      { lat: q.lat2, lon: q.lon2, label: null, ...result2 },
    ],
    comparison: {
      saferLocation: result1.hazardRiskScore <= result2.hazardRiskScore ? 1 : 2,
      riskDifference: Math.abs(result1.hazardRiskScore - result2.hazardRiskScore),
      summary: result1.hazardRiskScore === result2.hazardRiskScore
        ? 'Both locations have similar risk levels'
        : `Location ${result1.hazardRiskScore <= result2.hazardRiskScore ? '1' : '2'} is safer by ${Math.abs(result1.hazardRiskScore - result2.hazardRiskScore)} points`,
    },
  };
}

// ─── Register Subsystem B routes ─────────────────────────────
export async function registerSubsystemBRoutes(app: FastifyInstance) {
  app.get('/api/risk/score', {
    schema: {
      tags: ['Risk'],
      summary: 'Compute risk score for a location',
      querystring: {
        type: 'object',
        properties: {
          lat: { type: 'number' },
          lon: { type: 'number' },
          radiusKm: { type: 'number', default: 50 },
          horizonDays: { type: 'number', enum: [7, 30, 90], default: 7 },
          mode: { type: 'string', enum: ['live', 'prediction'], default: 'live' },
          month: { type: 'number', minimum: 1, maximum: 12 },
        },
        required: ['lat', 'lon'],
      },
    },
  }, handleRiskScore);

  app.get('/api/weather', {
    schema: {
      tags: ['Weather'],
      summary: 'Get weather data for a location',
      querystring: {
        type: 'object',
        properties: {
          lat: { type: 'number' },
          lon: { type: 'number' },
          mode: { type: 'string', enum: ['live', 'forecast'], default: 'live' },
          hours: { type: 'number', default: 24 },
          days: { type: 'number', default: 7 },
        },
        required: ['lat', 'lon'],
      },
    },
  }, handleWeather);

  app.get('/api/risk/compare', {
    schema: {
      tags: ['Risk'],
      summary: 'Compare risk between two locations',
      querystring: {
        type: 'object',
        properties: {
          lat1: { type: 'number' },
          lon1: { type: 'number' },
          lat2: { type: 'number' },
          lon2: { type: 'number' },
          mode: { type: 'string', enum: ['live', 'prediction'], default: 'live' },
          horizonDays: { type: 'number', enum: [7, 30, 90], default: 7 },
        },
        required: ['lat1', 'lon1', 'lat2', 'lon2'],
      },
    },
  }, handleRiskCompare);
}
