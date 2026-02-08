import { fetchJson, logger } from '../../../shared/utils/index.js';
import { featherlessSummarize } from '../ai/featherlessClient.js';
import type { NewsItem, HazardType } from '../../../shared/types/index.js';

/**
 * GDELT 2.1 Doc API
 * https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
 *
 * Free, no key required. Rate limits apply.
 * Query endpoint: https://api.gdeltproject.org/api/v2/doc/doc?query=...&format=json
 */

const GDELT_API = 'https://api.gdeltproject.org/api/v2/doc/doc';

// Keywords for each hazard type
const HAZARD_KEYWORDS: Record<HazardType, string[]> = {
  wildfire: ['wildfire', 'forest fire', 'bushfire', 'blaze'],
  earthquake: ['earthquake', 'seismic', 'tremor', 'quake'],
  cyclone: ['hurricane', 'cyclone', 'typhoon', 'tropical storm'],
  flood: ['flood', 'flooding', 'flash flood', 'inundation'],
  tornado: ['tornado', 'twister', 'funnel cloud'],
  other: ['disaster', 'natural disaster', 'emergency', 'evacuation'],
};

interface GDELTArticle {
  url: string;
  url_mobile: string;
  title: string;
  seendate: string;   // YYYYMMDDTHHMMSSZ
  socialimage: string;
  domain: string;
  language: string;
  sourcecountry: string;
}

interface GDELTResponse {
  articles?: GDELTArticle[];
}

function parseGdeltDate(dateStr: string): string {
  // Format: 20240115T143000Z -> 2024-01-15T14:30:00Z
  try {
    const y = dateStr.slice(0, 4);
    const m = dateStr.slice(4, 6);
    const d = dateStr.slice(6, 8);
    const h = dateStr.slice(9, 11);
    const min = dateStr.slice(11, 13);
    const s = dateStr.slice(13, 15);
    return `${y}-${m}-${d}T${h}:${min}:${s}Z`;
  } catch {
    return new Date().toISOString();
  }
}

function detectHazardTypes(title: string): HazardType[] {
  const lower = title.toLowerCase();
  const types: HazardType[] = [];

  for (const [type, keywords] of Object.entries(HAZARD_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      types.push(type as HazardType);
    }
  }

  return types.length > 0 ? types : ['other'];
}

async function queryGDELT(params: {
  query: string;
  maxRecords?: number;
  startDate?: string;
  endDate?: string;
  sort?: 'date' | 'rel';
}): Promise<GDELTArticle[]> {
  const { query, maxRecords = 20, sort = 'date' } = params;

  const url = new URL(GDELT_API);
  url.searchParams.set('query', query);
  url.searchParams.set('mode', 'artlist');
  url.searchParams.set('maxrecords', String(maxRecords));
  url.searchParams.set('sort', sort === 'date' ? 'DateDesc' : 'HybridRel');
  url.searchParams.set('format', 'json');

  if (params.startDate) url.searchParams.set('startdatetime', params.startDate);
  if (params.endDate) url.searchParams.set('enddatetime', params.endDate);

  try {
    const data = await fetchJson<GDELTResponse>(url.toString(), { timeoutMs: 12000 });
    return data.articles || [];
  } catch (err) {
    logger.error({ err, query }, 'GDELT query failed');
    return [];
  }
}

