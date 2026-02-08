/**
 * Disaster Map API - NASA EONET proxy + GDELT event news.
 * No service account or auth required.
 */
import express from 'express';
import cors from 'cors';
import { fetchEventNews, fetchEventNewsFast } from './event-news.js';
import { fetchGoogleNews, fetchDisasterHeadlines } from './google-news.js';

const app = express();
const PORT = process.env.PORT || process.env.API_PORT || 3001;

app.use(cors({ origin: true }));
app.use(express.json());

// Rate limit for /event-news: 30 req per 5 min per IP
const eventNewsLimit = new Map();
const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_MAX = 30;
function checkEventNewsRate(ip) {
  const now = Date.now();
  const rec = eventNewsLimit.get(ip) || { count: 0, resetAt: now + RATE_WINDOW_MS };
  if (now > rec.resetAt) rec.count = 0;
  rec.resetAt = now + RATE_WINDOW_MS;
  rec.count++;
  eventNewsLimit.set(ip, rec);
  return rec.count <= RATE_MAX;
}

// EONET proxy - NASA natural disaster events (avoids CORS)
const eonetCache = new Map();
const EONET_CACHE_TTL = 60 * 1000; // 60 seconds

app.get('/eonet', async (req, res) => {
  const bbox = req.query.bbox;
  if (!bbox) return res.status(400).json({ error: 'bbox required (minLon,maxLat,maxLon,minLat)' });
  const status = req.query.status || 'open';
  const days = req.query.days || (status === 'closed' ? '730' : '14');
  const limit = req.query.limit || '500';
  const start = req.query.start;
  const end = req.query.end;
  const cacheKey = `${bbox}|${status}|${days}|${start || ''}|${end || ''}`;
  const cached = eonetCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < EONET_CACHE_TTL) {
    return res.json(cached.data);
  }
  try {
    let url = `https://eonet.gsfc.nasa.gov/api/v3/events/geojson?status=${status}&limit=${limit}&bbox=${bbox}`;
    if (start && end) url += `&start=${start}&end=${end}`;
    else url += `&days=${days}`;
    const r = await fetch(url);
    const data = await r.json();
    eonetCache.set(cacheKey, { ts: Date.now(), data });
    res.json(data);
  } catch (err) {
    console.error('EONET proxy error:', err);
    res.status(502).json({ error: 'Failed to fetch EONET data' });
  }
});

// USGS Earthquakes - historical for seasonal predictions (free, no key)
const usgsCache = new Map();
const USGS_CACHE_TTL = 60 * 1000;

app.get('/earthquakes', async (req, res) => {
  const bbox = req.query.bbox;
  const start = req.query.start;
  const end = req.query.end;
  if (!bbox || !start || !end) return res.status(400).json({ error: 'bbox, start, end required' });
  const cacheKey = `${bbox}|${start}|${end}`;
  const cached = usgsCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < USGS_CACHE_TTL) return res.json(cached.data);
  try {
    const [minLon, maxLat, maxLon, minLat] = bbox.split(',').map(Number);
    const url = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${start}&endtime=${end}&minmagnitude=4&maxlatitude=${maxLat}&minlatitude=${minLat}&maxlongitude=${maxLon}&minlongitude=${minLon}&limit=200`;
    const r = await fetch(url);
    const data = await r.json();
    usgsCache.set(cacheKey, { ts: Date.now(), data });
    res.json(data);
  } catch (err) {
    console.error('USGS proxy error:', err);
    res.status(502).json({ error: 'Failed to fetch earthquake data' });
  }
});

// EONET events for News tab (alias, cache 60s)
app.get('/eonet-events', async (req, res) => {
  const bbox = req.query.bbox || '-180,85,180,-85';
  const status = req.query.status || 'open';
  const days = req.query.days || (status === 'open' ? '14' : '30');
  const limit = req.query.limit || '200';
  const cacheKey = `events|${bbox}|${status}|${days}|${limit}`;
  const cached = eonetCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < EONET_CACHE_TTL) return res.json(cached.data);
  try {
    const url = `https://eonet.gsfc.nasa.gov/api/v3/events/geojson?status=${status}&days=${days}&limit=${limit}&bbox=${bbox}`;
    const r = await fetch(url);
    const data = await r.json();
    eonetCache.set(cacheKey, { ts: Date.now(), data });
    res.json(data);
  } catch (err) {
    console.error('EONET events error:', err);
    res.status(502).json({ error: 'Failed to fetch EONET events' });
  }
});

