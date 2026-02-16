/**
 * API client for Harbor.
 *
 * Calls external APIs directly from the browser — no backend server needed.
 *   - NASA EONET & USGS have CORS enabled (direct calls).
 *   - Google News RSS uses CORS proxies with multiple fallbacks.
 */

/* ── CORS Proxies (tried in order if one fails) ── */
const CORS_PROXIES = [
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?',
  'https://api.codetabs.com/v1/proxy?quest=',
];

const ALERT_CATEGORY_LABELS: Record<string, string> = {
  severeStorms: 'Severe Storm', wildfires: 'Wildfire', volcanoes: 'Volcanic Eruption',
  earthquakes: 'Earthquake', floods: 'Flooding', landslides: 'Landslide',
  droughts: 'Drought', seaLakeIce: 'Ice Event', snow: 'Snow/Blizzard',
  temperatureExtremes: 'Extreme Temperature', other: 'Natural Event',
};

function getCentroid(geom: { type: string; coordinates: number[] | number[][] | number[][][] } | undefined) {
  if (!geom) return { lat: 0, lon: 0 };
  if (geom.type === 'Point' && Array.isArray(geom.coordinates)) {
    const [lon, lat] = geom.coordinates as number[];
    return { lat, lon };
  }
  if (geom.type === 'Polygon' && Array.isArray(geom.coordinates) && geom.coordinates[0]) {
    const ring = geom.coordinates[0] as [number, number][];
    const lon = ring.reduce((s, c) => s + c[0], 0) / ring.length;
    const lat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
    return { lat, lon };
  }
  return { lat: 0, lon: 0 };
}

function computeUrgency(feature: { properties?: Record<string, unknown>; geometry?: unknown }) {
  const props = (feature.properties || {}) as Record<string, unknown>;
  const dateStr = (props.date || props.closed || new Date().toISOString()) as string;
  const ageHours = (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60);
  const recency = Math.max(0, 1 - ageHours / (7 * 24));
  const mag = (props.magnitudeValue as number) ?? 0;
  const magNorm = Math.min(1, mag / 100);
  const cats = props.categories as { id?: string }[] | undefined;
  const catId = cats?.[0]?.id || 'other';
  const weights: Record<string, number> = {
    severeStorms: 1.0, volcanoes: 0.95, earthquakes: 0.9, floods: 0.9,
    wildfires: 0.85, landslides: 0.8, temperatureExtremes: 0.75,
    seaLakeIce: 0.7, droughts: 0.65, snow: 0.6, other: 0.5,
  };
  return recency * 0.5 + magNorm * 0.2 + (weights[catId] ?? 0.5) * 0.3;
}

function getSeverity(score: number) {
  if (score >= 0.7) return 'critical';
  if (score >= 0.5) return 'high';
  if (score >= 0.3) return 'medium';
  return 'low';
}

function deduplicateByTitle<T extends { title: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const norm = item.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim().slice(0, 50);
    if (seen.has(norm)) return false;
    seen.add(norm);
    return true;
  });
}

