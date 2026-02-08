import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Newspaper, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

export default function DisasterNews() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [daysFilter, setDaysFilter] = useState(3);
  const [loadingNewsFor, setLoadingNewsFor] = useState<Set<string>>(new Set());
  const [eventsWithNews, setEventsWithNews] = useState<Map<string, EventItem>>(new Map());

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

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

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
  }, [daysFilter]);

  const filtered = categoryFilter === 'all'
    ? events
    : events.filter((e) => e.category === categoryFilter);

  const categories = ['all', ...new Set(events.map((e) => e.category))];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
      <div className="mb-8">
        <h1 className="font-heading text-3xl md:4xl font-bold">Natural Disaster News</h1>
        <p className="text-muted-foreground mt-2">
          Active events sorted by urgency. Click an event to load related headlines.
        </p>
      </div>

      <div className="flex flex-wrap gap-4 mb-8">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Time:</span>
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
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Category:</span>
          <select
            className="border rounded px-3 py-1.5 text-sm bg-background"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c === 'all' ? 'All' : CATEGORY_LABELS[c] || c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-muted-foreground py-12">Loading events…</div>
      ) : filtered.length === 0 ? (
        <div className="text-muted-foreground py-12">No active events found.</div>
      ) : (
        <div className="space-y-4">
          {filtered.slice(0, 25).map((event) => {
            const withNews = eventsWithNews.get(event.id);
            const loadingNews = loadingNewsFor.has(event.id);
            const hasLoaded = withNews !== undefined;
            return (
              <div
                key={event.id}
                className="bg-card border border-border rounded-lg p-4 hover:border-primary/30 transition-colors"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{event.title}</h3>
                      <Badge
                        variant="outline"
                        className={cn(
                          event.urgencyBadge === 'High' && 'border-red-500 text-red-600',
                          event.urgencyBadge === 'Medium' && 'border-amber-500 text-amber-600',
                          event.urgencyBadge === 'Low' && 'border-slate-500 text-slate-600'
                        )}
                      >
                        {event.urgencyBadge}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{event.categoryLabel}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Last updated: {new Date(event.date).toLocaleDateString()}
                    </p>
                    {!hasLoaded && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2"
                        onClick={() => loadNewsFor(event)}
                        disabled={loadingNews}
                      >
                        <Newspaper className="h-4 w-4 mr-1" />
                        {loadingNews ? 'Fetching…' : 'Load headlines'}
                      </Button>
                    )}
                    {withNews && (withNews.articles || []).length > 0 && (
                      <div className="mt-3 space-y-1">
                        <strong className="text-xs">Related headlines:</strong>
                        {(withNews.articles || []).map((a, i) => (
                          <a
                            key={i}
                            href={a.url}
                            target="_blank"
                            rel="noopener"
                            className="block text-xs text-primary hover:underline truncate"
                          >
                            {a.title?.slice(0, 80)}…
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button size="sm" onClick={() => viewOnMap(event)}>
                    <MapPin className="h-4 w-4 mr-1" />
                    View on Map
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