// Event news from GDELT (with paywall filtering)
const eventNewsCache = new Map();
const EVENT_NEWS_CACHE_TTL = 60 * 1000;

app.get('/event-news', async (req, res) => {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  if (!checkEventNewsRate(ip)) {
    return res.status(429).json({ error: 'Too many requests. Try again in 5 minutes.' });
  }
  const title = req.query.title;
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  const days = parseInt(req.query.days || '3', 10);
  const categoryId = req.query.categoryId || 'other';
  if (!title || isNaN(lat) || isNaN(lon)) {
    return res.status(400).json({ error: 'title, lat, lon required' });
  }
  const cacheKey = `${title}|${lat.toFixed(2)}|${lon.toFixed(2)}|${days}|${categoryId}`;
  const cached = eventNewsCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < EVENT_NEWS_CACHE_TTL) {
    return res.json(cached.data);
  }
  try {
    const articles = await fetchEventNews({ title, lat, lon, days, categoryId });
    const data = { articles };
    eventNewsCache.set(cacheKey, { ts: Date.now(), data });
    res.json(data);
  } catch (err) {
    console.error('Event news error:', err);
    res.status(502).json({ error: 'Failed to fetch news', articles: [] });
  }
});

// ── Disaster Alerts: live high-urgency events with auto-loaded headlines ──
const alertsCache = { data: null, ts: 0 };
const ALERTS_CACHE_TTL = 120 * 1000; // 2 minutes

const ALERT_CATEGORY_WEIGHTS = {
  severeStorms: 1.0,
  volcanoes: 0.95,
  earthquakes: 0.9,
  floods: 0.9,
  wildfires: 0.85,
  landslides: 0.8,
  temperatureExtremes: 0.75,
  seaLakeIce: 0.7,
  droughts: 0.65,
  snow: 0.6,
  other: 0.5,
};

const ALERT_CATEGORY_LABELS = {
  severeStorms: 'Severe Storm',
  wildfires: 'Wildfire',
  volcanoes: 'Volcanic Eruption',
  earthquakes: 'Earthquake',
  floods: 'Flooding',
  landslides: 'Landslide',
  droughts: 'Drought',
  seaLakeIce: 'Ice Event',
  snow: 'Snow/Blizzard',
  temperatureExtremes: 'Extreme Temperature',
  other: 'Natural Event',
};

function computeAlertUrgency(feature) {
  const props = feature.properties || {};
  const dateStr = props.date || props.closed || new Date().toISOString();
  const ageHours = (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60);
  const recency = Math.max(0, 1 - ageHours / (7 * 24));
  const mag = props.magnitudeValue ?? 0;
  const magNorm = Math.min(1, mag / 100);
  const catId = props.categories?.[0]?.id || 'other';
  const catWeight = ALERT_CATEGORY_WEIGHTS[catId] ?? 0.5;
  return recency * 0.5 + magNorm * 0.2 + catWeight * 0.3;
}

function getAlertSeverity(score) {
  if (score >= 0.7) return 'critical';
  if (score >= 0.5) return 'high';
  if (score >= 0.3) return 'medium';
  return 'low';
}

function formatAlertText(props) {
  const catId = props.categories?.[0]?.id || 'other';
  const label = ALERT_CATEGORY_LABELS[catId] || 'Natural Event';
  const title = props.title || 'Unknown Event';
  const mag = props.magnitudeValue;
  let text = `${label}: ${title}`;
  if (mag) text += ` — Magnitude ${mag}`;
  return text;
}

