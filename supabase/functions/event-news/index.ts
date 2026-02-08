import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CATEGORY_KEYWORDS: Record<string, string> = {
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

async function isUrlPubliclyAccessible(url: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DisasterNewsBot/1.0)' },
    });
    clearTimeout(timeoutId);
    
    if (res.status === 401 || res.status === 403) return false;
    
    const finalUrl = res.url || url;
    const lower = finalUrl.toLowerCase();
    if (BLOCKED_PATH_FRAGMENTS.some((f) => lower.includes(f))) return false;

    const ctrl2 = new AbortController();
    const timeoutId2 = setTimeout(() => ctrl2.abort(), FETCH_TIMEOUT_MS);
    
    const textRes = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: ctrl2.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DisasterNewsBot/1.0)' },
    });
    clearTimeout(timeoutId2);
    
    const text = await textRes.text();
    const preview = (text || '').slice(0, 2048).toLowerCase();
    if (PAYWALL_MARKERS.some((m) => preview.includes(m))) return false;
    
    return true;
  } catch {
    return false;
  }
}

function buildGdeltQuery(title: string, categoryId: string): string {
  const safeTitle = (title || '').replace(/[()"'\\]/g, ' ').trim().slice(0, 80);
  const keywords = CATEGORY_KEYWORDS[categoryId] || '';
  if (safeTitle && keywords) {
    return `("${safeTitle}" OR ${keywords})`;
  }
  if (keywords) return keywords;
  if (safeTitle) return `"${safeTitle}"`;
  return 'disaster';
}

function timespanToGdelt(days: number): string {
  if (days <= 1) return '1day';
  if (days <= 3) return '3days';
  return '1week';
}

interface Article {
  url: string;
  title: string;
  source: string;
  publishedAt: string | null;
}

async function fetchEventNews(
  title: string,
  lat: number,
  lon: number,
  days: number,
  categoryId: string
): Promise<Article[]> {
  const query = encodeURIComponent(buildGdeltQuery(title, categoryId));
  const span = timespanToGdelt(days);
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&mode=artlist&maxrecords=15&timespan=${span}&format=json`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('GDELT request failed');
  
  const data = await res.json();
  const articles = Array.isArray(data) ? data : data.articles || data.results || [];

  const candidates: Article[] = articles.slice(0, 20).map((a: any) => ({
    url: a.url || a.articleUrl,
    title: a.title || a.article || 'Untitled',
    source: a.domain || a.source || (() => {
      try { return new URL(a.url || 'https://example.com').hostname; } catch { return 'Unknown'; }
    })(),
    publishedAt: a.seendate || a.date || a.publishedAt || null,
  })).filter((a: Article) => a.url);

  const publicArticles: Article[] = [];
  for (let i = 0; i < candidates.length && publicArticles.length < 10; i += 5) {
    const batch = candidates.slice(i, i + 5);
    const results = await Promise.all(
      batch.map((a) => isUrlPubliclyAccessible(a.url).then((ok) => (ok ? a : null)))
    );
    publicArticles.push(...results.filter((a): a is Article => a !== null));
  }
  
  return publicArticles;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const title = url.searchParams.get('title');
    const lat = parseFloat(url.searchParams.get('lat') || '');
    const lon = parseFloat(url.searchParams.get('lon') || '');
    const days = parseInt(url.searchParams.get('days') || '3', 10);
    const categoryId = url.searchParams.get('categoryId') || 'other';

    if (!title || isNaN(lat) || isNaN(lon)) {
      return new Response(
        JSON.stringify({ error: 'title, lat, lon required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const articles = await fetchEventNews(title, lat, lon, days, categoryId);

    return new Response(JSON.stringify({ articles }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Event news error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch news', articles: [] }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
