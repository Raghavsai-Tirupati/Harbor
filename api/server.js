/**
 * Disaster Map API - NASA EONET proxy + GDELT event news.
 * No service account or auth required.
 */
import express from 'express';
import cors from 'cors';
import { fetchEventNews } from './event-news.js';

const app = express();
const PORT = process.env.API_PORT || 3001;

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

// Global disaster news endpoint (similar to /api/news/global)
app.get('/news/global', async (req, res) => {
  const limit = parseInt(req.query.limit || '20', 10);
  const types = req.query.types ? req.query.types.split(',') : [];
  
  try {
    // Build GDELT query
    const baseKeywords = 'earthquake OR wildfire OR hurricane OR flood OR tornado OR disaster';
    const query = encodeURIComponent(baseKeywords);
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&mode=artlist&maxrecords=${limit + 5}&timespan=3days&sort=DateDesc&format=json`;
    
    const r = await fetch(url);
    const text = await r.text();
    
    // Try to parse JSON, fallback to empty array if it fails
    let data;
    try {
      data = JSON.parse(text);
    } catch (parseErr) {
      console.error('GDELT API returned non-JSON response:', text.slice(0, 100));
      return res.json({ items: [], nextCursor: null });
    }
    
    const articles = Array.isArray(data) ? data : data.articles || [];
    
    const items = articles.slice(0, limit).map((a, i) => ({
      id: `global-${i}-${Date.now()}`,
      title: a.title || 'Untitled',
      summary: a.title || '',
      source: a.domain || 'Unknown',
      url: a.url,
      imageUrl: a.socialimage || null,
      publishedAt: parseGdeltDate(a.seendate),
      hazardTypes: detectHazardType(a.title || ''),
    }));
    
    res.json({ items, nextCursor: null });
  } catch (err) {
    console.error('Global news error:', err);
    res.json({ items: [], nextCursor: null });
  }
});

// Local disaster news endpoint (similar to /api/news/local)
app.get('/news/local', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  const radiusKm = parseInt(req.query.radiusKm || '50', 10);
  const limit = parseInt(req.query.limit || '20', 10);
  
  if (isNaN(lat) || isNaN(lon)) {
    return res.status(400).json({ error: 'lat and lon required' });
  }
  
  try {
    // Get approximate region for location
    const region = getApproxRegion(lat, lon);
    const baseKeywords = 'earthquake OR wildfire OR hurricane OR flood OR tornado OR disaster';
    const query = encodeURIComponent(`(${baseKeywords}) ${region}`);
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&mode=artlist&maxrecords=${limit + 5}&timespan=7days&sort=DateDesc&format=json`;
    
    const r = await fetch(url);
    const text = await r.text();
    
    // Try to parse JSON, fallback to empty array if it fails
    let data;
    try {
      data = JSON.parse(text);
    } catch (parseErr) {
      console.error('GDELT API returned non-JSON response for location:', text.slice(0, 100));
      return res.json({ items: [], nextCursor: null });
    }
    
    const articles = Array.isArray(data) ? data : data.articles || [];
    
    const items = articles.slice(0, limit).map((a, i) => ({
      id: `local-${i}-${Date.now()}`,
      title: a.title || 'Untitled',
      summary: a.title || '',
      source: a.domain || 'Unknown',
      url: a.url,
      imageUrl: a.socialimage || null,
      publishedAt: parseGdeltDate(a.seendate),
      hazardTypes: detectHazardType(a.title || ''),
    }));
    
    res.json({ items, nextCursor: null });
  } catch (err) {
    console.error('Local news error:', err);
    res.json({ items: [], nextCursor: null });
  }
});

// Helper functions for news endpoints
function parseGdeltDate(dateStr) {
  if (!dateStr) return new Date().toISOString();
  try {
    const y = dateStr.slice(0, 4);
    const m = dateStr.slice(4, 6);
    const d = dateStr.slice(6, 8);
    const h = dateStr.slice(9, 11) || '00';
    const min = dateStr.slice(11, 13) || '00';
    const s = dateStr.slice(13, 15) || '00';
    return `${y}-${m}-${d}T${h}:${min}:${s}Z`;
  } catch {
    return new Date().toISOString();
  }
}

function detectHazardType(title) {
  const lower = title.toLowerCase();
  if (lower.includes('wildfire') || lower.includes('fire') || lower.includes('blaze')) return ['wildfire'];
  if (lower.includes('earthquake') || lower.includes('seismic') || lower.includes('quake')) return ['earthquake'];
  if (lower.includes('hurricane') || lower.includes('cyclone') || lower.includes('typhoon')) return ['cyclone'];
  if (lower.includes('flood') || lower.includes('flooding')) return ['flood'];
  if (lower.includes('tornado') || lower.includes('twister')) return ['tornado'];
  if (lower.includes('storm')) return ['storm'];
  if (lower.includes('volcano') || lower.includes('eruption')) return ['volcano'];
  return ['other'];
}

function getApproxRegion(lat, lon) {
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

app.get('/health', (_, res) => res.json({ ok: true }));

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Disaster API listening on http://localhost:${PORT}`);
  console.log(`Endpoints: /eonet, /earthquakes, /eonet-events, /event-news, /news/global, /news/local`);
});