function getCentroid(geom) {
  if (!geom) return { lat: 0, lon: 0 };
  if (geom.type === 'Point' && Array.isArray(geom.coordinates)) {
    const [lon, lat] = geom.coordinates;
    return { lat, lon };
  }
  if (geom.type === 'Polygon' && geom.coordinates?.[0]) {
    const ring = geom.coordinates[0];
    const lon = ring.reduce((s, c) => s + c[0], 0) / ring.length;
    const lat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
    return { lat, lon };
  }
  return { lat: 0, lon: 0 };
}

app.get('/alerts', async (req, res) => {
  const now = Date.now();
  if (alertsCache.data && now - alertsCache.ts < ALERTS_CACHE_TTL) {
    return res.json(alertsCache.data);
  }

  try {
    // Fetch recent open events from EONET (last 7 days)
    const eonetUrl = 'https://eonet.gsfc.nasa.gov/api/v3/events/geojson?status=open&days=7&limit=100&bbox=-180,85,180,-85';
    const eonetRes = await fetch(eonetUrl);
    const eonetData = await eonetRes.json();
    const features = eonetData.features || [];

    // Score and rank events
    const scored = features.map((f) => {
      const props = f.properties || {};
      const score = computeAlertUrgency(f);
      const centroid = getCentroid(f.geometry);
      const catId = props.categories?.[0]?.id || 'other';
      return {
        id: props.id || f.id || `alert-${Math.random().toString(36).slice(2)}`,
        title: props.title || 'Unknown Event',
        category: catId,
        categoryLabel: ALERT_CATEGORY_LABELS[catId] || catId,
        alertText: formatAlertText(props),
        severity: getAlertSeverity(score),
        urgencyScore: Math.round(score * 100) / 100,
        date: props.date || props.closed || new Date().toISOString(),
        lat: centroid.lat,
        lon: centroid.lon,
        magnitudeValue: props.magnitudeValue || null,
        sources: (props.sources || []).map((s) => s.url).filter(Boolean),
      };
    });

    scored.sort((a, b) => b.urgencyScore - a.urgencyScore);

    // Deduplicate by normalized title (keep highest-scoring entry)
    const seenTitles = new Set();
    const deduped = [];
    for (const alert of scored) {
      const norm = alert.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim().slice(0, 50);
      if (seenTitles.has(norm)) continue;
      seenTitles.add(norm);
      deduped.push(alert);
    }

    // Top alerts (max 10)
    const topAlerts = deduped.slice(0, 10);

    // Fetch headlines for top 5 alerts in parallel
    const top5 = topAlerts.slice(0, 5);
    const newsResults = await Promise.allSettled(
      top5.map((alert) =>
        fetchEventNews({
          title: alert.title,
          lat: alert.lat,
          lon: alert.lon,
          days: 3,
          categoryId: alert.category,
        }).catch(() => [])
      )
    );

    // Attach headlines to alerts
    const alertsWithNews = topAlerts.map((alert, i) => {
      if (i < 5 && newsResults[i]?.status === 'fulfilled') {
        const articles = (newsResults[i].value || []).slice(0, 5);
        return { ...alert, articles };
      }
      return { ...alert, articles: [] };
    });

    const result = {
      alerts: alertsWithNews,
      totalEvents: features.length,
      fetchedAt: new Date().toISOString(),
    };

    alertsCache.data = result;
    alertsCache.ts = now;
    res.json(result);
  } catch (err) {
    console.error('Alerts error:', err);
    res.status(502).json({ error: 'Failed to fetch alerts', alerts: [] });
  }
});

// ── Headlines: NASA EONET disasters → Google News articles for each ──
const headlinesCache = { data: null, ts: 0 };
const HEADLINES_CACHE_TTL = 180 * 1000; // 3 minutes

