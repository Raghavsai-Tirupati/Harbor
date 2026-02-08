import { useState, useEffect, useCallback, useRef } from 'react';
import {
  MapPin, Newspaper, AlertTriangle, ExternalLink, Loader2,
  RefreshCw, Search, ChevronLeft, ChevronRight, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { API_BASE } from '@/lib/api';

/* ── Types ── */
type Article = {
  url: string;
  title: string;
  source?: string;
  publishedAt?: string | null;
  image?: string | null;
  disasterTitle?: string;
  disasterCategory?: string;
  disasterSeverity?: string;
};

type AlertData = {
  id: string;
  title: string;
  category: string;
  categoryLabel: string;
  alertText: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  urgencyScore: number;
  date: string;
  lat: number;
  lon: number;
  magnitudeValue?: number | null;
  articles: Article[];
};

type LocationDisaster = {
  id: string;
  title: string;
  category: string;
  categoryLabel: string;
  severity: string;
  date: string;
  lat: number;
  lon: number;
  magnitudeValue?: number | null;
  source: string;
  distanceKm?: number | null;
};

type LocationResult = {
  location: { query: string; displayName: string; lat: number; lon: number } | null;
  disasters: LocationDisaster[];
  totalFound: number;
};


/* ── Constants ── */
const SEVERITY_BADGE_STYLES: Record<string, string> = {
  critical: 'bg-red-500/15 text-red-600 border-red-500/30',
  high: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  medium: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30',
  low: 'bg-slate-500/15 text-slate-600 border-slate-500/30',
};

/* ── Helpers ── */
function viewOnMap(event: { id: string; title: string; lat: number; lon: number; [key: string]: unknown }) {
  sessionStorage.setItem('disasterMapFocus', JSON.stringify(event));
  window.location.href = '/map';
}

/* ── Deduplication by normalized title ── */
function deduplicateByTitle<T extends { title: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const norm = item.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim().slice(0, 50);
    if (seen.has(norm)) return false;
    seen.add(norm);
    return true;
  });
}

/* ══════════════════════════════════════════════════════════════════
   Component
   ══════════════════════════════════════════════════════════════════ */
