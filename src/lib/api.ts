/**
 * API client for Harbor.
 *
 * Calls external APIs directly from the browser — no backend server needed.
 *   - NASA EONET & USGS have CORS enabled (direct calls).
 *   - Google News RSS uses allorigins.win CORS proxy.
 */

/* ── Helpers ── */
const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

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
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const res = await fetch(CORS_PROXY + encodeURIComponent(rssUrl));
  if (!res.ok) return [];
  const xml = await res.text();
  return parseGoogleNewsXml(xml).slice(0, max);
}

/* ══════════════════════════════════════════════════════════
   Public API functions — used by the frontend components.
   Always call external APIs directly from the browser.
   ══════════════════════════════════════════════════════════ */

/** Fetch live disaster alerts (deduplicated, with articles) */
export async function fetchAlerts() {
  const eonetRes = await fetch('https://eonet.gsfc.nasa.gov/api/v3/events/geojson?status=open&days=7&limit=100&bbox=-180,85,180,-85');
  const eonetData = await eonetRes.json();
  const features = eonetData.features || [];

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
  return { alerts: scored.slice(0, 10), totalEvents: features.length, fetchedAt: new Date().toISOString() };
}

/** Fetch headlines tied to NASA disasters via Google News */
export async function fetchHeadlines() {
  const eonetRes = await fetch('https://eonet.gsfc.nasa.gov/api/v3/events/geojson?status=open&days=14&limit=50&bbox=-180,85,180,-85');
  const eonetData = await eonetRes.json();
  const features = eonetData.features || [];

  // Deduplicate events
  const seenTitles = new Set<string>();
  const events: { title: string; category: string; categoryLabel: string; severity: string; urgencyScore: number; date: string; magnitudeValue: number | null }[] = [];
  for (const f of features) {
    const title = (f.properties?.title || '').trim();
    const norm = title.toLowerCase().replace(/[^a-z0-9\s]/g, '').slice(0, 50);
    if (!norm || seenTitles.has(norm)) continue;
    seenTitles.add(norm);
    const catId = f.properties?.categories?.[0]?.id || 'other';
    const score = computeUrgency(f);
    events.push({
      title, category: catId, categoryLabel: ALERT_CATEGORY_LABELS[catId] || catId,
      severity: getSeverity(score), urgencyScore: score,
      date: f.properties?.date || new Date().toISOString(),
      magnitudeValue: f.properties?.magnitudeValue || null,
    });
  }
  events.sort((a, b) => b.urgencyScore - a.urgencyScore);

  // Fetch Google News for top 6 events
  const topEvents = events.slice(0, 6);
  const newsResults = await Promise.allSettled(
    topEvents.map((e) => fetchGoogleNewsClient(e.title, 5).catch(() => []))
  );

  // Also fetch general disaster news
  let generalNews: { url: string; title: string; source: string; publishedAt: string | null }[] = [];
  try {
    generalNews = await fetchGoogleNewsClient(
      'natural disaster OR earthquake OR hurricane OR wildfire OR flood OR cyclone OR tsunami', 10
    );
  } catch { /* ignore */ }

  // Combine
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

  return {
    location: { query, displayName, lat, lon },
    disasters: unique.slice(0, 20),
    totalFound: unique.length,
  };
}
