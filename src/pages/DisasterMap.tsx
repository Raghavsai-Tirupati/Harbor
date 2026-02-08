import { useState, useRef, useCallback, useEffect } from 'react';
import { useJsApiLoader, GoogleMap } from '@react-google-maps/api';
import { cn } from '@/lib/utils';

const API_BASE = '/api';

const mapContainerStyle = {
  width: '100%',
  height: '100%',
};

const defaultCenter = { lat: 20, lng: 0 };

const SEASON_MONTHS: Record<string, number[]> = {
  Spring: [3, 4, 5],
  Summer: [6, 7, 8],
  Fall: [9, 10, 11],
  Winter: [12, 1, 2],
};

const ZOOM_SHOW_COUNTRY_LABELS = 5; // Show country names when zoomed in to this level or higher

const BASE_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { featureType: 'all', elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#17263c' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#304a7d' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
  { featureType: 'administrative.country', elementType: 'geometry.stroke', stylers: [{ color: '#3d4f5c' }, { weight: 0.5 }] },
];
const HIDE_COUNTRY_LABELS_STYLE: google.maps.MapTypeStyle = {
  featureType: 'administrative.country',
  elementType: 'labels',
  stylers: [{ visibility: 'off' }],
};

function monthInSeason(month: number, season: string): boolean {
  return (SEASON_MONTHS[season] || []).includes(month);
}

function getSeasonDateRange(season: string, yearOffset = 0): { start: string; end: string } {
  const y = new Date().getFullYear() - yearOffset;
  const months = SEASON_MONTHS[season];
  if (!months) return { start: `${y}-01-01`, end: `${y}-12-31` };
  const startMonth = Math.min(...months);
  const endMonth = Math.max(...months);
  return {
    start: `${y}-${String(startMonth).padStart(2, '0')}-01`,
    end: `${y}-${String(endMonth).padStart(2, '0')}-${endMonth === 2 ? 28 : 30}`,
  };
}

const GRID_SIZE = 2; // degrees - cluster events within ~2° cells
const MIN_EVENTS_FOR_PREDICTION = 2;
const PREDICTION_YEARS = 5;

function buildPredictionFeatures(
  eonetFeatures: EONETFeature[],
  usgsFeatures: { geometry?: { coordinates?: number[] }; properties?: { mag?: number; place?: string } }[],
  season: string
): PredictionFeature[] {
  type Cluster = { lats: number[]; lngs: number[]; count: number };
  const clusters = new Map<string, Cluster>();

  const addPoint = (lat: number, lng: number, catId: string) => {
    const gLat = Math.floor(lat / GRID_SIZE) * GRID_SIZE;
    const gLng = Math.floor(lng / GRID_SIZE) * GRID_SIZE;
    const key = `${catId}|${gLat}|${gLng}`;
    const c = clusters.get(key);
    if (c) {
      c.lats.push(lat);
      c.lngs.push(lng);
      c.count++;
    } else {
      clusters.set(key, { lats: [lat], lngs: [lng], count: 1 });
    }
  };

  for (const f of eonetFeatures) {
    const catId = f.properties?.categories?.[0]?.id || 'other';
    if (f.geometry?.type === 'Point' && f.geometry.coordinates) {
      const [lng, lat] = f.geometry.coordinates as number[];
      addPoint(lat, lng, catId);
    } else if (f.geometry?.type === 'Polygon' && f.geometry.coordinates) {
      const ring = f.geometry.coordinates[0] as [number, number][];
      const centerLng = ring.reduce((s, [x]) => s + x, 0) / ring.length;
      const centerLat = ring.reduce((s, [, y]) => s + y, 0) / ring.length;
      addPoint(centerLat, centerLng, catId);
    }
  }
  for (const f of usgsFeatures) {
    const coords = f.geometry?.coordinates;
    if (coords && coords.length >= 2) {
      const [lng, lat] = coords;
      addPoint(lat, lng, 'earthquakes');
    }
  }

  const yearEnd = new Date().getFullYear();
  const yearStart = yearEnd - PREDICTION_YEARS + 1;
  const yearRange = `${yearStart}–${yearEnd}`;
  const predictions: PredictionFeature[] = [];

  clusters.forEach((c, key) => {
    if (c.count < MIN_EVENTS_FOR_PREDICTION) return;
    const [catId] = key.split('|');
    const avgLat = c.lats.reduce((a, b) => a + b, 0) / c.lats.length;
    const avgLng = c.lngs.reduce((a, b) => a + b, 0) / c.lngs.length;
    const label = CATEGORY_LABELS[catId] || catId;
    predictions.push({
      geometry: { type: 'Point', coordinates: [avgLng, avgLat] },
      properties: {
        categoryId: catId,
        categoryLabel: label,
        season,
        count: c.count,
        yearRange,
      },
    });
  });
  return predictions;
}

