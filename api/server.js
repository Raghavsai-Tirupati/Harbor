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

app.get('/health', (_, res) => res.json({ ok: true }));

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Disaster API listening on http://localhost:${PORT}`);
});