app.get('/headlines', async (req, res) => {
  const now = Date.now();
  if (headlinesCache.data && now - headlinesCache.ts < HEADLINES_CACHE_TTL) {
    return res.json(headlinesCache.data);
  }
  try {
    // Step 1: Fetch live NASA EONET disaster events
    const eonetUrl = 'https://eonet.gsfc.nasa.gov/api/v3/events/geojson?status=open&days=14&limit=50&bbox=-180,85,180,-85';
    const eonetRes = await fetch(eonetUrl);
    const eonetData = await eonetRes.json();
    const features = eonetData.features || [];

    // Step 2: Deduplicate EONET events by title
    const seenEventTitles = new Set();
    const uniqueEvents = [];
    for (const f of features) {
      const title = (f.properties?.title || '').trim();
      const norm = title.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').slice(0, 50);
      if (!norm || seenEventTitles.has(norm)) continue;
      seenEventTitles.add(norm);
      const centroid = getCentroid(f.geometry);
      const catId = f.properties?.categories?.[0]?.id || 'other';
      const score = computeAlertUrgency(f);
      uniqueEvents.push({
        title,
        category: catId,
        categoryLabel: ALERT_CATEGORY_LABELS[catId] || catId,
        severity: getAlertSeverity(score),
        urgencyScore: score,
        lat: centroid.lat,
        lon: centroid.lon,
        date: f.properties?.date || new Date().toISOString(),
        magnitudeValue: f.properties?.magnitudeValue || null,
      });
    }

    uniqueEvents.sort((a, b) => b.urgencyScore - a.urgencyScore);

    // Step 3: For the top events, fetch Google News articles in parallel
    const topEvents = uniqueEvents.slice(0, 6);
    const newsResults = await Promise.allSettled(
      topEvents.map((evt) =>
        fetchGoogleNews(evt.title, 5).catch(() => [])
      )
    );

    // Step 4: Also fetch general disaster headlines for more coverage
    let generalHeadlines = [];
    try {
      generalHeadlines = await fetchDisasterHeadlines(10);
    } catch { /* ignore */ }

    // Step 5: Combine — event-specific articles first, then general headlines
    const seenTitles = new Set();
    const articles = [];

    // Add event-specific articles
    for (let i = 0; i < topEvents.length; i++) {
      const evt = topEvents[i];
      const fetched = newsResults[i]?.status === 'fulfilled' ? (newsResults[i].value || []) : [];
      for (const a of fetched) {
        const normTitle = a.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').slice(0, 50);
        if (seenTitles.has(normTitle)) continue;
        seenTitles.add(normTitle);
        articles.push({
          url: a.url,
          title: a.title,
          source: a.source || '',
          publishedAt: a.publishedAt || null,
          image: null,
          disasterTitle: evt.title,
          disasterCategory: evt.categoryLabel,
          disasterSeverity: evt.severity,
        });
      }
    }

    // Add general disaster headlines (not already included)
    for (const a of generalHeadlines) {
      const normTitle = a.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').slice(0, 50);
      if (seenTitles.has(normTitle)) continue;
      seenTitles.add(normTitle);
      articles.push({
        url: a.url,
        title: a.title,
        source: a.source || '',
        publishedAt: a.publishedAt || null,
        image: null,
        disasterTitle: null,
        disasterCategory: 'General',
        disasterSeverity: null,
      });
    }

    const result = {
      articles: articles.slice(0, 20),
      events: topEvents.map((e) => ({
        title: e.title,
        category: e.categoryLabel,
        severity: e.severity,
        date: e.date,
        magnitudeValue: e.magnitudeValue,
      })),
      fetchedAt: new Date().toISOString(),
    };

    headlinesCache.data = result;
    headlinesCache.ts = now;
    res.json(result);
  } catch (err) {
    console.error('Headlines error:', err);
    res.status(502).json({ error: 'Failed to fetch headlines', articles: [], events: [] });
  }
});