// EONET category IDs → color (fill, stroke)
const DISASTER_COLORS: Record<string, { fill: string; stroke: string }> = {
  severeStorms: { fill: '#0ea5e9', stroke: '#0284c7' },
  wildfires: { fill: '#ef4444', stroke: '#b91c1c' },
  volcanoes: { fill: '#7c3aed', stroke: '#5b21b6' },
  earthquakes: { fill: '#f59e0b', stroke: '#d97706' },
  droughts: { fill: '#d97706', stroke: '#b45309' },
  floods: { fill: '#06b6d4', stroke: '#0891b2' },
  landslides: { fill: '#78716c', stroke: '#57534e' },
  seaLakeIce: { fill: '#22d3ee', stroke: '#06b6d4' },
  snow: { fill: '#e0e7ff', stroke: '#a5b4fc' },
  temperatureExtremes: { fill: '#f97316', stroke: '#ea580c' },
};
const DEFAULT_COLOR = { fill: '#64748b', stroke: '#475569' };

const CATEGORY_LABELS: Record<string, string> = {
  severeStorms: 'Severe Storms',
  wildfires: 'Wildfires',
  volcanoes: 'Volcanoes',
  earthquakes: 'Earthquakes',
  droughts: 'Droughts',
  floods: 'Floods',
  landslides: 'Landslides',
  seaLakeIce: 'Ice / Sea Ice',
  snow: 'Snow',
  temperatureExtremes: 'Temperature Extremes',
  other: 'Other',
};

type EONETFeature = {
  geometry?: { type: string; coordinates: number[] | number[][][] };
  properties?: {
    title?: string;
    sources?: { url?: string }[];
    closed?: string;
    categories?: { id?: string }[];
  };
};

type PredictionFeature = {
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    categoryId: string;
    categoryLabel: string;
    season: string;
    count: number;
    yearRange: string;
  };
};

type OverlayObject = google.maps.Marker | google.maps.Polygon | google.maps.InfoWindow;

function getCategoryColor(categoryId: string | undefined, isPrediction: boolean) {
  const c = categoryId ? DISASTER_COLORS[categoryId] : null;
  return c || DEFAULT_COLOR;
}

type FocusEvent = { title: string; sources: { url?: string }[]; lat: number; lon: number; category?: string };

