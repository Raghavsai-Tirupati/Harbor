/**
 * GDELT DOC 2.1 API integration + paywall validation.
 * Fetches disaster-related news and filters out paywalled articles.
 */

const CATEGORY_KEYWORDS = {
  severeStorms: '(storm OR cyclone OR hurricane OR typhoon OR tornado)',
  wildfires: '(wildfire OR smoke OR evacuation)',
  volcanoes: '(volcano OR eruption OR ash)',
  earthquakes: '(earthquake OR tremor OR seismic)',
  floods: '(flood OR flooding OR flash flood)',
  landslides: '(landslide OR mudslide)',
  droughts: '(drought)',
  seaLakeIce: '(iceberg OR ice)',
  snow: '(snow OR blizzard)',
  temperatureExtremes: '(heat wave OR extreme heat OR cold snap)',
  other: '',
};

const PAYWALL_MARKERS = [
  'subscribe to continue',
  'sign in to continue',
  'log in to continue',
  'metered paywall',
  'you have reached your limit',
  'premium content',
  'members only',
  'create an account to read',
];

const BLOCKED_PATH_FRAGMENTS = ['login', 'signin', 'subscribe', 'paywall', 'register'];

const FETCH_TIMEOUT_MS = 3000;

async function isUrlPubliclyAccessible(url) {
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DisasterNewsBot/1.0)' },
    });
    clearTimeout(to);
    if (res.status === 401 || res.status === 403) return false;
    const finalUrl = res.url || url;
    const lower = finalUrl.toLowerCase();
    if (BLOCKED_PATH_FRAGMENTS.some((f) => lower.includes(f))) return false;

    const ctrl2 = new AbortController();
    const to2 = setTimeout(() => ctrl2.abort(), FETCH_TIMEOUT_MS);
    const textRes = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: ctrl2.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DisasterNewsBot/1.0)' },
    });
    clearTimeout(to2);
    const text = await textRes.text();
    const preview = (text || '').slice(0, 2048).toLowerCase();
    if (PAYWALL_MARKERS.some((m) => preview.includes(m))) return false;
    return true;
  } catch {
    return false;
  }
}

function buildGdeltQuery(title, categoryId) {
  const safeTitle = (title || '').replace(/[()"'\\]/g, ' ').trim().slice(0, 80);
  const keywords = CATEGORY_KEYWORDS[categoryId] || '';
  if (safeTitle && keywords) {
    return `("${safeTitle}" OR ${keywords})`;
  }
  if (keywords) return keywords;
  if (safeTitle) return `"${safeTitle}"`;
  return 'disaster';
}

function timespanToGdelt(days) {
  if (days <= 1) return '1day';
  if (days <= 3) return '3days';
  return '1week';
}

export async function fetchEventNews({ title, lat, lon, days = 3, categoryId = 'other' }) {
  const query = encodeURIComponent(buildGdeltQuery(title, categoryId));
  const span = timespanToGdelt(days);
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&mode=artlist&maxrecords=15&timespan=${span}&format=json`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('GDELT request failed');
  const data = await res.json();
  const articles = Array.isArray(data) ? data : data.articles || data.results || [];

  const candidates = articles.slice(0, 20).map((a) => ({
    url: a.url || a.articleUrl,
    title: a.title || a.article || 'Untitled',
    source: a.domain || a.source || new URL(a.url || 'https://example.com').hostname,
    publishedAt: a.seendate || a.date || a.publishedAt || null,
  })).filter((a) => a.url);

  const publicArticles = [];
  for (let i = 0; i < candidates.length && publicArticles.length < 10; i += 5) {
    const batch = candidates.slice(i, i + 5);
    const results = await Promise.all(batch.map((a) => isUrlPubliclyAccessible(a.url).then((ok) => (ok ? a : null))));
    publicArticles.push(...results.filter(Boolean));
  }
  return publicArticles;
}