// ── Location search: geocode a place name → find nearby disasters ──
const geocodeCache = new Map();
const GEOCODE_CACHE_TTL = 300 * 1000; // 5 min

app.get('/search-location', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'q (location query) required' });

  try {
    // Step 1: Geocode location using OpenStreetMap Nominatim (free, no key)
    const geocodeCacheKey = q.toLowerCase();
    let geo = geocodeCache.get(geocodeCacheKey);
    if (!geo || Date.now() - geo.ts > GEOCODE_CACHE_TTL) {
      const geoUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`;
      const geoRes = await fetch(geoUrl, {
        headers: { 'User-Agent': 'HarborDisasterApp/1.0' },
      });
      const geoData = await geoRes.json();
      if (!geoData || geoData.length === 0) {
        return res.status(404).json({ error: 'Location not found', location: null, disasters: [] });
      }
      geo = {
        ts: Date.now(),
        lat: parseFloat(geoData[0].lat),
        lon: parseFloat(geoData[0].lon),
        displayName: geoData[0].display_name,
      };
      geocodeCache.set(geocodeCacheKey, geo);
    }

    // Step 2: Create a bounding box around the location (~500km radius ≈ ~4.5 degrees)
    const radius = 4.5;
    const minLon = geo.lon - radius;
    const maxLon = geo.lon + radius;
    const minLat = geo.lat - radius;
    const maxLat = geo.lat + radius;
    const bbox = `${minLon},${maxLat},${maxLon},${minLat}`;

    // Step 3: Fetch EONET events in that bounding box
    const eonetUrl = `https://eonet.gsfc.nasa.gov/api/v3/events/geojson?status=open&days=30&limit=50&bbox=${bbox}`;
    const eonetRes = await fetch(eonetUrl);
    const eonetData = await eonetRes.json();
    const features = eonetData.features || [];

    // Step 4: Also fetch recent earthquakes in the area
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const usgsUrl = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${thirtyDaysAgo.toISOString().split('T')[0]}&endtime=${now.toISOString().split('T')[0]}&minmagnitude=3&maxlatitude=${maxLat}&minlatitude=${minLat}&maxlongitude=${maxLon}&minlongitude=${minLon}&limit=20`;
    let quakes = [];
    try {
      const usgsRes = await fetch(usgsUrl);
      const usgsData = await usgsRes.json();
      quakes = (usgsData.features || []).map((f) => {
        const p = f.properties || {};
        const coords = f.geometry?.coordinates || [0, 0, 0];
        return {
          id: f.id || `eq-${Math.random().toString(36).slice(2)}`,
          title: p.title || `M${p.mag} Earthquake`,
          category: 'earthquakes',
          categoryLabel: 'Earthquake',
          severity: p.mag >= 6 ? 'critical' : p.mag >= 5 ? 'high' : p.mag >= 4 ? 'medium' : 'low',
          date: p.time ? new Date(p.time).toISOString() : new Date().toISOString(),
          lat: coords[1],
          lon: coords[0],
          magnitudeValue: p.mag,
          source: 'USGS',
          url: p.url || null,
          distanceKm: null,
        };
      });
    } catch { /* ignore USGS errors */ }

    // Step 5: Process EONET events
    const disasters = features.map((f) => {
      const props = f.properties || {};
      const centroid = getCentroid(f.geometry);
      const catId = props.categories?.[0]?.id || 'other';
      const score = computeAlertUrgency(f);
      return {
        id: props.id || f.id || `evt-${Math.random().toString(36).slice(2)}`,
        title: props.title || 'Unknown Event',
        category: catId,
        categoryLabel: ALERT_CATEGORY_LABELS[catId] || catId,
        severity: getAlertSeverity(score),
        date: props.date || props.closed || new Date().toISOString(),
        lat: centroid.lat,
        lon: centroid.lon,
        magnitudeValue: props.magnitudeValue || null,
        source: 'NASA EONET',
        distanceKm: null,
      };
    });

    // Combine and calculate distances
    const all = [...disasters, ...quakes];
    for (const d of all) {
      const dLat = (d.lat - geo.lat) * 111;
      const dLon = (d.lon - geo.lon) * 111 * Math.cos((geo.lat * Math.PI) / 180);
      d.distanceKm = Math.round(Math.sqrt(dLat * dLat + dLon * dLon));
    }
    all.sort((a, b) => (a.distanceKm || 999) - (b.distanceKm || 999));

    // Deduplicate by title
    const seenTitles = new Set();
    const unique = [];
    for (const d of all) {
      const norm = d.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
      if (seenTitles.has(norm)) continue;
      seenTitles.add(norm);
      unique.push(d);
    }

    res.json({
      location: {
        query: q,
        displayName: geo.displayName,
        lat: geo.lat,
        lon: geo.lon,
      },
      disasters: unique.slice(0, 20),
      totalFound: unique.length,
    });
  } catch (err) {
    console.error('Search location error:', err);
    res.status(502).json({ error: 'Failed to search location', location: null, disasters: [] });
  }
});

// ── FEMA Disaster Recovery Centers (ArcGIS FeatureServer proxy) ──
const femaCache = new Map();
const FEMA_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const FEMA_DRC_BASE = 'https://gis.fema.gov/arcgis/rest/services/FEMA/DRC/FeatureServer';

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeDrcFeature(attr) {
  const lat = parseFloat(attr.latitude);
  const lon = parseFloat(attr.longitude);
  if (isNaN(lat) || isNaN(lon) || lat === 0 || lon === 0) return null;
  const addr = [attr.street_1, attr.street_2].filter(Boolean).join(', ');
  const city = [attr.city, attr.state, attr.zip].filter(Boolean).join(', ');
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lon, lat] },
    properties: {
      id: `fema-drc-${attr.objectid || attr.drc_id || Math.random().toString(36).slice(2)}`,
      name: attr.drc_name || 'FEMA Disaster Recovery Center',
      address: addr ? `${addr}, ${city}` : city || null,
      phone: null,
      hours: attr.hours || null,
      status: (attr.status || 'Unknown').toLowerCase(),
      daysOpen: attr.days_open || null,
      disasterNumber: attr.primary_disaster || null,
      drcType: attr.drc_type_desc || null,
      notes: attr.notes || null,
      totalVisitors: attr.total || null,
      source: 'FEMA OpenFEMA',
      dataset: 'Disaster Recovery Centers',
      lat,
      lon,
    },
  };
}

async function fetchFemaDrc(layer, where, limit) {
  const cacheKey = `fema|${layer}|${where}|${limit}`;
  const cached = femaCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < FEMA_CACHE_TTL) return cached.data;

  const url = `${FEMA_DRC_BASE}/${layer}/query?` + new URLSearchParams({
    where,
    outFields: '*',
    f: 'json',
    resultRecordCount: String(limit),
    orderByFields: 'objectid DESC',
    returnGeometry: 'false',
  });

  const r = await fetch(url);
  const json = await r.json();
  const features = (json.features || [])
    .map((f) => normalizeDrcFeature(f.attributes))
    .filter(Boolean);

  // Deduplicate by id
  const seen = new Set();
  const deduped = [];
  for (const f of features) {
    if (seen.has(f.properties.id)) continue;
    seen.add(f.properties.id);
    deduped.push(f);
  }

  const geojson = { type: 'FeatureCollection', features: deduped };
  femaCache.set(cacheKey, { ts: Date.now(), data: geojson });
  return geojson;
}

// GET /api/fema/resources?bbox=<minLon,maxLat,maxLon,minLat>&limit=<n>
app.get('/api/fema/resources', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '200', 10), 500);
  const bbox = req.query.bbox;

  try {
    // Fetch from both open (layer 0) and archived (layer 1) layers
    const [openDrcs, archivedDrcs] = await Promise.all([
      fetchFemaDrc(0, '1=1', limit),
      fetchFemaDrc(1, '1=1', limit),
    ]);

    // Merge both sets
    const allFeatures = [...openDrcs.features, ...archivedDrcs.features];

    // If bbox provided, filter server-side
    let filtered = allFeatures;
    if (bbox) {
      const [minLon, maxLat, maxLon, minLat] = bbox.split(',').map(Number);
      if (!isNaN(minLon) && !isNaN(maxLat) && !isNaN(maxLon) && !isNaN(minLat)) {
        filtered = allFeatures.filter((f) => {
          const p = f.properties;
          return p.lat >= minLat && p.lat <= maxLat && p.lon >= minLon && p.lon <= maxLon;
        });
      }
    }

    res.json({
      type: 'FeatureCollection',
      features: filtered.slice(0, limit),
      metadata: {
        totalOpen: openDrcs.features.length,
        totalArchived: archivedDrcs.features.length,
        returned: Math.min(filtered.length, limit),
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('FEMA resources error:', err);
    res.status(502).json({ error: 'Failed to fetch FEMA resources', type: 'FeatureCollection', features: [] });
  }
});

// GET /api/fema/nearby?lat=<>&lon=<>&maxKm=<>&limit=<>
app.get('/api/fema/nearby', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  const maxKm = parseFloat(req.query.maxKm || '500');
  const limit = Math.min(parseInt(req.query.limit || '10', 10), 50);

  if (isNaN(lat) || isNaN(lon)) {
    return res.status(400).json({ error: 'lat and lon are required' });
  }

  try {
    // Fetch all DRCs (both open and archived) — cached for 10 min
    const [openDrcs, archivedDrcs] = await Promise.all([
      fetchFemaDrc(0, '1=1', 500),
      fetchFemaDrc(1, '1=1', 500),
    ]);

    const allFeatures = [...openDrcs.features, ...archivedDrcs.features];

    // Calculate distances and filter
    const withDist = allFeatures
      .map((f) => {
        const p = f.properties;
        const distanceKm = haversineKm(lat, lon, p.lat, p.lon);
        return { ...p, distanceKm: Math.round(distanceKm * 10) / 10 };
      })
      .filter((r) => r.distanceKm <= maxKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit);

    // If no results, return fallback
    if (withDist.length === 0) {
      return res.json({
        resources: [],
        fallback: {
          message: 'No FEMA Disaster Recovery Centers found within the specified radius.',
          suggestions: [
            { name: 'FEMA Disaster Assistance', phone: '1-800-621-3362', url: 'https://www.disasterassistance.gov' },
            { name: 'American Red Cross', phone: '1-800-733-2767', url: 'https://www.redcross.org' },
            { name: '211 Helpline', phone: '211', url: 'https://www.211.org' },
          ],
        },
      });
    }

    res.json({
      resources: withDist.map((r) => ({
        name: r.name,
        type: 'FEMA_DRC',
        lat: r.lat,
        lon: r.lon,
        distanceKm: r.distanceKm,
        address: r.address,
        phone: r.phone,
        hours: r.hours,
        status: r.status,
        drcType: r.drcType,
        notes: r.notes,
        url: 'https://www.disasterassistance.gov',
        source: r.source,
      })),
      fallback: null,
    });
  } catch (err) {
    console.error('FEMA nearby error:', err);
    res.status(502).json({ error: 'Failed to fetch nearby FEMA resources', resources: [] });
  }
});

app.get('/health', (_, res) => res.json({ ok: true }));

const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`Disaster API listening on http://${HOST}:${PORT}`);
  console.log('Endpoints: /eonet, /earthquakes, /eonet-events, /event-news, /alerts, /headlines, /search-location, /api/fema/resources, /api/fema/nearby, /health');
});