function addOverlay(
  map: google.maps.Map,
  geojson: { features?: EONETFeature[] | PredictionFeature[] },
  overlaysRef: { current: OverlayObject[] },
  isPrediction: boolean,
  focusEvent?: FocusEvent | null
) {
  overlaysRef.current.forEach((o) => {
    if (o instanceof google.maps.InfoWindow) o.close();
    else o.setMap(null);
  });
  overlaysRef.current = [];

  const infoWindow = new google.maps.InfoWindow({
    pixelOffset: new google.maps.Size(0, -10),
  });
  overlaysRef.current.push(infoWindow);

  const renderContent = (
    title: string,
    extra: string,
    sourceLinks: string,
    newsHtml: string
  ) =>
    `<div style="padding:10px 12px;min-width:260px;max-width:360px;background:#ffffff;color:#1e293b;font-family:system-ui,sans-serif;font-size:14px;line-height:1.5;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.15);">` +
    `<strong style="color:#0f172a">${title || 'Event'}</strong><br/>` +
    (extra ? `<span style="color:#64748b;font-size:12px">${extra}</span><br/>` : '') +
    (sourceLinks ? `<div style="margin-top:6px"><strong>Official links:</strong> ${sourceLinks}</div>` : '') +
    (newsHtml ? `<div style="margin-top:8px;border-top:1px solid #e2e8f0;padding-top:8px">${newsHtml}</div>` : '') +
    `</div>`;

  const showInfo = (
    title: string,
    extra: string,
    sources: { url?: string }[],
    pos: google.maps.LatLng,
    isPred: boolean,
    lat?: number,
    lon?: number,
    categoryId?: string
  ) => {
    const sourceLinks =
      !isPred &&
      sources
        .filter((s) => s.url)
        .map((s) => `<a href="${s.url}" target="_blank" rel="noopener" style="color:#2563eb">Source</a>`)
        .join(' ');

    const updateNews = (newsHtml: string) => {
      infoWindow.setContent(renderContent(title, extra, sourceLinks || '', newsHtml));
    };

    updateNews('<span style="color:#64748b;font-size:12px">Related News: Fetching news…</span>');
    infoWindow.open(map);
    infoWindow.setPosition(pos);

    if (isPred || lat == null || lon == null) {
      updateNews('');
      return;
    }

    const params = new URLSearchParams({
      title: title || 'disaster',
      lat: String(lat),
      lon: String(lon),
      days: '3',
      categoryId: categoryId || 'other',
    });
    fetch(`${API_BASE}/event-news?${params}`)
      .then((r) => r.json())
      .then((data) => {
        const arts = data.articles || [];
        if (arts.length === 0) {
          updateNews('');
          return;
        }
        const list = arts
          .slice(0, 8)
          .map(
            (a: { url?: string; title?: string; source?: string }) =>
              `<a href="${a.url}" target="_blank" rel="noopener" style="color:#2563eb;font-size:12px;display:block;margin:4px 0">${(a.title || 'Article').slice(0, 60)}…</a>`
          )
          .join('');
        updateNews(`<strong>Related News</strong> (${arts.length}):<br/>${list}`);
      })
      .catch(() => updateNews(''));
  };

  for (const f of geojson.features || []) {
    const props = f.properties || {};
    const catId = props.categories?.[0]?.id ?? (f as PredictionFeature).properties?.categoryId;
    const { fill: fillColor, stroke: strokeColor } = getCategoryColor(catId, isPrediction);

    if (isPrediction && 'categoryId' in props) {
      const pf = f as PredictionFeature;
      const p = pf.properties;
      const [lng, lat] = pf.geometry.coordinates;
      const pos = new google.maps.LatLng(lat, lng);
      const title = `Predicted ${p.categoryLabel} for ${p.season}`;
      const extra = `We predict ${p.categoryLabel.toLowerCase()} in this area for ${p.season} because ${p.count} similar ${p.categoryLabel.toLowerCase()} occurred here in past ${p.season}s (${p.yearRange}).`;
      const marker = new google.maps.Marker({
        map,
        position: pos,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor,
          fillOpacity: 0.9,
          strokeColor,
          strokeWeight: 1.5,
        },
      });
      marker.addListener('click', () => showInfo(title, extra, [], pos, true, undefined, undefined, undefined));
      overlaysRef.current.push(marker);
      continue;
    }

    const eonetF = f as EONETFeature;
    const title = eonetF.properties?.title || 'Event';
    const sources = Array.isArray(eonetF.properties?.sources) ? eonetF.properties.sources : [];
    const extra = '';
    if (eonetF.geometry?.type === 'Point' && eonetF.geometry.coordinates) {
      const [lng, lat] = eonetF.geometry.coordinates as number[];
      const pos = new google.maps.LatLng(lat, lng);
      const marker = new google.maps.Marker({
        map,
        position: pos,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor,
          fillOpacity: 0.9,
          strokeColor,
          strokeWeight: 1.5,
        },
      });
      marker.addListener('click', () => showInfo(title, extra, sources, pos, false, lat, lng, catId));
      overlaysRef.current.push(marker);
    } else if (eonetF.geometry?.type === 'Polygon' && eonetF.geometry.coordinates) {
      const path = (eonetF.geometry.coordinates[0] as [number, number][]).map(([ln, lt]) => ({ lat: lt, lng: ln }));
      const poly = new google.maps.Polygon({
        map,
        paths: path,
        fillColor,
        fillOpacity: isPrediction ? 0.15 : 0.2,
        strokeColor,
        strokeWeight: 1,
      });
      const ring = eonetF.geometry.coordinates[0] as [number, number][];
      const clng = ring.reduce((s, [x]) => s + x, 0) / ring.length;
      const clat = ring.reduce((s, [, y]) => s + y, 0) / ring.length;
      poly.addListener('click', (e: google.maps.MapMouseEvent) =>
        showInfo(title, extra, sources, e.latLng || new google.maps.LatLng(clat, clng), false, clat, clng, catId)
      );
      overlaysRef.current.push(poly);
    }
  }

  if (focusEvent && !isPrediction) {
    const pos = new google.maps.LatLng(focusEvent.lat, focusEvent.lon);
    map.panTo(pos);
    map.setZoom(6);
    showInfo(
      focusEvent.title,
      '',
      focusEvent.sources || [],
      pos,
      false,
      focusEvent.lat,
      focusEvent.lon,
      focusEvent.category
    );
  }
}