function articleToNewsItem(article: GDELTArticle, index: number, summary?: string): NewsItem {
  return {
    id: `gdelt-${Buffer.from(article.url).toString('base64url').slice(0, 20)}-${index}`,
    title: article.title || 'Untitled',
    summary: summary || article.title || '',
    source: article.domain || 'Unknown',
    url: article.url,
    imageUrl: article.socialimage || null,
    publishedAt: parseGdeltDate(article.seendate),
    hazardTypes: detectHazardTypes(article.title),
  };
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Fetch global disaster news.
 */
export async function fetchGlobalNews(params: {
  limit: number;
  cursor?: string;
  types?: HazardType[];
}): Promise<{ items: NewsItem[]; nextCursor: string | null }> {
  const { limit, types } = params;

  // Build query from hazard types or use general disaster query
  let query: string;
  if (types && types.length > 0) {
    const keywords = types.flatMap(t => HAZARD_KEYWORDS[t] || []).slice(0, 5);
    query = keywords.join(' OR ');
  } else {
    query = 'earthquake OR wildfire OR hurricane OR flood OR tornado OR disaster';
  }

  const articles = await queryGDELT({ query, maxRecords: limit + 5, sort: 'date' });

  const items = articles.slice(0, limit).map((a, i) => articleToNewsItem(a, i));

  // Simple cursor: use last article's date
  const nextCursor = items.length >= limit && items.length > 0
    ? Buffer.from(items[items.length - 1].publishedAt).toString('base64url')
    : null;

  return { items, nextCursor };
}

/**
 * Fetch local disaster news near a location.
 * GDELT doesn't support geo-queries natively, so we use country-level filtering.
 */
export async function fetchLocalNews(params: {
  lat: number;
  lon: number;
  radiusKm: number;
  limit: number;
  cursor?: string;
  types?: HazardType[];
}): Promise<{ items: NewsItem[]; nextCursor: string | null }> {
  const { lat, lon, limit, types } = params;

  // Use nearby geocoding to get region name (simplified)
  const region = getApproxRegion(lat, lon);

  let query: string;
  const baseKeywords = types && types.length > 0
    ? types.flatMap(t => HAZARD_KEYWORDS[t] || []).slice(0, 3).join(' OR ')
    : 'earthquake OR wildfire OR hurricane OR flood OR disaster';

  query = `(${baseKeywords}) ${region}`;

  const articles = await queryGDELT({ query, maxRecords: limit + 5, sort: 'date' });
  const items = articles.slice(0, limit).map((a, i) => articleToNewsItem(a, i));

  const nextCursor = items.length >= limit && items.length > 0
    ? Buffer.from(items[items.length - 1].publishedAt).toString('base64url')
    : null;

  return { items, nextCursor };
}

/**
 * Fetch curated carousel items (5-10 max) with AI-generated summaries.
 */
export async function fetchCarouselNews(lat?: number, lon?: number): Promise<NewsItem[]> {
  const query = 'earthquake OR wildfire OR hurricane OR flood OR tornado';
  const articles = await queryGDELT({ query, maxRecords: 10, sort: 'date' });

  // Generate short summaries using Featherless
  const items: NewsItem[] = [];
  for (const [i, article] of articles.slice(0, 8).entries()) {
    let summary = article.title;
    try {
      summary = await featherlessSummarize(article.title, 20);
    } catch {
      // Use title as fallback
    }
    items.push(articleToNewsItem(article, i, summary));
  }

  return items.slice(0, 10);
}

// ─── Helpers ─────────────────────────────────────────────────
function getApproxRegion(lat: number, lon: number): string {
  // Very rough region mapping for GDELT queries
  if (lat > 24 && lat < 50 && lon > -130 && lon < -60) return 'United States';
  if (lat > 35 && lat < 72 && lon > -10 && lon < 40) return 'Europe';
  if (lat > -35 && lat < 35 && lon > 60 && lon < 150) return 'Asia';
  if (lat > -50 && lat < -10 && lon > 110 && lon < 180) return 'Australia';
  if (lat > 5 && lat < 40 && lon > 60 && lon < 100) return 'India';
  if (lat > -55 && lat < 13 && lon > -80 && lon < -35) return 'South America';
  if (lat > -35 && lat < 38 && lon > -20 && lon < 55) return 'Africa';
  if (lat > 20 && lat < 50 && lon > 100 && lon < 150) return 'Japan China';
  return ''; // Empty region = global fallback
}

// ─── Mock Provider ───────────────────────────────────────────
export function getMockNews(limit = 10): NewsItem[] {
  const mockItems: NewsItem[] = [
    {
      id: 'mock-1', title: '6.2 Earthquake strikes off coast of Chile',
      summary: 'A 6.2 magnitude earthquake was reported off the coast of Chile, triggering tsunami warnings.',
      source: 'Reuters', url: 'https://reuters.com', imageUrl: null,
      publishedAt: new Date().toISOString(), hazardTypes: ['earthquake'],
    },
    {
      id: 'mock-2', title: 'Wildfires spread across Southern California',
      summary: 'Multiple wildfires are burning across Southern California amid dry conditions and high winds.',
      source: 'AP News', url: 'https://apnews.com', imageUrl: null,
      publishedAt: new Date().toISOString(), hazardTypes: ['wildfire'],
    },
    {
      id: 'mock-3', title: 'Hurricane warning issued for Gulf Coast',
      summary: 'The National Hurricane Center has issued warnings as a tropical system strengthens.',
      source: 'Weather.com', url: 'https://weather.com', imageUrl: null,
      publishedAt: new Date().toISOString(), hazardTypes: ['cyclone'],
    },
    {
      id: 'mock-4', title: 'Flash flooding in Southeast Asia',
      summary: 'Heavy monsoon rains cause flash flooding across parts of Southeast Asia.',
      source: 'BBC', url: 'https://bbc.com', imageUrl: null,
      publishedAt: new Date().toISOString(), hazardTypes: ['flood'],
    },
    {
      id: 'mock-5', title: 'Tornado outbreak in central US',
      summary: 'Multiple tornadoes reported across Kansas and Oklahoma.',
      source: 'CNN', url: 'https://cnn.com', imageUrl: null,
      publishedAt: new Date().toISOString(), hazardTypes: ['tornado'],
    },
  ];

  return mockItems.slice(0, limit);
}