/* ── Fetch with CORS proxy fallbacks ── */
async function fetchWithCorsProxy(targetUrl: string): Promise<string> {
  for (const proxy of CORS_PROXIES) {
    try {
      const res = await fetch(proxy + encodeURIComponent(targetUrl), { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const text = await res.text();
        if (text && text.length > 50) return text;
      }
    } catch (err) {
      console.warn(`[Harbor] CORS proxy ${proxy} failed for ${targetUrl}:`, err);
    }
  }
  throw new Error(`All CORS proxies failed for: ${targetUrl}`);
}

/* ── Parse Google News RSS XML in the browser ── */
function parseGoogleNewsXml(xml: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');
  const items = doc.querySelectorAll('item');
  const articles: { url: string; title: string; source: string; publishedAt: string | null }[] = [];
  items.forEach((item) => {
    const link = item.querySelector('link')?.textContent || '';
    const rawTitle = item.querySelector('title')?.textContent || 'Untitled';
    const title = rawTitle.replace(/ - [^-]+$/, '').trim();
    const sourceEl = item.querySelector('source');
    const source = sourceEl?.textContent || '';
    const pubDate = item.querySelector('pubDate')?.textContent || null;
    if (link) articles.push({ url: link, title, source, publishedAt: pubDate });
  });
  return articles;
}

async function fetchGoogleNewsClient(query: string, max = 8) {
  try {
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
    const xml = await fetchWithCorsProxy(rssUrl);
    return parseGoogleNewsXml(xml).slice(0, max);
  } catch (err) {
    console.warn('[Harbor] Google News fetch failed for query:', query, err);
    return [];
  }
}

/* ── Fetch EONET events (shared by alerts + headlines) ── */
async function fetchEonetEvents(days: number, limit: number) {
  console.log(`[Harbor] Fetching EONET events (days=${days}, limit=${limit})...`);
  const res = await fetch(`https://eonet.gsfc.nasa.gov/api/v3/events/geojson?status=open&days=${days}&limit=${limit}&bbox=-180,85,180,-85`);
  if (!res.ok) throw new Error(`EONET API returned ${res.status}`);
  const data = await res.json();
  console.log(`[Harbor] EONET returned ${(data.features || []).length} features`);
  return data.features || [];
}

/* ══════════════════════════════════════════════════════════
   Public API functions — used by the frontend components.
   Always call external APIs directly from the browser.
   ══════════════════════════════════════════════════════════ */

/** Fetch live disaster alerts (deduplicated, with articles) */
export async function fetchAlerts() {
  console.log('[Harbor] fetchAlerts() called');
  const features = await fetchEonetEvents(7, 100);

  const seen = new Set<string>();
  const scored: {
    id: string; title: string; category: string; categoryLabel: string;
    alertText: string; severity: string; urgencyScore: number;
    date: string; lat: number; lon: number; magnitudeValue: number | null;
    articles: unknown[];
  }[] = [];

  for (const f of features) {
    const props = f.properties || {};
    const title = props.title || 'Unknown';
    const norm = title.toLowerCase().replace(/[^a-z0-9\s]/g, '').slice(0, 50);
    if (seen.has(norm)) continue;
    seen.add(norm);
    const score = computeUrgency(f);
    const centroid = getCentroid(f.geometry);
    const catId = props.categories?.[0]?.id || 'other';
    scored.push({
      id: props.id || f.id || `a-${Math.random().toString(36).slice(2)}`,
      title,
      category: catId,
      categoryLabel: ALERT_CATEGORY_LABELS[catId] || catId,
      alertText: `${ALERT_CATEGORY_LABELS[catId] || 'Event'}: ${title}`,
      severity: getSeverity(score),
      urgencyScore: Math.round(score * 100) / 100,
      date: props.date || new Date().toISOString(),
      lat: centroid.lat,
      lon: centroid.lon,
      magnitudeValue: props.magnitudeValue || null,
      articles: [],
    });
  }

  scored.sort((a, b) => b.urgencyScore - a.urgencyScore);
  console.log(`[Harbor] fetchAlerts() returning ${scored.length} deduplicated alerts`);
  return { alerts: scored.slice(0, 10), totalEvents: features.length, fetchedAt: new Date().toISOString() };
}

/** Fetch headlines tied to NASA disasters via Google News */
export async function fetchHeadlines() {
  console.log('[Harbor] fetchHeadlines() called');

  // Step 1: Get EONET events
  let features: Record<string, unknown>[] = [];
  try {
    features = await fetchEonetEvents(14, 50);
  } catch (err) {
    console.error('[Harbor] EONET fetch failed in fetchHeadlines:', err);
    // Return empty but don't throw — show "no headlines" instead of crash
    return { articles: [], events: [], fetchedAt: new Date().toISOString() };
  }

  // Deduplicate events
  const seenTitles = new Set<string>();
  const events: { title: string; category: string; categoryLabel: string; severity: string; urgencyScore: number; date: string; magnitudeValue: number | null }[] = [];
  for (const f of features) {
    const props = (f.properties || {}) as Record<string, unknown>;
    const title = ((props.title as string) || '').trim();
    const norm = title.toLowerCase().replace(/[^a-z0-9\s]/g, '').slice(0, 50);
    if (!norm || seenTitles.has(norm)) continue;
    seenTitles.add(norm);
    const cats = props.categories as { id?: string }[] | undefined;
    const catId = cats?.[0]?.id || 'other';
    const score = computeUrgency(f as { properties?: Record<string, unknown>; geometry?: unknown });
    events.push({
      title, category: catId, categoryLabel: ALERT_CATEGORY_LABELS[catId] || catId,
      severity: getSeverity(score), urgencyScore: score,
      date: (props.date as string) || new Date().toISOString(),
      magnitudeValue: (props.magnitudeValue as number) || null,
    });
  }
  events.sort((a, b) => b.urgencyScore - a.urgencyScore);
  console.log(`[Harbor] ${events.length} unique EONET events found`);

  // Step 2: Fetch Google News for top 6 events
  const topEvents = events.slice(0, 6);
  console.log('[Harbor] Fetching Google News for top events:', topEvents.map((e) => e.title));
  const newsResults = await Promise.allSettled(
    topEvents.map((e) => fetchGoogleNewsClient(e.title, 5))
  );

  // Step 3: Also fetch general disaster news
  let generalNews: { url: string; title: string; source: string; publishedAt: string | null }[] = [];
  try {
    generalNews = await fetchGoogleNewsClient(
      'natural disaster OR earthquake OR hurricane OR wildfire OR flood OR cyclone OR tsunami', 10
    );
    console.log(`[Harbor] General disaster news: ${generalNews.length} articles`);
  } catch (err) {
    console.warn('[Harbor] General news fetch failed:', err);
  }

  // Step 4: Combine articles
  const seenArticleTitles = new Set<string>();
  const articles: {
    url: string; title: string; source: string; publishedAt: string | null;
    disasterTitle: string | null; disasterCategory: string; disasterSeverity: string | null;
  }[] = [];

  for (let i = 0; i < topEvents.length; i++) {
    const evt = topEvents[i];
    const fetched = newsResults[i]?.status === 'fulfilled' ? (newsResults[i] as PromiseFulfilledResult<typeof generalNews>).value : [];
    for (const a of fetched) {
      const normT = a.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').slice(0, 50);
      if (seenArticleTitles.has(normT)) continue;
      seenArticleTitles.add(normT);
      articles.push({ ...a, disasterTitle: evt.title, disasterCategory: evt.categoryLabel, disasterSeverity: evt.severity });
    }
  }

  for (const a of generalNews) {
    const normT = a.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').slice(0, 50);
    if (seenArticleTitles.has(normT)) continue;
    seenArticleTitles.add(normT);
    articles.push({ ...a, disasterTitle: null, disasterCategory: 'General', disasterSeverity: null });
  }

  // Step 5: If Google News completely failed, create headlines from EONET event names
  if (articles.length === 0 && topEvents.length > 0) {
    console.warn('[Harbor] No Google News articles — falling back to EONET event titles as headlines');
    for (const evt of events.slice(0, 12)) {
      const searchUrl = `https://news.google.com/search?q=${encodeURIComponent(evt.title)}`;
      articles.push({
        url: searchUrl,
        title: `${evt.categoryLabel}: ${evt.title}`,
        source: 'NASA EONET',
        publishedAt: evt.date,
        disasterTitle: evt.title,
        disasterCategory: evt.categoryLabel,
        disasterSeverity: evt.severity,
      });
    }
  }

  console.log(`[Harbor] fetchHeadlines() returning ${articles.length} articles`);
  return {
    articles: articles.slice(0, 20),
    events: topEvents.slice(0, 6).map((e) => ({
      title: e.title, category: e.categoryLabel, severity: e.severity,
      date: e.date, magnitudeValue: e.magnitudeValue,
    })),
    fetchedAt: new Date().toISOString(),
  };
}

/** Search for disasters near a location */
export async function searchLocation(query: string) {
  console.log(`[Harbor] searchLocation("${query}") called`);
  const geoRes = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
    { headers: { 'User-Agent': 'HarborDisasterApp/1.0' } }
  );
  const geoData = await geoRes.json();
  if (!geoData || geoData.length === 0) {
    return { error: 'Location not found', location: null, disasters: [], totalFound: 0 };
  }

  const lat = parseFloat(geoData[0].lat);
  const lon = parseFloat(geoData[0].lon);
  const displayName = geoData[0].display_name;
  const radius = 4.5;
  const bbox = `${lon - radius},${lat + radius},${lon + radius},${lat - radius}`;

  // Fetch EONET + USGS in parallel
  const [eonetRes2, usgsRes] = await Promise.allSettled([
    fetch(`https://eonet.gsfc.nasa.gov/api/v3/events/geojson?status=open&days=30&limit=50&bbox=${bbox}`).then((r) => r.json()),
    fetch(`https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]}&endtime=${new Date().toISOString().split('T')[0]}&minmagnitude=3&maxlatitude=${lat + radius}&minlatitude=${lat - radius}&maxlongitude=${lon + radius}&minlongitude=${lon - radius}&limit=20`).then((r) => r.json()),
  ]);

  const eonetFeatures = eonetRes2.status === 'fulfilled' ? (eonetRes2.value.features || []) : [];
  const usgsFeatures = usgsRes.status === 'fulfilled' ? (usgsRes.value.features || []) : [];

  const disasters: { id: string; title: string; category: string; categoryLabel: string; severity: string; date: string; lat: number; lon: number; magnitudeValue: number | null; source: string; distanceKm: number | null }[] = [];

  for (const f of eonetFeatures) {
    const props = f.properties || {};
    const centroid = getCentroid(f.geometry);
    const catId = props.categories?.[0]?.id || 'other';
    const score = computeUrgency(f);
    disasters.push({
      id: props.id || f.id || `e-${Math.random().toString(36).slice(2)}`,
      title: props.title || 'Unknown', category: catId,
      categoryLabel: ALERT_CATEGORY_LABELS[catId] || catId,
      severity: getSeverity(score),
      date: props.date || new Date().toISOString(),
      lat: centroid.lat, lon: centroid.lon,
      magnitudeValue: props.magnitudeValue || null, source: 'NASA EONET', distanceKm: null,
    });
  }

  for (const f of usgsFeatures) {
    const p = f.properties || {};
    const coords = f.geometry?.coordinates || [0, 0];
    disasters.push({
      id: f.id || `q-${Math.random().toString(36).slice(2)}`,
      title: p.title || `M${p.mag} Earthquake`, category: 'earthquakes',
      categoryLabel: 'Earthquake',
      severity: p.mag >= 6 ? 'critical' : p.mag >= 5 ? 'high' : p.mag >= 4 ? 'medium' : 'low',
      date: p.time ? new Date(p.time).toISOString() : new Date().toISOString(),
      lat: coords[1], lon: coords[0],
      magnitudeValue: p.mag, source: 'USGS', distanceKm: null,
    });
  }

  // Calculate distances and deduplicate
  for (const d of disasters) {
    const dLat = (d.lat - lat) * 111;
    const dLon = (d.lon - lon) * 111 * Math.cos((lat * Math.PI) / 180);
    d.distanceKm = Math.round(Math.sqrt(dLat * dLat + dLon * dLon));
  }
  disasters.sort((a, b) => (a.distanceKm || 999) - (b.distanceKm || 999));
  const unique = deduplicateByTitle(disasters);

  console.log(`[Harbor] searchLocation() returning ${unique.length} disasters near ${displayName}`);
  return {
    location: { query, displayName, lat, lon },
    disasters: unique.slice(0, 20),
    totalFound: unique.length,
  };
}