export default function DisasterMap() {
  const [mapMode, setMapMode] = useState<'current' | 'predictions'>('current');
  const [seasonFilter, setSeasonFilter] = useState<string>('Summer');
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlaysRef = useRef<OverlayObject[]>([]);
  const fetchInProgressRef = useRef(false);
  const focusEventRef = useRef<FocusEvent | null>(null);

  useEffect(() => {
    try {
      const s = sessionStorage.getItem('disasterMapFocus');
      if (s) {
        const parsed = JSON.parse(s);
        focusEventRef.current = {
          title: parsed.title || 'Event',
          sources: parsed.sources || [],
          lat: parseFloat(parsed.lat) || 0,
          lon: parseFloat(parsed.lon) || 0,
          category: parsed.category,
        };
        sessionStorage.removeItem('disasterMapFocus');
      }
    } catch {
      focusEventRef.current = null;
    }
  }, []);

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey || '',
  });

  const fetchData = useCallback(() => {
    const map = mapRef.current;
    if (!map || fetchInProgressRef.current) return;

    fetchInProgressRef.current = true;
    const done = () => {
      fetchInProgressRef.current = false;
    };

    if (mapMode === 'current') {
      // Current events: always fetch global recent data (last 14 days, active events)
      const worldBbox = '-180,85,180,-85';
      const focus = focusEventRef.current;
      if (focus) focusEventRef.current = null;
      fetch(`${API_BASE}/eonet?bbox=${encodeURIComponent(worldBbox)}&status=open&days=14`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('EONET failed'))))
        .then((geojson) => addOverlay(map, geojson, overlaysRef, false, focus))
        .catch((e) => console.error('EONET overlay error:', e))
        .finally(done);
    } else {
      // Seasonal predictions: fetch 5 years of historical data, cluster by location+category
      const worldBbox = '-180,85,180,-85';
      const eonetReqs = [];
      const usgsReqs = [];
      for (let y = 0; y < PREDICTION_YEARS; y++) {
        const { start, end } = getSeasonDateRange(seasonFilter, y);
        eonetReqs.push(
          fetch(
            `${API_BASE}/eonet?bbox=${encodeURIComponent(worldBbox)}&status=closed&start=${start}&end=${end}`
          ).then((r) => r.json())
        );
        usgsReqs.push(
          fetch(
            `${API_BASE}/earthquakes?bbox=${encodeURIComponent(worldBbox)}&start=${start}&end=${end}`
          ).then((r) => r.json())
        );
      }
      Promise.all([...eonetReqs, ...usgsReqs])
        .then((results) => {
          const eonetAll = results.slice(0, PREDICTION_YEARS) as { features?: EONETFeature[] }[];
          const usgsAll = results.slice(PREDICTION_YEARS) as { features?: { geometry?: { coordinates?: number[] }; properties?: { mag?: number; place?: string } }[] }[];
          const eonetFeatures: EONETFeature[] = [];
          for (const data of eonetAll) {
            for (const f of data.features || []) {
              const closed = f.properties?.closed;
              const month = closed ? new Date(closed).getMonth() + 1 : 0;
              if (monthInSeason(month, seasonFilter)) eonetFeatures.push(f);
            }
          }
          const usgsFeatures: { geometry?: { coordinates?: number[] }; properties?: { mag?: number; place?: string } }[] = [];
          for (const data of usgsAll) {
            for (const f of data.features || []) {
              const time = f.properties?.time;
              const month = time ? new Date(time).getMonth() + 1 : 0;
              if (monthInSeason(month, seasonFilter)) usgsFeatures.push(f);
            }
          }
          const predictions = buildPredictionFeatures(eonetFeatures, usgsFeatures, seasonFilter);
          addOverlay(map, { features: predictions }, overlaysRef, true);
        })
        .catch((e) => console.error('Prediction overlay error:', e))
        .finally(done);
    }
  }, [mapMode, seasonFilter]);

  useEffect(() => {
    fetchData();
  }, [mapMode, seasonFilter, fetchData]);

  const onMapLoad = useCallback(
    (map: google.maps.Map) => {
      mapRef.current = map;
      // Fetch once on load — no refetch on pan/zoom so markers stay consistent
      setTimeout(fetchData, 500);
      // Hide country names until zoomed in
      const updateLabelVisibility = () => {
        const zoom = map.getZoom() ?? 0;
        const hideLabels = zoom < ZOOM_SHOW_COUNTRY_LABELS;
        map.setOptions({
          styles: hideLabels ? [...BASE_MAP_STYLES, HIDE_COUNTRY_LABELS_STYLE] : BASE_MAP_STYLES,
        });
      };
      updateLabelVisibility();
      map.addListener('zoom_changed', updateLabelVisibility);
    },
    [fetchData]
  );

  const onMapUnmount = useCallback(() => {
    mapRef.current = null;
    overlaysRef.current.forEach((o) => {
      if (o instanceof google.maps.InfoWindow) o.close();
      else o.setMap(null);
    });
    overlaysRef.current = [];
  }, []);

  if (loadError) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
          <p className="font-medium text-destructive">Failed to load Google Maps</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {!apiKey
              ? 'Add your Google Maps API key to .env as VITE_GOOGLE_MAPS_API_KEY'
              : 'Check your API key and ensure Maps JavaScript API is enabled.'}
          </p>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <div className="text-muted-foreground">Loading map...</div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-row w-full">
      <div className="w-3/4 h-full relative flex-shrink-0">
        <div className="absolute top-4 left-4 z-[1000] flex flex-wrap gap-2">
          <div className="flex rounded border border-border bg-card/90 backdrop-blur-md p-1">
            <button
              onClick={() => setMapMode('current')}
              className={cn(
                'px-3 py-1.5 text-xs font-medium transition-colors rounded',
                mapMode === 'current' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
              )}
            >
              Current Events
            </button>
            <button
              onClick={() => setMapMode('predictions')}
              className={cn(
                'px-3 py-1.5 text-xs font-medium transition-colors rounded',
                mapMode === 'predictions' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
              )}
            >
              Seasonal Predictions
            </button>
          </div>
          {mapMode === 'predictions' && (
            <div className="flex rounded border border-border bg-card/90 backdrop-blur-md p-1 gap-0.5">
              {(['Spring', 'Summer', 'Fall', 'Winter'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSeasonFilter(s)}
                  className={cn(
                    'px-2 py-1.5 text-xs font-medium transition-colors rounded',
                    seasonFilter === s ? 'bg-indigo-600 text-white' : 'text-muted-foreground hover:bg-muted'
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="absolute top-14 left-4 z-[1000] px-3 py-2 rounded bg-card/90 backdrop-blur-md border border-border text-xs text-muted-foreground max-w-xs">
          {mapMode === 'current'
            ? 'NASA EONET — Active events happening now (last 14 days). Click markers for details.'
            : `Predicted risk areas for ${seasonFilter} — based on where similar disasters have occurred in past ${seasonFilter}s. Click markers for details.`}
        </div>
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          center={defaultCenter}
          zoom={2}
          onLoad={onMapLoad}
          onUnmount={onMapUnmount}
          options={{
            zoomControl: true,
            mapTypeControl: true,
            scaleControl: true,
            streetViewControl: true,
            rotateControl: true,
            fullscreenControl: true,
            styles: [...BASE_MAP_STYLES, HIDE_COUNTRY_LABELS_STYLE],
          }}
        />
      </div>
      <div className="w-1/4 h-full flex-shrink-0 bg-background" />
    </div>
  );
}
