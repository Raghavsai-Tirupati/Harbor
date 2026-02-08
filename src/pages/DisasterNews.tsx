import { useState, useEffect, useCallback } from 'react';
import { MapPin, Newspaper, Filter, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const API_BASE = '/api';

const CATEGORY_WEIGHTS: Record<string, number> = {
  severeStorms: 1.0,
  volcanoes: 0.95,
  floods: 0.9,
  wildfires: 0.85,
  landslides: 0.8,
  seaLakeIce: 0.7,
  earthquakes: 0.9,
  droughts: 0.65,
  snow: 0.6,
  temperatureExtremes: 0.75,
  other: 0.5,
};

const CATEGORY_LABELS: Record<string, string> = {
  severeStorms: 'Severe Storms',
  wildfires: 'Wildfires',
  volcanoes: 'Volcanoes',
  earthquakes: 'Earthquakes',
  floods: 'Floods',
  landslides: 'Landslides',
  droughts: 'Droughts',
  seaLakeIce: 'Ice',
  snow: 'Snow',
  temperatureExtremes: 'Temperature',
  other: 'Other',
};

type EventItem = {
  id: string;
  title: string;
  category: string;
  categoryLabel: string;
  date: string;
  lat: number;
  lon: number;
  magnitudeValue?: number;
  sources: { url?: string }[];
  urgencyScore: number;
  urgencyBadge: 'High' | 'Medium' | 'Low';
  articles?: { url: string; title: string; source?: string }[];
};

type NewsItem = {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  imageUrl: string | null;
  publishedAt: string;
  hazardTypes: string[];
};

const DAYS_OPTIONS = [
  { label: 'Last 24h', days: 1 },
  { label: '3 days', days: 3 },
  { label: '7 days', days: 7 },
];

function getCentroid(geom: { type: string; coordinates: number[] | number[][][] }): { lat: number; lon: number } {
  if (geom.type === 'Point' && Array.isArray(geom.coordinates)) {
    const [lon, lat] = geom.coordinates as number[];
    return { lat, lon };
  }
  if (geom.type === 'Polygon' && Array.isArray(geom.coordinates) && geom.coordinates[0]) {
    const ring = geom.coordinates[0] as [number, number][];
    const lon = ring.reduce((s, [x]) => s + x, 0) / ring.length;
    const lat = ring.reduce((s, [, y]) => s + y, 0) / ring.length;
    return { lat, lon };
  }
  return { lat: 0, lon: 0 };
}

function computeUrgencyScore(
  f: { properties?: { date?: string; closed?: string; magnitudeValue?: number; categories?: { id?: string }[] }; geometry?: unknown },
  newsCount: number
): number {
  const props = f.properties || {};
  const dateStr = props.date || props.closed || new Date().toISOString();
  const ageHours = (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60);
  const recency = Math.max(0, 1 - ageHours / (7 * 24));
  const mag = props.magnitudeValue ?? 0;
  const magNorm = Math.min(1, mag / 100);
  const catId = props.categories?.[0]?.id || 'other';
  const catWeight = CATEGORY_WEIGHTS[catId] ?? 0.5;
  const newsNorm = Math.min(1, newsCount / 5);
  return recency * 0.4 + magNorm * 0.2 + catWeight * 0.3 + newsNorm * 0.1;
}

function viewOnMap(event: EventItem) {
  sessionStorage.setItem('disasterMapFocus', JSON.stringify(event));
  window.location.href = '/map';
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ')     // Normalize spaces
    .trim();
}

function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname + urlObj.pathname; // Remove query params and protocol
  } catch {
    return url;
  }
}

// Extract key words from title for similarity matching
function getTitleKeywords(title: string): string {
  const normalized = normalizeTitle(title);
  // Remove common words and keep only significant keywords
  const stopWords = new Set(['the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were']);
  const words = normalized.split(' ').filter(word => word.length > 3 && !stopWords.has(word));
  return words.sort().join(' '); // Sort to catch word order variations
}