export default function DisasterNews() {
  /* ── Alerts ── */
  const [alerts, setAlerts] = useState<AlertData[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);

  const fetchAlerts = useCallback(async () => {
    try {
      setAlertsLoading(true);
      const res = await fetch(`${API_BASE}/alerts`);
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      // Deduplicate alerts by title
      const raw: AlertData[] = data.alerts || [];
      setAlerts(deduplicateByTitle(raw));
    } catch {
      setAlerts([]);
    } finally {
      setAlertsLoading(false);
    }
  }, []);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  /* ── Headlines (for carousel + more articles) ── */
  const [headlines, setHeadlines] = useState<Article[]>([]);
  const [headlinesLoading, setHeadlinesLoading] = useState(true);
  const [carouselIdx, setCarouselIdx] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/headlines`);
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        if (!cancelled) setHeadlines(data.articles || []);
      } catch {
        if (!cancelled) setHeadlines([]);
      } finally {
        if (!cancelled) setHeadlinesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Auto-advance carousel
  useEffect(() => {
    const top = headlines.slice(0, 6);
    if (top.length <= 1) return;
    const t = setInterval(() => setCarouselIdx((i) => (i + 1) % top.length), 5000);
    return () => clearInterval(t);
  }, [headlines]);

  /* ── Location search ── */
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResult, setSearchResult] = useState<LocationResult | null>(null);
  const [searchError, setSearchError] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setSearchLoading(true);
    setSearchError('');
    setSearchResult(null);
    try {
      const res = await fetch(`${API_BASE}/search-location?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) {
        setSearchError(data.error || 'Location not found');
        return;
      }
      setSearchResult(data);
    } catch {
      setSearchError('Failed to search. Try again.');
    } finally {
      setSearchLoading(false);
    }
  }, [searchQuery]);

  /* ── Carousel data ── */
  const carouselItems = headlines.slice(0, 6);
  const moreArticles = headlines.slice(6, 20);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-heading text-3xl md:text-4xl font-bold">Natural Disaster News</h1>
        <p className="text-muted-foreground mt-2">
          Live alerts, breaking headlines, and location-based disaster search.
        </p>
      </div>

      {/* ═══ SECTION 1: Location Search Bar ═══ */}
      <div className="mb-10">
        <div className="flex items-center gap-2 mb-3">
          <Search className="h-5 w-5 text-primary" />
          <h2 className="font-heading text-lg font-semibold">Search Disasters by Location</h2>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); handleSearch(); }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Enter a city, country, or region (e.g. Tokyo, California, Bangladesh)…"
              className="w-full border rounded-lg px-4 py-3 pr-10 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => { setSearchQuery(''); setSearchResult(null); setSearchError(''); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button type="submit" disabled={searchLoading || !searchQuery.trim()}>
            {searchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            <span className="ml-1 hidden sm:inline">Search</span>
          </Button>
        </form>

        {/* Search results */}
        {searchError && (
          <p className="text-sm text-red-500 mt-3">{searchError}</p>
        )}
        {searchResult && (
          <div className="mt-4 border rounded-lg p-4 bg-card">
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="h-4 w-4 text-primary" />
              <span className="font-medium text-sm">{searchResult.location?.displayName}</span>
              <Badge variant="outline" className="text-xs">
                {searchResult.totalFound} disaster{searchResult.totalFound !== 1 ? 's' : ''} found
              </Badge>
            </div>
            {searchResult.disasters.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active disasters near this location. That's good news!</p>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {searchResult.disasters.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-start justify-between gap-3 p-3 rounded-md border bg-background hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{d.title}</span>
                        <Badge variant="outline" className={cn("text-[10px] uppercase", SEVERITY_BADGE_STYLES[d.severity] || '')}>
                          {d.severity}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {d.categoryLabel} · {d.source}
                        {d.distanceKm != null && ` · ~${d.distanceKm} km away`}
                        {d.magnitudeValue && ` · M${d.magnitudeValue}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => viewOnMap(d)}>
                      <MapPin className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border mb-10" />

      {/* ═══ SECTION 2: Live Disaster Alerts (deduplicated) ═══ */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <h2 className="font-heading text-lg font-semibold">Live Disaster Alerts</h2>
            {!alertsLoading && alerts.length > 0 && (
              <Badge variant="outline" className="text-xs">{alerts.length} active</Badge>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={fetchAlerts} disabled={alertsLoading}>
            <RefreshCw className={cn("h-4 w-4 mr-1", alertsLoading && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {alertsLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Fetching live alerts…
          </div>
        ) : alerts.length === 0 ? (
          <div className="text-muted-foreground text-sm py-4">No active alerts at this time.</div>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={cn(
                  "rounded-lg border p-4 transition-colors",
                  alert.severity === 'critical' && "border-red-500/40 bg-red-500/5",
                  alert.severity === 'high' && "border-amber-500/40 bg-amber-500/5",
                  alert.severity === 'medium' && "border-yellow-500/30 bg-yellow-500/5",
                  alert.severity === 'low' && "border-border bg-card",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-sm">{alert.title}</h3>
                      <Badge
                        variant="outline"
                        className={cn("text-[10px] uppercase tracking-wider", SEVERITY_BADGE_STYLES[alert.severity])}
                      >
                        {alert.severity}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{alert.categoryLabel}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(alert.date).toLocaleDateString(undefined, {
                        weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                      {alert.magnitudeValue && ` · Magnitude ${alert.magnitudeValue}`}
                    </p>
                    {alert.articles && alert.articles.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {alert.articles.slice(0, 3).map((article, i) => (
                          <a
                            key={i}
                            href={article.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs text-primary hover:underline truncate group"
                          >
                            <ExternalLink className="h-3 w-3 shrink-0 opacity-50 group-hover:opacity-100" />
                            <span className="truncate">{article.title?.slice(0, 100)}</span>
                            {article.source && <span className="text-muted-foreground shrink-0">— {article.source}</span>}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => viewOnMap({
                    id: alert.id, title: alert.title, category: alert.category,
                    categoryLabel: alert.categoryLabel, date: alert.date,
                    lat: alert.lat, lon: alert.lon, urgencyScore: alert.urgencyScore,
                    urgencyBadge: alert.severity === 'critical' || alert.severity === 'high' ? 'High' : alert.severity === 'medium' ? 'Medium' : 'Low',
                    sources: [],
                  })}>
                    <MapPin className="h-3 w-3 mr-1" /> Map
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border mb-10" />

      {/* ═══ SECTION 3: Headlines Carousel ═══ */}
      <div className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <Newspaper className="h-5 w-5 text-primary" />
          <h2 className="font-heading text-lg font-semibold">Breaking Headlines</h2>
        </div>

        {headlinesLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-8">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading headlines…
          </div>
        ) : carouselItems.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4">No headlines available.</p>
        ) : (
          <div>
            {/* Main carousel card */}
            <div className="relative overflow-hidden rounded-lg border bg-card min-h-[180px]">
              {carouselItems.map((item, i) => (
                <a
                  key={i}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "absolute inset-0 p-6 flex flex-col justify-end transition-all duration-500",
                    i === carouselIdx ? "opacity-100 translate-x-0" : "opacity-0 translate-x-full pointer-events-none",
                  )}
                >
                  {item.disasterCategory && (
                    <span className="text-[10px] tracking-[0.15em] uppercase text-red-500/80 mb-0.5">
                      {item.disasterCategory}{item.disasterTitle ? ` — ${item.disasterTitle}` : ''}
                    </span>
                  )}
                  <span className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground mb-1">
                    {item.source}
                    {item.publishedAt && ` · ${new Date(item.publishedAt).toLocaleDateString()}`}
                  </span>
                  <h3 className="font-heading text-xl font-semibold leading-snug line-clamp-3 hover:text-primary transition-colors">
                    {item.title}
                  </h3>
                  <span className="text-xs text-primary flex items-center gap-1 mt-2">
                    <ExternalLink className="h-3 w-3" /> Read full article
                  </span>
                </a>
              ))}
            </div>

            {/* Carousel controls */}
            <div className="flex items-center justify-center gap-3 mt-3">
              <button
                onClick={() => setCarouselIdx((i) => (i - 1 + carouselItems.length) % carouselItems.length)}
                className="p-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex gap-1.5">
                {carouselItems.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCarouselIdx(i)}
                    className={cn("w-2 h-2 rounded-full transition-colors", i === carouselIdx ? "bg-primary" : "bg-muted-foreground/30")}
                  />
                ))}
              </div>
              <button
                onClick={() => setCarouselIdx((i) => (i + 1) % carouselItems.length)}
                className="p-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ═══ SECTION 4: More Articles (smaller cards) ═══ */}
      {moreArticles.length > 0 && (
        <div className="mb-10">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            More Headlines
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {moreArticles.map((article, i) => (
              <a
                key={i}
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block border rounded-md p-3 bg-card hover:border-primary/30 transition-colors"
              >
                {article.disasterCategory && (
                  <span className="text-[10px] tracking-[0.1em] uppercase text-red-500/70 block mb-0.5">
                    {article.disasterCategory}
                  </span>
                )}
                <span className="text-[10px] tracking-[0.1em] uppercase text-muted-foreground block mb-1">
                  {article.source}
                </span>
                <h4 className="text-xs font-medium leading-snug line-clamp-3 group-hover:text-primary transition-colors">
                  {article.title}
                </h4>
                {article.publishedAt && (
                  <span className="text-[10px] text-muted-foreground/60 mt-1.5 block">
                    {new Date(article.publishedAt).toLocaleDateString()}
                  </span>
                )}
              </a>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
