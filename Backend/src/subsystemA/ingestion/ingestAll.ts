import { fetchUSGSEarthquakes } from '../adapters/usgsAdapter.js';
import { fetchFIRMSWildfires } from '../adapters/firmsAdapter.js';
import { fetchEONETEvents } from '../adapters/eonetAdapter.js';
import { putMarkers } from '../models/hazardStore.js';
import { saveSnapshot } from '../models/snapshotWriter.js';
import { logger } from '../../../shared/utils/index.js';
import type { HazardMarker } from '../../../shared/types/index.js';

export interface IngestionResult {
  source: string;
  count: number;
  errors: string[];
}

/**
 * Run full hazard ingestion from all sources.
 * Called by EventBridge schedule (every 15-30 min) or manually.
 */
export async function runFullIngestion(): Promise<IngestionResult[]> {
  const results: IngestionResult[] = [];
  const allMarkers: HazardMarker[] = [];

  // ── USGS Earthquakes ──────────────────────────────────────
  try {
    const { markers, raw } = await fetchUSGSEarthquakes('day', 2.5);
    allMarkers.push(...markers);
    results.push({ source: 'usgs', count: markers.length, errors: [] });
    if (raw) await saveSnapshot('usgs', raw).catch(() => {});
  } catch (err: any) {
    logger.error({ err }, 'USGS ingestion failed');
    results.push({ source: 'usgs', count: 0, errors: [err.message] });
  }

  // ── NASA FIRMS Wildfires ──────────────────────────────────
  try {
    const { markers, raw } = await fetchFIRMSWildfires();
    allMarkers.push(...markers);
    results.push({ source: 'firms', count: markers.length, errors: [] });
    if (raw) await saveSnapshot('firms', { csv_length: raw.length }).catch(() => {});
  } catch (err: any) {
    logger.error({ err }, 'FIRMS ingestion failed');
    results.push({ source: 'firms', count: 0, errors: [err.message] });
  }

  // ── NASA EONET (multi-hazard) ─────────────────────────────
  try {
    const { markers, raw } = await fetchEONETEvents(7);
    allMarkers.push(...markers);
    results.push({ source: 'eonet', count: markers.length, errors: [] });
    if (raw) await saveSnapshot('eonet', raw).catch(() => {});
  } catch (err: any) {
    logger.error({ err }, 'EONET ingestion failed');
    results.push({ source: 'eonet', count: 0, errors: [err.message] });
  }

  // ── Deduplicate by ID ─────────────────────────────────────
  const seen = new Set<string>();
  const uniqueMarkers = allMarkers.filter(m => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

  // ── Write to DynamoDB ─────────────────────────────────────
  if (uniqueMarkers.length > 0) {
    const written = await putMarkers(uniqueMarkers);
    logger.info({ total: uniqueMarkers.length, written }, 'Ingestion complete');
  }

  return results;
}

// In-memory cache for fast marker serving between DDB reads
let _cachedMarkers: HazardMarker[] = [];
let _cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Quick fetch from all sources without DDB (for local dev).
 * In prod, markers come from DDB (written by scheduled ingestion).
 */
export async function getMarkersFromSources(): Promise<HazardMarker[]> {
  if (Date.now() - _cacheTime < CACHE_TTL && _cachedMarkers.length > 0) {
    return _cachedMarkers;
  }

  const [usgs, firms, eonet] = await Promise.allSettled([
    fetchUSGSEarthquakes('day', 2.5),
    fetchFIRMSWildfires(),
    fetchEONETEvents(7),
  ]);

  const markers: HazardMarker[] = [];
  if (usgs.status === 'fulfilled') markers.push(...usgs.value.markers);
  if (firms.status === 'fulfilled') markers.push(...firms.value.markers);
  if (eonet.status === 'fulfilled') markers.push(...eonet.value.markers);

  _cachedMarkers = markers;
  _cacheTime = Date.now();
  return markers;
}