export default function DisasterNews() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [daysFilter, setDaysFilter] = useState(3);
  const [loadingNewsFor, setLoadingNewsFor] = useState<Set<string>>(new Set());
  const [eventsWithNews, setEventsWithNews] = useState<Map<string, EventItem>>(new Map());
  
  // User location state
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number; name?: string } | null>(null);
  const [locationPermission, setLocationPermission] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  
  // Top headlines state (based on user location)
  const [topHeadlines, setTopHeadlines] = useState<NewsItem[]>([]);
  const [loadingHeadlines, setLoadingHeadlines] = useState(false);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/eonet-events?status=open&days=14`);
      const data = await res.json();
      const features = (data.features || []) as Array<{
        id?: string;
        properties?: { id?: string; title?: string; date?: string; closed?: string; magnitudeValue?: number; categories?: { id?: string }[]; sources?: { url?: string }[] };
        geometry?: { type: string; coordinates: number[] | number[][][] };
      }>;
      const items: EventItem[] = features.map((f) => {
        const centroid = getCentroid(f.geometry || { type: 'Point', coordinates: [0, 0] });
        const catId = f.properties?.categories?.[0]?.id || 'other';
        return {
          id: f.properties?.id || f.id || `evt-${Math.random()}`,
          title: f.properties?.title || 'Event',
          category: catId,
          categoryLabel: CATEGORY_LABELS[catId] || catId,
          date: f.properties?.date || f.properties?.closed || new Date().toISOString(),
          lat: centroid.lat,
          lon: centroid.lon,
          magnitudeValue: f.properties?.magnitudeValue,
          sources: f.properties?.sources || [],
          urgencyScore: 0,
          urgencyBadge: 'Medium' as const,
        };
      });
      const withScores = items.map((e) => ({ ...e, urgencyScore: computeUrgencyScore(
        { properties: { date: e.date, magnitudeValue: e.magnitudeValue, categories: [{ id: e.category }] } },
        0
      ) }));
      withScores.sort((a, b) => b.urgencyScore - a.urgencyScore);
      const sorted = withScores.map((e, i) => {
        const pct = (i + 1) / withScores.length;
        let badge: 'High' | 'Medium' | 'Low' = 'Medium';
        if (pct <= 0.2) badge = 'High';
        else if (pct > 0.7) badge = 'Low';
        return { ...e, urgencyBadge: badge };
      });
      setEvents(sorted);
      setEventsWithNews(new Map());
    } catch (e) {
      console.error(e);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const requestUserLocation = useCallback(() => {
    if (!navigator.geolocation) {
      console.error('Geolocation not supported');
      setLocationPermission('denied');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const coords = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        };

        console.log('Got location:', coords);

        // Get location name using reverse geocoding
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${coords.lat}&lon=${coords.lon}&format=json`,
            { headers: { 'User-Agent': 'HarborApp/1.0' } }
          );
          const data = await res.json();
          const locationName = data.address?.city || data.address?.town || data.address?.county || data.address?.state || 'Your Location';
          setUserLocation({ ...coords, name: locationName });
        } catch (err) {
          console.error('Reverse geocoding error:', err);
          setUserLocation(coords);
        }

        setLocationPermission('granted');
      },
      (error) => {
        console.error('Location permission error:', error);
        setLocationPermission('denied');
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  }, []);

  const fetchTopHeadlines = useCallback(async (lat?: number, lon?: number) => {
    setLoadingHeadlines(true);
    try {
      // Fetch location-based news
      const locationPromise = lat && lon 
        ? fetch(`${API_BASE}/news/local?lat=${lat}&lon=${lon}&radiusKm=200&limit=30`).then(r => r.json())
        : Promise.resolve({ items: [] });
      
      const results = await locationPromise;
      const allArticles = results.items || [];
      
      console.log('📰 Fetched articles:', allArticles.length);
      
      // Remove duplicates with multi-level detection
      const seenTitles = new Set<string>();
      const seenUrls = new Set<string>();
      const seenKeywords = new Set<string>();
      
      const uniqueArticles = allArticles.filter((article: NewsItem) => {
        const normalizedTitle = normalizeTitle(article.title);
        const normalizedUrl = normalizeUrl(article.url);
        const keywords = getTitleKeywords(article.title);
        
        // Check exact title match
        if (seenTitles.has(normalizedTitle)) {
          console.log('❌ Duplicate (exact title):', article.title);
          return false;
        }
        
        // Check URL match
        if (seenUrls.has(normalizedUrl)) {
          console.log('❌ Duplicate (same URL):', article.title);
          return false;
        }
        
        // Check keyword similarity (catches variations)
        if (keywords && seenKeywords.has(keywords)) {
          console.log('❌ Duplicate (similar keywords):', article.title);
          return false;
        }
        
        seenTitles.add(normalizedTitle);
        seenUrls.add(normalizedUrl);
        if (keywords) seenKeywords.add(keywords);
        
        console.log('✅ Unique:', article.title);
        return true;
      });

      console.log('🎯 Final unique articles:', uniqueArticles.length);
      setTopHeadlines(uniqueArticles.slice(0, 9));
    } catch (e) {
      console.error('Failed to fetch top headlines:', e);
      setTopHeadlines([]);
    } finally {
      setLoadingHeadlines(false);
    }
  }, []);


  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    if (locationPermission === 'granted' && userLocation) {
      fetchTopHeadlines(userLocation.lat, userLocation.lon);
    }
  }, [locationPermission, userLocation, fetchTopHeadlines]);

  const loadNewsFor = useCallback(async (event: EventItem) => {
    if (eventsWithNews.has(event.id)) return;
    setLoadingNewsFor((s) => new Set(s).add(event.id));
    try {
      const params = new URLSearchParams({
        title: event.title,
        lat: String(event.lat),
        lon: String(event.lon),
        days: String(daysFilter),
        categoryId: event.category,
      });
      const res = await fetch(`${API_BASE}/event-news?${params}`);
      const data = await res.json();
      const articles = (data.articles || []).slice(0, 5);
      setEventsWithNews((m) => new Map(m).set(event.id, { ...event, articles }));
    } catch {
      setEventsWithNews((m) => new Map(m).set(event.id, { ...event, articles: [] }));
    } finally {
      setLoadingNewsFor((s) => {
        const n = new Set(s);
        n.delete(event.id);
        return n;
      });
    }
  }, [daysFilter, eventsWithNews]);

  const filtered = categoryFilter === 'all'
    ? events
    : events.filter((e) => e.category === categoryFilter);

  const categories = ['all', ...new Set(events.map((e) => e.category))];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-8">
        <h1 className="font-heading text-3xl md:text-4xl font-bold">Natural Disaster News</h1>
        <p className="text-muted-foreground mt-2">
          Stay informed with personalized headlines and real-time disaster updates.
        </p>
      </div>

      {/* Location Permission Banner */}
      {locationPermission === 'prompt' && (
        <div className="mb-8 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
          <div className="flex items-start gap-4">
            <MapPin className="h-6 w-6 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                Enable Location for Personalized News
              </h3>
              <p className="text-sm text-blue-700 dark:text-blue-300 mb-4">
                Get disaster news relevant to your area. We'll only use your location to show you nearby headlines.
              </p>
              <Button onClick={requestUserLocation} size="sm">
                <MapPin className="h-4 w-4 mr-2" />
                Allow Location Access
              </Button>
            </div>
          </div>
        </div>
      )}

      {locationPermission === 'denied' && (
        <div className="mb-8 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            Location access denied. Showing global news instead. You can enable location in your browser settings.
          </p>
        </div>
      )}

      {/* Top Headlines Section */}
      {locationPermission === 'granted' && (
        <section className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Newspaper className="h-6 w-6 text-primary" />
              <div>
                <h2 className="font-heading text-2xl font-semibold">Headlines Near You</h2>
                {userLocation?.name && (
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Showing news for {userLocation.name}
                  </p>
                )}
              </div>
            </div>
          </div>
          {loadingHeadlines ? (
            <div className="flex items-center justify-center gap-2 text-muted-foreground py-16">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>Loading your local headlines...</span>
            </div>
          ) : topHeadlines.length === 0 ? (
            <div className="text-center text-muted-foreground py-16 bg-muted/30 rounded-lg">
              <Newspaper className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No recent disaster news in your area.</p>
              <p className="text-sm mt-1">That's good news!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {topHeadlines.map((item) => (
                <Card key={item.id} className="group hover:shadow-lg transition-all duration-300 overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <Badge 
                        variant="outline" 
                        className="text-xs font-medium capitalize"
                      >
                        {item.hazardTypes[0] || 'disaster'}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(item.publishedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <CardTitle className="text-base line-clamp-3 leading-snug">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-primary transition-colors group-hover:underline"
                      >
                        {item.title}
                      </a>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground font-medium">{item.source}</span>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline font-medium inline-flex items-center gap-1"
                      >
                        Read full article
                        <span className="group-hover:translate-x-0.5 transition-transform">→</span>
                      </a>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Recent Disasters Section */}
      <section className="mb-12">
        <div className="flex items-center gap-3 mb-6">
          <MapPin className="h-6 w-6 text-primary" />
          <div>
            <h2 className="font-heading text-2xl font-semibold">Recent Natural Disasters</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Active events from around the world
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mb-6 p-4 bg-muted/30 rounded-lg">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">Filters:</span>
          </div>
          <div className="flex items-center gap-2">
            {DAYS_OPTIONS.map((o) => (
              <Button
                key={o.days}
                variant={daysFilter === o.days ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDaysFilter(o.days)}
              >
                {o.label}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <select
              className="border rounded-md px-3 py-1.5 text-sm bg-background hover:bg-muted/50 transition-colors"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c === 'all' ? 'All Categories' : CATEGORY_LABELS[c] || c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 text-muted-foreground py-16">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span>Loading disaster events...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-muted-foreground py-16 bg-muted/30 rounded-lg">
            <MapPin className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No active events found for the selected filters.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.slice(0, 25).map((event) => {
              const withNews = eventsWithNews.get(event.id);
              const loadingNews = loadingNewsFor.has(event.id);
              const hasLoaded = withNews !== undefined;
              return (
                <div
                  key={event.id}
                  className="bg-card border border-border rounded-lg p-5 hover:shadow-md hover:border-primary/50 transition-all"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <h3 className="font-semibold text-lg">{event.title}</h3>
                        <Badge
                          variant="outline"
                          className={cn(
                            'font-medium',
                            event.urgencyBadge === 'High' && 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950/20',
                            event.urgencyBadge === 'Medium' && 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/20',
                            event.urgencyBadge === 'Low' && 'border-slate-500 bg-slate-50 text-slate-700 dark:bg-slate-950/20'
                          )}
                        >
                          {event.urgencyBadge} Priority
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          {event.categoryLabel}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Last updated: {new Date(event.date).toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric', 
                          year: 'numeric' 
                        })}
                      </p>
                      {!hasLoaded && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-3"
                          onClick={() => loadNewsFor(event)}
                          disabled={loadingNews}
                        >
                          <Newspaper className="h-4 w-4 mr-2" />
                          {loadingNews ? 'Loading headlines...' : 'Show related headlines'}
                        </Button>
                      )}
                      {withNews && (withNews.articles || []).length > 0 && (
                        <div className="mt-4 p-3 bg-muted/30 rounded-md">
                          <strong className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
                            Related News Articles
                          </strong>
                          <div className="space-y-2">
                            {(withNews.articles || []).map((a, i) => (
                              <a
                                key={i}
                                href={a.url}
                                target="_blank"
                                rel="noopener"
                                className="block text-sm text-primary hover:underline leading-snug"
                              >
                                • {a.title?.slice(0, 100)}{a.title && a.title.length > 100 ? '...' : ''}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <Button size="sm" onClick={() => viewOnMap(event)} className="flex-shrink-0">
                      <MapPin className="h-4 w-4 mr-2" />
                      View on Map
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
