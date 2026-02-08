import { fetchJson, logger, normalizeScore } from '../../../shared/utils/index.js';
import { getEnv } from '../../../shared/config.js';
import type { HazardMarker } from '../../../shared/types/index.js';

/**
 * NASA FIRMS (Fire Information for Resource Management System)
 * API: https://firms.modaps.eosdis.nasa.gov/api/
 *
 * Uses the VIIRS (S-NPP/NOAA-20) active fire data.
 * Free API key required from https://firms.modaps.eosdis.nasa.gov/api/area/
 *
 * Endpoint: CSV or JSON for world fires in last 24h/48h.
 * We use the country-level or world-level data.
 */

// FIRMS CSV endpoint for world data (last 24h)
function firmsUrl(apiKey: string, dayRange: 1 | 2 = 1): string {
  // Use VIIRS_SNPP data source, world area, JSON format
  return `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${apiKey}/VIIRS_SNPP_NRT/world/${dayRange}`;
}

// Alternative: Use FIRMS MAP_KEY for GeoJSON (simpler)
function firmsGeoJsonUrl(apiKey: string): string {
  return `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${apiKey}/VIIRS_SNPP_NRT/world/1`;
}

interface FIRMSRecord {
  latitude: number;
  longitude: number;
  bright_ti4: number;  // brightness temp (K)
  bright_ti5: number;
  frp: number;         // fire radiative power (MW)
  confidence: string;  // 'low', 'nominal', 'high'
  acq_date: string;    // YYYY-MM-DD
  acq_time: string;    // HHMM
  daynight: string;    // 'D' or 'N'
}

/**
 * Convert FRP (fire radiative power) to severity 0-100.
 * FRP ranges widely; typical significant fires: 10-500+ MW
 */
function frpToSeverity(frp: number, confidence: string): number {
  let base: number;
  if (frp < 5) base = 10;
  else if (frp < 20) base = 20 + (frp - 5) * 1.5;
  else if (frp < 100) base = 42 + (frp - 20) * 0.4;
  else if (frp < 500) base = 74 + (frp - 100) * 0.065;
  else base = 90;

  // Adjust by confidence
  const confMult = confidence === 'high' ? 1.1 : confidence === 'low' ? 0.7 : 1.0;
  return normalizeScore(base * confMult);
}

function parseFirmsCsv(csvText: string): FIRMSRecord[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  const latIdx = headers.indexOf('latitude');
  const lonIdx = headers.indexOf('longitude');
  const frpIdx = headers.indexOf('frp');
  const confIdx = headers.indexOf('confidence');
  const dateIdx = headers.indexOf('acq_date');
  const timeIdx = headers.indexOf('acq_time');
  const brightIdx = headers.indexOf('bright_ti4');

  if (latIdx < 0 || lonIdx < 0) return [];

  const records: FIRMSRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length < headers.length) continue;
    records.push({
      latitude: parseFloat(cols[latIdx]),
      longitude: parseFloat(cols[lonIdx]),
      bright_ti4: parseFloat(cols[brightIdx] || '0'),
      bright_ti5: 0,
      frp: parseFloat(cols[frpIdx] || '0'),
      confidence: (cols[confIdx] || 'nominal').trim().toLowerCase(),
      acq_date: cols[dateIdx] || '',
      acq_time: cols[timeIdx] || '',
      daynight: 'D',
    });
  }
  return records;
}

/**
 * Cluster nearby fire points to reduce marker count.
 * Simple grid-based clustering: round lat/lon to ~10km grid.
 */
function clusterFires(records: FIRMSRecord[]): HazardMarker[] {
  const grid = new Map<string, { records: FIRMSRecord[]; totalFrp: number }>();

  for (const r of records) {
    // Round to ~0.1 degree (~11km) grid
    const key = `${(Math.round(r.latitude * 10) / 10).toFixed(1)},${(Math.round(r.longitude * 10) / 10).toFixed(1)}`;
    const cell = grid.get(key) || { records: [], totalFrp: 0 };
    cell.records.push(r);
    cell.totalFrp += r.frp || 0;
    grid.set(key, cell);
  }

  const markers: HazardMarker[] = [];
  let idx = 0;

  for (const [key, cell] of grid) {
    // Centroid of cluster
    const avgLat = cell.records.reduce((s, r) => s + r.latitude, 0) / cell.records.length;
    const avgLon = cell.records.reduce((s, r) => s + r.longitude, 0) / cell.records.length;
    const maxConf = cell.records.some(r => r.confidence === 'high')
      ? 'high'
      : cell.records.some(r => r.confidence === 'nominal') ? 'nominal' : 'low';

    const severity = frpToSeverity(cell.totalFrp / cell.records.length, maxConf);
    const latestRecord = cell.records.reduce((a, b) =>
      (a.acq_date + a.acq_time) > (b.acq_date + b.acq_time) ? a : b
    );

    markers.push({
      id: `firms-cluster-${idx++}`,
      hazardType: 'wildfire',
      lat: Math.round(avgLat * 1000) / 1000,
      lon: Math.round(avgLon * 1000) / 1000,
      severity,
      weight: Math.min(cell.records.length, 20),
      title: `Wildfire cluster (${cell.records.length} detections, avg FRP: ${Math.round(cell.totalFrp / cell.records.length)} MW)`,
      updatedAt: latestRecord.acq_date
        ? new Date(`${latestRecord.acq_date}T${latestRecord.acq_time.padStart(4, '0').slice(0,2)}:${latestRecord.acq_time.padStart(4, '0').slice(2)}Z`).toISOString()
        : new Date().toISOString(),
      source: {
        name: 'NASA FIRMS',
        url: 'https://firms.modaps.eosdis.nasa.gov',
      },
      geometry: {
        type: 'Point',
        coordinates: [Math.round(avgLon * 1000) / 1000, Math.round(avgLat * 1000) / 1000],
      },
    });
  }

  return markers;
}

export async function fetchFIRMSWildfires(): Promise<{ markers: HazardMarker[]; raw: string | null }> {
  const apiKey = getEnv().FIRMS_API_KEY;

  if (!apiKey) {
    logger.warn('FIRMS_API_KEY not set – returning empty wildfire data');
    return { markers: [], raw: null };
  }

  const url = firmsUrl(apiKey, 1);
  logger.info({ url: url.replace(apiKey, '***') }, 'Fetching NASA FIRMS wildfires');

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);

    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'text/csv' },
    });
    clearTimeout(timer);

    if (!resp.ok) {
      throw new Error(`FIRMS HTTP ${resp.status}`);
    }

    const csvText = await resp.text();
    const records = parseFirmsCsv(csvText);
    logger.info({ rawCount: records.length }, 'FIRMS raw fire detections');

    // Cluster to reduce marker count
    const markers = clusterFires(records);
    logger.info({ clusterCount: markers.length }, 'FIRMS clustered markers');

    return { markers, raw: csvText };
  } catch (err) {
    logger.error({ err }, 'FIRMS fetch failed');
    return { markers: [], raw: null };
  }
}
