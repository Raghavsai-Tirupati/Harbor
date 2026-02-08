import { fetchJson, logger, normalizeScore } from '../../../shared/utils/index.js';
import type { HazardMarker } from '../../../shared/types/index.js';

/**
 * USGS GeoJSON Earthquake Feed (free, no key required).
 * Feeds: https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php
 *
 * We use the "all earthquakes past day" feed for live data,
 * and "past 7 days" for broader context.
 */

const USGS_FEEDS = {
  hour: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson',
  day: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson',
  week: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson',
  // Significant only (less noise):
  significantDay: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_day.geojson',
  significantWeek: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.geojson',
} as const;

interface USGSFeature {
  id: string;
  properties: {
    mag: number | null;
    place: string;
    time: number; // epoch ms
    updated: number;
    url: string;
    title: string;
    status: string;
    type: string;
    alert?: string;
  };
  geometry: {
    type: 'Point';
    coordinates: [number, number, number]; // [lon, lat, depth]
  };
}

interface USGSResponse {
  type: 'FeatureCollection';
  features: USGSFeature[];
  metadata: {
    generated: number;
    count: number;
    title: string;
  };
}

/**
 * Convert USGS magnitude to 0-100 severity.
 * M < 2.5 → ~5-15 (minor, often unfelt)
 * M 2.5-5.0 → 15-45
 * M 5.0-7.0 → 45-75
 * M 7.0+ → 75-100
 */
function magToSeverity(mag: number | null): number {
  if (mag === null || mag < 0) return 5;
  if (mag < 2.5) return normalizeScore(mag * 6);
  if (mag < 5.0) return normalizeScore(15 + (mag - 2.5) * 12);
  if (mag < 7.0) return normalizeScore(45 + (mag - 5.0) * 15);
  return normalizeScore(75 + (mag - 7.0) * 8.3);
}

function magToWeight(mag: number | null): number {
  if (mag === null) return 1;
  return Math.max(1, Math.round(mag * 2));
}

export async function fetchUSGSEarthquakes(
  feed: keyof typeof USGS_FEEDS = 'day',
  minMagnitude = 2.5,
): Promise<{ markers: HazardMarker[]; raw: USGSResponse | null }> {
  const url = USGS_FEEDS[feed];
  logger.info({ url, feed, minMagnitude }, 'Fetching USGS earthquakes');

  try {
    const data = await fetchJson<USGSResponse>(url, { timeoutMs: 15000 });

    const markers: HazardMarker[] = data.features
      .filter(f => f.geometry && (f.properties.mag === null || f.properties.mag >= minMagnitude))
      .map((f): HazardMarker => ({
        id: `usgs-${f.id}`,
        hazardType: 'earthquake',
        lat: f.geometry.coordinates[1],
        lon: f.geometry.coordinates[0],
        severity: magToSeverity(f.properties.mag),
        weight: magToWeight(f.properties.mag),
        title: f.properties.title || `M${f.properties.mag} Earthquake`,
        updatedAt: new Date(f.properties.updated || f.properties.time).toISOString(),
        source: {
          name: 'USGS',
          url: f.properties.url || 'https://earthquake.usgs.gov',
        },
        geometry: {
          type: 'Point',
          coordinates: [f.geometry.coordinates[0], f.geometry.coordinates[1]],
        },
      }));

    logger.info({ count: markers.length, feed }, 'USGS earthquakes normalized');
    return { markers, raw: data };
  } catch (err) {
    logger.error({ err, feed }, 'USGS fetch failed');
    return { markers: [], raw: null };
  }
}
