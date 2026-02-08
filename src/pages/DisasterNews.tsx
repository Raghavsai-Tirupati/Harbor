import { useState, useEffect, useCallback, useRef } from 'react';
import { MapPin, Newspaper, Filter, Search, ExternalLink, ChevronDown, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { fetchEonet, fetchEventNews } from '@/lib/disasterApi';

const CATEGORY_WEIGHTS: Record<string, number> = {
  severeStorms: 1.0,
  volcanoes: 0.95,
  earthquakes: 0.9,
  floods: 0.9,
  wildfires: 0.85,
  landslides: 0.8,
  seaLakeIce: 0.7,
  temperatureExtremes: 0.75,
  droughts: 0.65,
  snow: 0.6,
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

const CATEGORY_COLORS: Record<string, string> = {
  severeStorms: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
  wildfires: 'bg-red-500/20 text-red-400 border-red-500/30',
  volcanoes: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  earthquakes: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  floods: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  landslides: 'bg-stone-500/20 text-stone-400 border-stone-500/30',
  droughts: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  seaLakeIce: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  snow: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  temperatureExtremes: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
};

type Article = { url: string; title: string; source?: string; publishedAt?: string };

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
  articles?: Article[];
  newsLoaded?: boolean;
  newsLoading?: boolean;
};

const DAYS_OPTIONS = [
  { label: '24h', days: 1 },
  { label: '3 days', days: 3 },
  { label: '7 days', days: 7 },
];

const AUTO_FETCH_COUNT = 10;

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

function computeUrgencyScore(date: string, magnitudeValue?: number, categoryId?: string): number {
  const ageHours = (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60);
  const recency = Math.max(0, 1 - ageHours / (7 * 24));
  const mag = magnitudeValue ?? 0;
  const magNorm = Math.min(1, mag / 100);
  const catWeight = CATEGORY_WEIGHTS[categoryId || 'other'] ?? 0.5;
  return recency * 0.45 + magNorm * 0.2 + catWeight * 0.35;
}

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
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
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const autoFetchedRef = useRef(false);

  // Fetch EONET events
  const loadEvents = useCallback(async () => {
    setLoading(true);
    autoFetchedRef.current = false;
    try {
      const data = await fetchEonet({ bbox: '-180,85,180,-85', status: 'open', days: '14' });
      const features = (data.features || []) as Array<{
        id?: string;
        properties?: {
          id?: string; title?: string; date?: string; closed?: string;
          magnitudeValue?: number; categories?: { id?: string }[];
          sources?: { url?: string }[];
        };
        geometry?: { type: string; coordinates: number[] | number[][][] };
      }>;

      const items: EventItem[] = features.map((f) => {
        const centroid = getCentroid(f.geometry || { type: 'Point', coordinates: [0, 0] });
        const catId = f.properties?.categories?.[0]?.id || 'other';
        const date = f.properties?.date || f.properties?.closed || new Date().toISOString();
        return {
          id: f.properties?.id || f.id || `evt-${Math.random()}`,
          title: f.properties?.title || 'Event',
          category: catId,
          categoryLabel: CATEGORY_LABELS[catId] || catId,
          date,
          lat: centroid.lat,
          lon: centroid.lon,
          magnitudeValue: f.properties?.magnitudeValue,
          sources: f.properties?.sources || [],
          urgencyScore: computeUrgencyScore(date, f.properties?.magnitudeValue, catId),
          urgencyBadge: 'Medium' as const,
        };
      });

      items.sort((a, b) => b.urgencyScore - a.urgencyScore);
      const ranked = items.map((e, i) => {
        const pct = (i + 1) / items.length;
        let badge: 'High' | 'Medium' | 'Low' = 'Medium';
        if (pct <= 0.2) badge = 'High';
        else if (pct > 0.7) badge = 'Low';
        return { ...e, urgencyBadge: badge };
      });

      setEvents(ranked);
    } catch (err) {
      console.error('Failed to load events:', err);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  // Auto-fetch news for top events
  const loadNewsForEvent = useCallback(async (eventId: string) => {
    setEvents((prev) => prev.map((e) => e.id === eventId ? { ...e, newsLoading: true } : e));
    const event = events.find((e) => e.id === eventId);
    if (!event) return;

    try {
      const data = await fetchEventNews({
        title: event.title,
        lat: event.lat,
        lon: event.lon,
        days: daysFilter,
        categoryId: event.category,
      });
      const articles = (data.articles || []).slice(0, 10) as Article[];
      setEvents((prev) => prev.map((e) =>
        e.id === eventId ? { ...e, articles, newsLoaded: true, newsLoading: false } : e
      ));
    } catch {
      setEvents((prev) => prev.map((e) =>
        e.id === eventId ? { ...e, articles: [], newsLoaded: true, newsLoading: false } : e
      ));
    }
  }, [events, daysFilter]);

  // Auto-fetch news for top N events once loaded
  useEffect(() => {
    if (loading || autoFetchedRef.current || events.length === 0) return;
    autoFetchedRef.current = true;
    const topEvents = events.slice(0, AUTO_FETCH_COUNT);
    // Stagger fetches to avoid hammering the API
    topEvents.forEach((evt, i) => {
      setTimeout(() => loadNewsForEvent(evt.id), i * 500);
    });
  }, [loading, events.length]);

  // Filtered list
  const filtered = events
    .filter((e) => categoryFilter === 'all' || e.category === categoryFilter)
    .filter((e) => !searchQuery.trim() || e.title.toLowerCase().includes(searchQuery.toLowerCase()));

  const categories = ['all', ...new Set(events.map((e) => e.category))];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <AlertTriangle className="h-6 w-6 text-amber-500" />
            <h1 className="font-heading text-3xl font-bold">Disaster News</h1>
          </div>
          <p className="text-muted-foreground">
            Real-time natural disaster events from NASA EONET with related news articles. Sorted by urgency.
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 mb-6 p-4 rounded-lg bg-card border border-border">
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search events..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground"
            />
          </div>
          <div className="h-6 w-px bg-border hidden sm:block" />
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            {DAYS_OPTIONS.map((o) => (
              <Button
                key={o.days}
                variant={daysFilter === o.days ? 'default' : 'outline'}
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  setDaysFilter(o.days);
                  // Re-fetch news with new time window
                  setEvents((prev) => prev.map((e) => ({ ...e, newsLoaded: false, articles: undefined })));
                  autoFetchedRef.current = false;
                }}
              >
                {o.label}
              </Button>
            ))}
          </div>
          <div className="h-6 w-px bg-border hidden sm:block" />
          <select
            className="border rounded px-2 py-1 text-xs bg-background"
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

        {/* Event count */}
        {!loading && (
          <p className="text-xs text-muted-foreground mb-4">
            Showing {filtered.length} of {events.length} active events
          </p>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20 gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            <span className="text-muted-foreground">Loading disaster events...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            No active events found matching your filters.
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((event) => {
              const isExpanded = expandedEvents.has(event.id);
              const articles = event.articles || [];
              const visibleArticles = isExpanded ? articles : articles.slice(0, 3);

              return (
                <div
                  key={event.id}
                  className="bg-card border border-border rounded-lg overflow-hidden hover:border-primary/20 transition-colors"
                >
                  {/* Event header */}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px] px-1.5 py-0',
                              event.urgencyBadge === 'High' && 'border-red-500/50 text-red-500 bg-red-500/10',
                              event.urgencyBadge === 'Medium' && 'border-amber-500/50 text-amber-500 bg-amber-500/10',
                              event.urgencyBadge === 'Low' && 'border-slate-500/50 text-slate-500 bg-slate-500/10'
                            )}
                          >
                            {event.urgencyBadge}
                          </Badge>
                          <span className={cn(
                            'text-[10px] px-1.5 py-0.5 rounded-full border',
                            CATEGORY_COLORS[event.category] || 'bg-slate-500/20 text-slate-400 border-slate-500/30'
                          )}>
                            {event.categoryLabel}
                          </span>
                          <span className="text-[10px] text-muted-foreground">{timeAgo(event.date)}</span>
                        </div>
                        <h3 className="font-semibold text-sm">{event.title}</h3>

                        {/* Official sources */}
                        {event.sources.filter((s) => s.url).length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {event.sources.filter((s) => s.url).map((s, i) => (
                              <a
                                key={i}
                                href={s.url}
                                target="_blank"
                                rel="noopener"
                                className="text-[10px] text-primary hover:underline inline-flex items-center gap-0.5"
                              >
                                <ExternalLink className="h-2.5 w-2.5" />
                                Official Source {i + 1}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                      <Button variant="outline" size="sm" className="h-7 text-xs flex-shrink-0" onClick={() => viewOnMap(event)}>
                        <MapPin className="h-3 w-3 mr-1" />
                        Map
                      </Button>
                    </div>
                  </div>

                  {/* News articles */}
                  {event.newsLoading && (
                    <div className="px-4 pb-3 flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Loading news...
                    </div>
                  )}

                  {event.newsLoaded && articles.length > 0 && (
                    <div className="border-t border-border px-4 py-3 bg-muted/30">
                      <div className="flex items-center gap-1 mb-2">
                        <Newspaper className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                          Related News ({articles.length})
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {visibleArticles.map((a, i) => (
                          <a
                            key={i}
                            href={a.url}
                            target="_blank"
                            rel="noopener"
                            className="flex items-baseline gap-2 text-xs hover:bg-muted/50 rounded px-1 py-0.5 -mx-1 transition-colors group"
                          >
                            <span className="text-primary group-hover:underline flex-1 line-clamp-1">
                              {a.title}
                            </span>
                            {a.source && (
                              <span className="text-[10px] text-muted-foreground flex-shrink-0">
                                {a.source}
                              </span>
                            )}
                          </a>
                        ))}
                      </div>
                      {articles.length > 3 && !isExpanded && (
                        <button
                          onClick={() => setExpandedEvents((s) => new Set(s).add(event.id))}
                          className="text-[10px] text-primary hover:underline mt-2 inline-flex items-center gap-0.5"
                        >
                          <ChevronDown className="h-3 w-3" />
                          Show {articles.length - 3} more
                        </button>
                      )}
                    </div>
                  )}

                  {!event.newsLoaded && !event.newsLoading && (
                    <div className="border-t border-border px-4 py-2">
                      <button
                        onClick={() => loadNewsForEvent(event.id)}
                        className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                      >
                        <Newspaper className="h-3 w-3" />
                        Load related news
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
