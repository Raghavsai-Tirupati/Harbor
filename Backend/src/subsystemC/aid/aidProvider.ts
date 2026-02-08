import { fetchJson, haversineKm, logger } from '../../../shared/utils/index.js';
import { getEnv } from '../../../shared/config.js';
import type { AidItem, AidHubItem, AidHubResponse } from '../../../shared/types/index.js';

// ─── Google Places Provider ──────────────────────────────────
const PLACES_NEARBY_URL = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';

interface PlacesResult {
  place_id: string;
  name: string;
  vicinity: string;
  geometry: { location: { lat: number; lng: number } };
  types: string[];
  business_status?: string;
  rating?: number;
}

interface PlacesResponse {
  results: PlacesResult[];
  status: string;
}

// Map Google Places types to our AidType
function mapPlaceType(types: string[]): AidItem['type'] {
  if (types.includes('hospital') || types.includes('doctor')) return 'hospital';
  if (types.includes('fire_station') || types.includes('police')) return 'aid';
  if (types.includes('local_government_office')) return 'aid';
  if (types.includes('food') || types.includes('meal_delivery')) return 'food';
  return 'shelter';
}

export async function fetchPlacesNearby(lat: number, lon: number, radiusKm: number, limit: number): Promise<AidItem[]> {
  const apiKey = getEnv().GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    logger.warn('GOOGLE_PLACES_API_KEY not set, using mock provider');
    return getMockAidItems(lat, lon, radiusKm, limit);
  }

  const radiusMeters = Math.min(radiusKm * 1000, 50000); // Max 50km for Places API
  const keywords = ['shelter', 'emergency', 'red cross', 'hospital', 'evacuation center'];

  const allResults: PlacesResult[] = [];

  // Search for multiple keyword types to get varied results
  for (const keyword of keywords.slice(0, 3)) {
    const url = new URL(PLACES_NEARBY_URL);
    url.searchParams.set('location', `${lat},${lon}`);
    url.searchParams.set('radius', String(radiusMeters));
    url.searchParams.set('keyword', keyword);
    url.searchParams.set('key', apiKey);

    try {
      const data = await fetchJson<PlacesResponse>(url.toString(), { timeoutMs: 8000 });
      if (data.status === 'OK' && data.results) {
        allResults.push(...data.results);
      }
    } catch (err) {
      logger.warn({ err, keyword }, 'Places API search failed for keyword');
    }
  }

  // Deduplicate by place_id
  const seen = new Set<string>();
  const unique = allResults.filter(r => {
    if (seen.has(r.place_id)) return false;
    seen.add(r.place_id);
    return true;
  });

  return unique.slice(0, limit).map((r): AidItem => ({
    id: `places-${r.place_id}`,
    name: r.name,
    type: mapPlaceType(r.types),
    address: r.vicinity || null,
    phone: null,  // Requires Place Details API call (cost)
    url: null,
    distanceKm: Math.round(haversineKm(lat, lon, r.geometry.location.lat, r.geometry.location.lng) * 10) / 10,
    lat: r.geometry.location.lat,
    lon: r.geometry.location.lng,
    source: { name: 'google_places', url: `https://www.google.com/maps/place/?q=place_id:${r.place_id}` },
  }));
}

// ─── Mock Provider ───────────────────────────────────────────
/**
 * Returns plausible but clearly labeled mock shelter data.
 * CRITICAL: These are NOT real addresses. Used only when Places API is unavailable.
 */
export function getMockAidItems(lat: number, lon: number, radiusKm: number, limit: number): AidItem[] {
  // Generate mock items around the requested location
  const mockItems: AidItem[] = [
    {
      id: 'mock-shelter-1',
      name: 'Community Emergency Shelter (Mock Data)',
      type: 'shelter',
      address: null,  // NEVER fabricate addresses
      phone: null,
      url: 'https://www.redcross.org/find-your-local-chapter.html',
      distanceKm: 2.5,
      lat: lat + 0.02,
      lon: lon + 0.01,
      source: { name: 'mock', url: null },
    },
    {
      id: 'mock-hospital-1',
      name: 'Regional Hospital (Mock Data)',
      type: 'hospital',
      address: null,
      phone: null,
      url: null,
      distanceKm: 5.1,
      lat: lat - 0.03,
      lon: lon + 0.02,
      source: { name: 'mock', url: null },
    },
    {
      id: 'mock-ngo-1',
      name: 'Red Cross Local Chapter (Mock Data)',
      type: 'ngo',
      address: null,
      phone: null,
      url: 'https://www.redcross.org',
      distanceKm: 8.3,
      lat: lat + 0.05,
      lon: lon - 0.03,
      source: { name: 'mock', url: null },
    },
    {
      id: 'mock-food-1',
      name: 'Emergency Food Distribution Center (Mock Data)',
      type: 'food',
      address: null,
      phone: null,
      url: null,
      distanceKm: 3.7,
      lat: lat - 0.01,
      lon: lon - 0.02,
      source: { name: 'mock', url: null },
    },
  ];

  return mockItems.slice(0, limit);
}

// ─── Aid Hub (curated global resources) ──────────────────────
export function getAidHubItems(): AidHubResponse {
  return {
    items: [
      {
        name: 'International Federation of Red Cross',
        url: 'https://www.ifrc.org',
        description: 'Global humanitarian network providing disaster relief and recovery services.',
        scope: 'global',
      },
      {
        name: 'UN OCHA ReliefWeb',
        url: 'https://reliefweb.int',
        description: 'UN coordination hub for humanitarian information on disasters worldwide.',
        scope: 'global',
      },
      {
        name: 'FEMA (US)',
        url: 'https://www.fema.gov',
        description: 'US Federal Emergency Management Agency – disaster preparedness and response.',
        scope: 'national',
        country: 'US',
      },
      {
        name: 'Ready.gov',
        url: 'https://www.ready.gov',
        description: 'US government resource for emergency preparedness and planning.',
        scope: 'national',
        country: 'US',
      },
      {
        name: 'UNICEF Emergency Programmes',
        url: 'https://www.unicef.org/emergencies',
        description: 'UNICEF emergency programs for children affected by disasters.',
        scope: 'global',
      },
      {
        name: 'World Food Programme',
        url: 'https://www.wfp.org',
        description: 'UN agency fighting hunger, including emergency food assistance.',
        scope: 'global',
      },
      {
        name: 'Médecins Sans Frontières',
        url: 'https://www.msf.org',
        description: 'International medical humanitarian organization for crisis zones.',
        scope: 'global',
      },
      {
        name: 'Global Disaster Alert and Coordination System',
        url: 'https://www.gdacs.org',
        description: 'Framework for disaster alerts and international coordination.',
        scope: 'global',
      },
      {
        name: 'European Civil Protection (EU)',
        url: 'https://civil-protection-humanitarian-aid.ec.europa.eu',
        description: 'EU emergency response coordination center.',
        scope: 'regional',
      },
      {
        name: 'Direct Relief',
        url: 'https://www.directrelief.org',
        description: 'Nonprofit providing medical assistance to people affected by emergencies.',
        scope: 'global',
      },
    ],
  };
}
