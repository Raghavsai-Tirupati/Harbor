import { fetchJson, logger, normalizeScore } from '../../../shared/utils/index.js';
import type { HazardMarker, HazardType } from '../../../shared/types/index.js';

/**
 * NASA EONET (Earth Observatory Natural Event Tracker)
 * API v3: https://eonet.gsfc.nasa.gov/docs/v3
 * Free, no key required.
 *
 * Categories: wildfires, severe storms, volcanoes, floods, earthquakes, etc.
 */

const EONET_URL = 'https://eonet.gsfc.nasa.gov/api/v3/events';

interface EONETSource {
  id: string;
  url: string;
}

interface EONETGeometry {
  magnitudeValue: number | null;
  magnitudeUnit: string | null;
  date: string;
  type: string;
  coordinates: number[];
}

interface EONETEvent {
  id: string;
  title: string;
  description: string | null;
  link: string;
  closed: string | null;
  categories: { id: string; title: string }[];
  sources: EONETSource[];
  geometry: EONETGeometry[];
}

interface EONETResponse {
  title: string;
  events: EONETEvent[];
}

// Map EONET categories to our HazardType
const CATEGORY_MAP: Record<string, HazardType> = {
  wildfires: 'wildfire',
  severeStorms: 'cyclone',
  volcanoes: 'other',
  floods: 'flood',
  earthquakes: 'earthquake',
  drought: 'other',
  dustHaze: 'other',
  landslides: 'other',
  manmade: 'other',
  seaLakeIce: 'other',
  snow: 'other',
  tempExtremes: 'other',
  waterColor: 'other',
};

function eonetMagnitudeToSeverity(mag: number | null, category: string): number {
  if (mag === null) return 30; // default moderate
  // Different scales per category
  if (category === 'wildfires') return normalizeScore(Math.min(mag / 5, 100));
  if (category === 'earthquakes') return normalizeScore(mag * 12);
  if (category === 'severeStorms') return normalizeScore(40 + mag * 0.3);
  return normalizeScore(30 + mag * 0.5);
}

export async function fetchEONETEvents(days = 7): Promise<{ markers: HazardMarker[]; raw: EONETResponse | null }> {
  const url = `${EONET_URL}?status=open&limit=200&days=${days}`;
  logger.info({ url }, 'Fetching NASA EONET events');

  try {
    const data = await fetchJson<EONETResponse>(url, { timeoutMs: 15000 });
    const markers: HazardMarker[] = [];

    for (const event of data.events) {
      if (!event.geometry || event.geometry.length === 0) continue;

      // Use latest geometry point
      const latestGeo = event.geometry[event.geometry.length - 1];
      if (latestGeo.type !== 'Point' || !latestGeo.coordinates || latestGeo.coordinates.length < 2) continue;

      const categoryId = event.categories[0]?.id || 'other';
      const hazardType = CATEGORY_MAP[categoryId] || 'other';

      markers.push({
        id: `eonet-${event.id}`,
        hazardType,
        lat: latestGeo.coordinates[1],
        lon: latestGeo.coordinates[0],
        severity: eonetMagnitudeToSeverity(latestGeo.magnitudeValue, categoryId),
        weight: 5,
        title: event.title,
        updatedAt: latestGeo.date || new Date().toISOString(),
        source: {
          name: 'NASA EONET',
          url: event.link || 'https://eonet.gsfc.nasa.gov',
        },
        geometry: {
          type: 'Point',
          coordinates: [latestGeo.coordinates[0], latestGeo.coordinates[1]],
        },
      });
    }

    logger.info({ count: markers.length }, 'EONET events normalized');
    return { markers, raw: data };
  } catch (err) {
    logger.error({ err }, 'EONET fetch failed');
    return { markers: [], raw: null };
  }
}
