import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { hazardMarkersQuerySchema } from '../../../shared/schemas/index.js';
import { queryMarkersByBbox, queryMarkersNear, queryRecentMarkers } from '../models/hazardStore.js';
import { getMarkersFromSources, runFullIngestion } from '../ingestion/ingestAll.js';
import { inBbox, haversineKm, logger } from '../../../shared/utils/index.js';
import type { HazardMarker, HazardMarkersResponse, HotspotsResponse, HotspotItem } from '../../../shared/types/index.js';

/**
 * Determines whether to use DDB or direct-fetch based on environment.
 * In local dev without DDB, we fetch directly from sources.
 */
const USE_DIRECT_FETCH = process.env.NODE_ENV === 'development' || process.env.USE_DIRECT_FETCH === 'true';

async function getMarkers(bbox: [number, number, number, number], types?: string[], sinceHours = 48): Promise<HazardMarker[]> {
  if (USE_DIRECT_FETCH) {
    let markers = await getMarkersFromSources();
    markers = markers.filter(m => inBbox(m.lat, m.lon, bbox));
    if (types && types.length > 0) {
      markers = markers.filter(m => types.includes(m.hazardType));
    }
    return markers;
  }
  return queryMarkersByBbox({ bbox, types, sinceHours });
}

async function getAllRecentMarkers(sinceHours: number): Promise<HazardMarker[]> {
  if (USE_DIRECT_FETCH) {
    return getMarkersFromSources();
  }
  return queryRecentMarkers(sinceHours);
}

// ─── GET /api/hazards/markers ────────────────────────────────
export async function handleHazardMarkers(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<HazardMarkersResponse> {
  const query = hazardMarkersQuerySchema.parse(request.query);

  const markers = await getMarkers(
    query.bbox,
    query.types,
    query.sinceHours,
  );

  return {
    mode: query.mode,
    horizonDays: query.horizonDays,
    bbox: query.bbox,
    markers,
    generatedAt: new Date().toISOString(),
  };
}

// ─── GET /api/hazards/hotspots ───────────────────────────────
export async function handleHotspots(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<HotspotsResponse> {
  const markers = await getAllRecentMarkers(24);

  // Cluster markers into ~1 degree grid cells
  const cells = new Map<string, { markers: HazardMarker[] }>();
  for (const m of markers) {
    const key = `${Math.round(m.lat)},${Math.round(m.lon)}`;
    const cell = cells.get(key) || { markers: [] };
    cell.markers.push(m);
    cells.set(key, cell);
  }

  // Score each cell and sort by total severity
  const hotspots: (HotspotItem & { totalSev: number })[] = [];
  for (const [key, cell] of cells) {
    const avgLat = cell.markers.reduce((s, m) => s + m.lat, 0) / cell.markers.length;
    const avgLon = cell.markers.reduce((s, m) => s + m.lon, 0) / cell.markers.length;
    const totalSev = cell.markers.reduce((s, m) => s + m.severity, 0);

    // Dominant hazard type
    const typeCounts = new Map<string, number>();
    for (const m of cell.markers) {
      typeCounts.set(m.hazardType, (typeCounts.get(m.hazardType) || 0) + 1);
    }
    let dominantType = 'other';
    let maxCount = 0;
    for (const [t, c] of typeCounts) {
      if (c > maxCount) { dominantType = t; maxCount = c; }
    }

    const topMarker = cell.markers.reduce((a, b) => a.severity > b.severity ? a : b);

    hotspots.push({
      lat: Math.round(avgLat * 100) / 100,
      lon: Math.round(avgLon * 100) / 100,
      label: topMarker.title,
      hazardType: dominantType as any,
      severity: Math.round(totalSev / cell.markers.length),
      markerCount: cell.markers.length,
      totalSev,
    });
  }

  hotspots.sort((a, b) => b.totalSev - a.totalSev);

  return {
    items: hotspots.slice(0, 5).map(({ totalSev, ...h }) => h),
    generatedAt: new Date().toISOString(),
  };
}

// ─── POST /api/hazards/ingest (admin only) ───────────────────
export async function handleIngest(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const results = await runFullIngestion();
  return { ok: true, results };
}

// ─── Register Subsystem A routes ─────────────────────────────
export async function registerSubsystemARoutes(app: FastifyInstance) {
  app.get('/api/hazards/markers', {
    schema: {
      tags: ['Hazards'],
      summary: 'Get hazard markers within a bounding box',
      querystring: {
        type: 'object',
        properties: {
          bbox: { type: 'string', description: 'minLon,minLat,maxLon,maxLat' },
          types: { type: 'string', description: 'Comma-separated hazard types' },
          sinceHours: { type: 'number', default: 48 },
          mode: { type: 'string', enum: ['live', 'prediction'], default: 'live' },
          horizonDays: { type: 'number', enum: [7, 30, 90], default: 7 },
        },
        required: ['bbox'],
      },
    },
  }, handleHazardMarkers);

  app.get('/api/hazards/hotspots', {
    schema: {
      tags: ['Hazards'],
      summary: 'Top 5 global hotspots by hazard severity (last 24h)',
    },
  }, handleHotspots);

  app.post('/api/hazards/ingest', {
    schema: {
      tags: ['Hazards'],
      summary: 'Trigger manual hazard ingestion (admin)',
    },
  }, handleIngest);
}
