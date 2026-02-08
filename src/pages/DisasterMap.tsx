import { useState, useRef, useCallback, useEffect } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { ChevronDown, Filter } from 'lucide-react';
import { fetchEonet, fetchEarthquakes, fetchEventNews } from '@/lib/disasterApi';
import ChatPanel, { type MapContext, type ToolCommand, type EventSummary, type UserLocation } from '@/components/disaster/ChatPanel';
import { aidResources, RESOURCE_TYPE_COLORS, RESOURCE_TYPE_LABELS, findNearbyResources, type AidResourceEntry } from '@/data/aidResources';
import * as globeTransition from '@/lib/globeTransition';

/* ── Season / prediction constants ────────────────────────────────────── */

const SEASON_MONTHS: Record<string, number[]> = {
  Spring: [3, 4, 5],
  Summer: [6, 7, 8],
  Fall: [9, 10, 11],
  Winter: [12, 1, 2],
};

function monthInSeason(month: number, season: string): boolean {
  return (SEASON_MONTHS[season] || []).includes(month);
}

function getSeasonDateRange(season: string, yearOffset = 0) {
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

const GRID_SIZE = 2;
const MIN_EVENTS_FOR_PREDICTION = 2;
const PREDICTION_YEARS = 5;

/* ── Types ────────────────────────────────────────────────────────────── */

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

/* ── Disaster category colours ────────────────────────────────────────── */

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

/* Mapbox data-driven style expressions for category colours */
function buildColorMatch(key: 'fill' | 'stroke') {
  const pairs: (string | string[])[] = ['match', ['get', 'categoryId']];
  for (const [cat, c] of Object.entries(DISASTER_COLORS)) {
    pairs.push(cat, c[key]);
  }
  pairs.push(key === 'fill' ? '#64748b' : '#475569'); // fallback
  return pairs as unknown as mapboxgl.ExpressionSpecification;
}
const FILL_EXPR = buildColorMatch('fill');
const STROKE_EXPR = buildColorMatch('stroke');

/* ── Prediction builder (unchanged logic) ─────────────────────────────── */

function buildPredictionFeatures(
  eonetFeatures: EONETFeature[],
  usgsFeatures: { geometry?: { coordinates?: number[] }; properties?: { mag?: number; place?: string } }[],
  season: string,
): PredictionFeature[] {
  type Cluster = { lats: number[]; lngs: number[]; count: number };
  const clusters = new Map<string, Cluster>();

  const addPoint = (lat: number, lng: number, catId: string) => {
    const gLat = Math.floor(lat / GRID_SIZE) * GRID_SIZE;
    const gLng = Math.floor(lng / GRID_SIZE) * GRID_SIZE;
    const key = `${catId}|${gLat}|${gLng}`;
    const c = clusters.get(key);
    if (c) { c.lats.push(lat); c.lngs.push(lng); c.count++; }
    else clusters.set(key, { lats: [lat], lngs: [lng], count: 1 });
  };

  for (const f of eonetFeatures) {
    const catId = f.properties?.categories?.[0]?.id || 'other';
    if (f.geometry?.type === 'Point' && f.geometry.coordinates) {
      const [lng, lat] = f.geometry.coordinates as number[];
      addPoint(lat, lng, catId);
    } else if (f.geometry?.type === 'Polygon' && f.geometry.coordinates) {
      const ring = f.geometry.coordinates[0] as [number, number][];
      const cLng = ring.reduce((s, [x]) => s + x, 0) / ring.length;
      const cLat = ring.reduce((s, [, y]) => s + y, 0) / ring.length;
      addPoint(cLat, cLng, catId);
    }
  }
  for (const f of usgsFeatures) {
    const coords = f.geometry?.coordinates;
    if (coords && coords.length >= 2) addPoint(coords[1], coords[0], 'earthquakes');
  }

  const yearEnd = new Date().getFullYear();
  const yearStart = yearEnd - PREDICTION_YEARS + 1;
  const yearRange = `${yearStart}\u2013${yearEnd}`;
  const predictions: PredictionFeature[] = [];

  clusters.forEach((c, key) => {
    if (c.count < MIN_EVENTS_FOR_PREDICTION) return;
    const [catId] = key.split('|');
    const avgLat = c.lats.reduce((a, b) => a + b, 0) / c.lats.length;
    const avgLng = c.lngs.reduce((a, b) => a + b, 0) / c.lngs.length;
    predictions.push({
      geometry: { type: 'Point', coordinates: [avgLng, avgLat] },
      properties: {
        categoryId: catId,
        categoryLabel: CATEGORY_LABELS[catId] || catId,
        season,
        count: c.count,
        yearRange,
      },
    });
  });
  return predictions;
}

/* ── Normalize features → Mapbox-compatible GeoJSON ───────────────────── */

function buildGeoJSON(
  raw: { features?: (EONETFeature | PredictionFeature)[] },
  isPrediction: boolean,
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];

  for (const f of raw.features || []) {
    if (isPrediction) {
      const pf = f as PredictionFeature;
      const p = pf.properties;
      features.push({
        type: 'Feature',
        geometry: pf.geometry,
        properties: {
          categoryId: p.categoryId,
          title: `Predicted ${p.categoryLabel} for ${p.season}`,
          extra: `We predict ${p.categoryLabel.toLowerCase()} in this area for ${p.season} because ${p.count} similar ${p.categoryLabel.toLowerCase()} occurred here in past ${p.season}s (${p.yearRange}).`,
          sourcesJson: '[]',
          isPrediction: true,
          lat: pf.geometry.coordinates[1],
          lon: pf.geometry.coordinates[0],
        },
      });
    } else {
      const ef = f as EONETFeature;
      const catId = ef.properties?.categories?.[0]?.id || 'other';
      const title = ef.properties?.title || 'Event';
      const sources = ef.properties?.sources || [];

      if (ef.geometry?.type === 'Point' && ef.geometry.coordinates) {
        const [lng, lat] = ef.geometry.coordinates as number[];
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lng, lat] },
          properties: { categoryId: catId, title, extra: '', sourcesJson: JSON.stringify(sources), isPrediction: false, lat, lon: lng },
        });
      } else if (ef.geometry?.type === 'Polygon' && ef.geometry.coordinates) {
        const ring = ef.geometry.coordinates[0] as [number, number][];
        const cLng = ring.reduce((s, [x]) => s + x, 0) / ring.length;
        const cLat = ring.reduce((s, [, y]) => s + y, 0) / ring.length;
        features.push({
          type: 'Feature',
          geometry: ef.geometry as GeoJSON.Geometry,
          properties: { categoryId: catId, title, extra: '', sourcesJson: JSON.stringify(sources), isPrediction: false, lat: cLat, lon: cLng },
        });
      }
    }
  }

  return { type: 'FeatureCollection', features };
}

/* ── Popup HTML ───────────────────────────────────────────────────────── */

function renderPopup(title: string, extra: string, sourceLinks: string, newsHtml: string) {
  return (
    `<div style="padding:10px 12px;min-width:260px;max-width:340px;font-family:system-ui,sans-serif;font-size:14px;line-height:1.5">` +
    `<strong style="color:#f8fafc">${title}</strong><br/>` +
    (extra ? `<span style="color:#94a3b8;font-size:12px">${extra}</span><br/>` : '') +
    (sourceLinks ? `<div style="margin-top:6px"><strong>Official links:</strong> ${sourceLinks}</div>` : '') +
    (newsHtml ? `<div style="margin-top:8px;border-top:1px solid #334155;padding-top:8px">${newsHtml}</div>` : '') +
    `</div>`
  );
}

/* ── Measure the actual Mapbox globe sphere on screen ─────────────────── */

/**
 * Uses map.project() to measure the rendered globe sphere's exact screen
 * position and diameter.  Works at any viewport / resolution / zoom.
 *
 * Method: project two points at ±DELTA° latitude from the camera center
 * (same longitude).  Their vertical span on screen equals
 *   2 × R_screen × sin(DELTA°)
 * which we invert to get R_screen.
 */
function measureGlobeRect(
  map: mapboxgl.Map,
  containerEl: HTMLElement,
): DOMRect {
  const containerRect = containerEl.getBoundingClientRect();
  const center = map.getCenter();
  const centerPx = map.project(center);

  const DELTA = 25; // degrees — safely inside [-90, 90] for any center
  const top = map.project([center.lng, center.lat + DELTA]);
  const bottom = map.project([center.lng, center.lat - DELTA]);
  const halfSpan = Math.abs(bottom.y - top.y) / 2;
  const globeRadius = halfSpan / Math.sin(DELTA * Math.PI / 180);
  const diameter = globeRadius * 2;

  // Return a square DOMRect in viewport coordinates, centered on the globe
  return new DOMRect(
    containerRect.left + centerPx.x - globeRadius,
    containerRect.top + centerPx.y - globeRadius,
    diameter,
    diameter,
  );
}

/* ── Auto-rotate settings ─────────────────────────────────────────────── */

const SECONDS_PER_REVOLUTION = 240;
const MAX_SPIN_ZOOM = 5;
const IDLE_RESUME_MS = 10_000;

/* ════════════════════════════════════════════════════════════════════════ */

type FocusEvent = { title: string; sources: { url?: string }[]; lat: number; lon: number; category?: string };

/* ── Aid resources → GeoJSON ──────────────────────────────────────── */

function aidResourcesToGeoJSON(resources?: AidResourceEntry[]): GeoJSON.FeatureCollection {
  const items = resources ?? aidResources;
  return {
    type: 'FeatureCollection',
    features: items.map((r) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [r.lon, r.lat] },
      properties: {
        id: r.id,
        name: r.name,
        type: r.type,
        description: r.description,
        address: r.address,
        phone: r.phone,
        website: r.website,
        disasterTypes: r.disasterTypes.join(', '),
      },
    })),
  };
}

/* ── Aid resource popup HTML ──────────────────────────────────────── */

function renderAidPopup(props: Record<string, any>): string {
  const typeLabel = RESOURCE_TYPE_LABELS[props.type as keyof typeof RESOURCE_TYPE_LABELS] || props.type;
  const color = RESOURCE_TYPE_COLORS[props.type as keyof typeof RESOURCE_TYPE_COLORS] || '#6b7280';
  let html =
    `<div style="padding:10px 12px;min-width:240px;max-width:320px;font-family:system-ui,sans-serif;font-size:13px;line-height:1.5">` +
    `<strong style="color:#f8fafc">${props.name}</strong><br/>` +
    `<span style="display:inline-block;margin:4px 0;padding:1px 8px;border-radius:9999px;font-size:11px;background:${color}30;color:${color}">${typeLabel}</span><br/>` +
    `<span style="color:#94a3b8;font-size:12px">${props.description}</span>`;
  if (props.address) html += `<br/><span style="color:#cbd5e1;font-size:12px">📍 ${props.address}</span>`;
  if (props.phone) html += `<br/><span style="color:#cbd5e1;font-size:12px">📞 ${props.phone}</span>`;
  if (props.website) html += `<br/><a href="${props.website}" target="_blank" rel="noopener" style="color:#60a5fa;font-size:12px">${props.website}</a>`;
  html += `</div>`;
  return html;
}

/* ── FEMA DRC constants ────────────────────────────────────────────── */

const FEMA_API_BASE = 'http://localhost:3001';
const FEMA_DRC_COLOR = '#f97316'; // orange

function renderFemaPopup(props: Record<string, any>): string {
  const statusColor = props.status === 'open' ? '#22c55e' : props.status === 'closed' ? '#ef4444' : '#6b7280';
  let html =
    `<div style="padding:10px 12px;min-width:240px;max-width:320px;font-family:system-ui,sans-serif;font-size:13px;line-height:1.5">` +
    `<strong style="color:#f8fafc">${props.name || 'FEMA Recovery Center'}</strong><br/>` +
    `<span style="display:inline-block;margin:4px 0;padding:1px 8px;border-radius:9999px;font-size:11px;background:${FEMA_DRC_COLOR}30;color:${FEMA_DRC_COLOR}">FEMA DRC</span> ` +
    `<span style="display:inline-block;padding:1px 8px;border-radius:9999px;font-size:11px;background:${statusColor}30;color:${statusColor}">${props.status || 'unknown'}</span>`;
  if (props.drcType) html += `<br/><span style="color:#94a3b8;font-size:12px">${props.drcType}</span>`;
  if (props.address) html += `<br/><span style="color:#cbd5e1;font-size:12px">📍 ${props.address}</span>`;
  if (props.hours) html += `<br/><span style="color:#cbd5e1;font-size:12px">🕐 ${props.hours}</span>`;
  if (props.notes) html += `<br/><span style="color:#94a3b8;font-size:11px;font-style:italic">${props.notes}</span>`;
  html += `<br/><a href="https://www.disasterassistance.gov" target="_blank" rel="noopener" style="color:#60a5fa;font-size:12px">FEMA Disaster Assistance</a>`;
  html += `<br/><span style="color:#64748b;font-size:10px">Source: FEMA OpenFEMA</span>`;
  html += `</div>`;
  return html;
}

async function fetchFemaGeoJSON(bbox?: string): Promise<GeoJSON.FeatureCollection> {
  const params = new URLSearchParams({ limit: '200' });
  if (bbox) params.set('bbox', bbox);
  const res = await fetch(`${FEMA_API_BASE}/api/fema/resources?${params}`);
  if (!res.ok) throw new Error(`FEMA API ${res.status}`);
  return res.json();
}

async function fetchFemaNearby(lat: number, lon: number, maxKm?: number, limit?: number) {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    maxKm: String(maxKm ?? 500),
    limit: String(limit ?? 10),
  });
  const res = await fetch(`${FEMA_API_BASE}/api/fema/nearby?${params}`);
  if (!res.ok) throw new Error(`FEMA nearby API ${res.status}`);
  return res.json();
}

export default function DisasterMap() {
  const [mapMode, setMapMode] = useState<'current' | 'predictions'>('current');
  const [seasonFilter, setSeasonFilter] = useState('Summer');
  const [mapError, setMapError] = useState<string | null>(null);
  const [selectedContext, setSelectedContext] = useState<MapContext | null>(null);
  const [activeEvents, setActiveEvents] = useState<EventSummary[]>([]);
  const [showAidResources, setShowAidResources] = useState(false);
  const [showFemaResources, setShowFemaResources] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);

  /* Globe transition: start invisible if transition is in-flight */
  const [mapVisible, setMapVisible] = useState(!(window as any).__globeTransition);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const mapReadyRef = useRef(false);
  const fetchInProgressRef = useRef(false);
  const focusEventRef = useRef<FocusEvent | null>(null);
  const eonetFeaturesRef = useRef<GeoJSON.Feature[]>([]);
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null);

  const femaDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* rotation refs */
  const userInteractingRef = useRef(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* keep latest state in refs so the stable fetchData can read them */
  const mapModeRef = useRef(mapMode);
  mapModeRef.current = mapMode;
  const seasonRef = useRef(seasonFilter);
  seasonRef.current = seasonFilter;

  /* ── Focus event from DisasterNews page ──────────────────────────── */
  useEffect(() => {
    try {
      const s = sessionStorage.getItem('disasterMapFocus');
      if (s) {
        const p = JSON.parse(s);
        focusEventRef.current = {
          title: p.title || 'Event',
          sources: p.sources || [],
          lat: parseFloat(p.lat) || 0,
          lon: parseFloat(p.lon) || 0,
          category: p.category,
        };
        sessionStorage.removeItem('disasterMapFocus');
      }
    } catch {
      focusEventRef.current = null;
    }
  }, []);

  /* ── Request user geolocation ──────────────────────────────────── */
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc: UserLocation = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        setUserLocation(loc);
        /* Set as default context if nothing else is selected */
        setSelectedContext((prev) => prev ?? { type: 'user_location', lat: loc.lat, lon: loc.lon });
      },
      (err) => console.warn('Geolocation denied or unavailable:', err.message),
      { enableHighAccuracy: false, timeout: 10000 },
    );
  }, []);

  /* ── Globe transition: safety timeout + unmount cleanup ────────── */
  useEffect(() => {
    if (!globeTransition.isActive()) return;
    // The actual morph is triggered from inside map.on('load') once we
    // can measure the real Mapbox globe.  This timeout is a safety net:
    // if the map hasn't loaded within 6 s, abort and show the page.
    const safetyTimer = setTimeout(() => {
      if (globeTransition.isActive()) {
        globeTransition.cleanup();
        setMapVisible(true);
      }
    }, 6000);
    return () => {
      clearTimeout(safetyTimer);
      if (globeTransition.isActive()) globeTransition.cleanup();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Fetch EONET / predictions and push into Mapbox source ───────── */
  const fetchData = useCallback(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current || fetchInProgressRef.current) return;
    fetchInProgressRef.current = true;
    const done = () => { fetchInProgressRef.current = false; };
    const mode = mapModeRef.current;
    const season = seasonRef.current;

    const applyGeoJSON = (gj: GeoJSON.FeatureCollection, isPrediction: boolean) => {
      const src = map.getSource('eonet-data') as mapboxgl.GeoJSONSource | undefined;
      if (src) src.setData(gj);
      map.setPaintProperty('eonet-fills', 'fill-opacity', isPrediction ? 0.15 : 0.25);
    };

    if (mode === 'current') {
      const focus = focusEventRef.current;
      if (focus) focusEventRef.current = null;

      fetchEonet({ bbox: '-180,85,180,-85', status: 'open', days: '14' })
        .then((raw) => {
          const gj = buildGeoJSON(raw, false);
          eonetFeaturesRef.current = gj.features;

          /* build deduplicated event list for chat context */
          const seen = new Set<string>();
          const evts: EventSummary[] = [];
          for (const f of gj.features) {
            const t = f.properties?.title;
            if (t && !seen.has(t)) {
              seen.add(t);
              evts.push({ title: t, category: f.properties?.categoryId || 'other', lat: Number(f.properties?.lat), lon: Number(f.properties?.lon) });
            }
            if (evts.length >= 25) break;
          }
          setActiveEvents(evts);

          applyGeoJSON(gj, false);

          if (focus) {
            map.flyTo({ center: [focus.lon, focus.lat], zoom: 6, duration: 1500 });
            setTimeout(() => {
              const srcLinks = (focus.sources || [])
                .filter((s) => s.url)
                .map((s) => `<a href="${s.url}" target="_blank" rel="noopener" style="color:#60a5fa">Source</a>`)
                .join(' ');
              if (popupRef.current) popupRef.current.remove();
              const popup = new mapboxgl.Popup({ offset: 10, maxWidth: '360px', className: 'dark-popup' })
                .setLngLat([focus.lon, focus.lat])
                .setHTML(renderPopup(focus.title, '', srcLinks, '<span style="color:#94a3b8;font-size:12px">Fetching news\u2026</span>'))
                .addTo(map);
              popupRef.current = popup;

              fetchEventNews({ title: focus.title, lat: focus.lat, lon: focus.lon, days: 3, categoryId: focus.category || 'other' })
                .then((data) => {
                  const arts = data.articles || [];
                  if (!arts.length) { popup.setHTML(renderPopup(focus.title, '', srcLinks, '')); return; }
                  const list = arts.slice(0, 8).map((a: any) =>
                    `<a href="${a.url}" target="_blank" rel="noopener" style="color:#60a5fa;font-size:12px;display:block;margin:4px 0">${(a.title || 'Article').slice(0, 60)}\u2026</a>`
                  ).join('');
                  popup.setHTML(renderPopup(focus.title, '', srcLinks, `<strong>Related News</strong> (${arts.length}):<br/>${list}`));
                })
                .catch(() => popup.setHTML(renderPopup(focus.title, '', srcLinks, '')));
            }, 1600);
          }
        })
        .catch((e) => console.error('EONET overlay error:', e))
        .finally(done);
    } else {
      /* Seasonal predictions */
      const worldBbox = '-180,85,180,-85';
      const eonetReqs = [];
      const usgsReqs = [];
      for (let y = 0; y < PREDICTION_YEARS; y++) {
        const { start, end } = getSeasonDateRange(season, y);
        eonetReqs.push(fetchEonet({ bbox: worldBbox, status: 'closed', start, end }));
        usgsReqs.push(fetchEarthquakes({ bbox: worldBbox, start, end }));
      }

      Promise.all([...eonetReqs, ...usgsReqs])
        .then((results) => {
          const eonetAll = results.slice(0, PREDICTION_YEARS) as { features?: EONETFeature[] }[];
          const usgsAll = results.slice(PREDICTION_YEARS) as { features?: any[] }[];
          const eonetFeatures: EONETFeature[] = [];
          for (const data of eonetAll)
            for (const f of data.features || []) {
              const month = f.properties?.closed ? new Date(f.properties.closed).getMonth() + 1 : 0;
              if (monthInSeason(month, season)) eonetFeatures.push(f);
            }
          const usgsFeatures: any[] = [];
          for (const data of usgsAll)
            for (const f of data.features || []) {
              const month = f.properties?.time ? new Date(f.properties.time).getMonth() + 1 : 0;
              if (monthInSeason(month, season)) usgsFeatures.push(f);
            }
          const predictions = buildPredictionFeatures(eonetFeatures, usgsFeatures, season);
          applyGeoJSON(buildGeoJSON({ features: predictions }, true), true);
        })
        .catch((e) => console.error('Prediction overlay error:', e))
        .finally(done);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Handle tool commands from chat ──────────────────────────────── */
  const handleCommand = useCallback((cmd: ToolCommand) => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;

    switch (cmd.tool) {
      case 'map.flyTo': {
        const { lng, lat, zoom } = cmd.args;
        if (typeof lng !== 'number' || typeof lat !== 'number') break;
        map.flyTo({ center: [lng, lat], zoom: zoom ?? 5, duration: 2000 });
        setSelectedContext({ type: 'location', lat, lon: lng });
        break;
      }
      case 'resources.findNearby': {
        const { lat, lon, disasterType, maxKm } = cmd.args;
        if (typeof lat !== 'number' || typeof lon !== 'number') break;
        const results = findNearbyResources(lat, lon, { disasterType, maxKm });
        const matchIds = results.map((r) => r.id);

        /* Update source to show only matching resources */
        const filteredResources = aidResources.filter((r) => matchIds.includes(r.id));
        const src = map.getSource('aid-resources') as mapboxgl.GeoJSONSource | undefined;
        if (src) src.setData(aidResourcesToGeoJSON(filteredResources));

        /* Make layer visible */
        if (map.getLayer('aid-resource-circles')) {
          map.setLayoutProperty('aid-resource-circles', 'visibility', 'visible');
        }

        /* Fit bounds to show all results */
        if (filteredResources.length > 0) {
          const bounds = new mapboxgl.LngLatBounds();
          for (const r of filteredResources) bounds.extend([r.lon, r.lat]);
          bounds.extend([lon, lat]); // include search origin
          map.fitBounds(bounds, { padding: 80, maxZoom: 8, duration: 2000 });
        }
        break;
      }
      case 'resources.findNearbyFEMA': {
        const fLat = cmd.args.lat;
        const fLon = cmd.args.lon;
        if (typeof fLat !== 'number' || typeof fLon !== 'number') break;
        fetchFemaNearby(fLat, fLon, cmd.args.maxKm, cmd.args.limit)
          .then((data) => {
            const resources = data.resources || [];
            if (resources.length === 0) return;

            // Build GeoJSON from results and update source
            const gj: GeoJSON.FeatureCollection = {
              type: 'FeatureCollection',
              features: resources.map((r: any) => ({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
                properties: {
                  id: `fema-nearby-${r.lat}-${r.lon}`,
                  name: r.name,
                  address: r.address,
                  phone: r.phone,
                  hours: r.hours,
                  status: r.status,
                  drcType: r.drcType,
                  notes: r.notes,
                  source: 'FEMA OpenFEMA',
                },
              })),
            };
            const src = map.getSource('fema-resources') as mapboxgl.GeoJSONSource | undefined;
            if (src) src.setData(gj);

            // Make FEMA layer visible
            if (map.getLayer('fema-resource-circles')) {
              map.setLayoutProperty('fema-resource-circles', 'visibility', 'visible');
            }

            // Fit bounds to results
            const bounds = new mapboxgl.LngLatBounds();
            for (const r of resources) bounds.extend([r.lon, r.lat]);
            bounds.extend([fLon, fLat]);
            map.fitBounds(bounds, { padding: 80, maxZoom: 8, duration: 2000 });
          })
          .catch((err) => console.warn('FEMA nearby command error:', err));
        break;
      }
      case 'map.highlightEvent': {
        const { title } = cmd.args;
        if (!title) break;
        const needle = String(title).toLowerCase();
        const feature = eonetFeaturesRef.current.find((f) =>
          f.properties?.title?.toLowerCase() === needle ||
          f.properties?.title?.toLowerCase().includes(needle),
        );
        if (!feature) break;

        const lat = Number(feature.properties?.lat);
        const lon = Number(feature.properties?.lon);
        const eventTitle = feature.properties?.title || 'Event';
        const categoryId = feature.properties?.categoryId || 'other';
        let sources: { url?: string }[] = [];
        try { sources = JSON.parse(feature.properties?.sourcesJson || '[]'); } catch { /* empty */ }

        map.flyTo({ center: [lon, lat], zoom: 6, duration: 2000 });
        setSelectedContext({ type: 'event', lat, lon, title: eventTitle, category: categoryId, sources });

        /* after fly animation finishes, open popup with news */
        setTimeout(() => {
          if (popupRef.current) popupRef.current.remove();
          const srcLinks = sources
            .filter((s) => s.url)
            .map((s) => `<a href="${s.url}" target="_blank" rel="noopener" style="color:#60a5fa">Source</a>`)
            .join(' ');
          const popup = new mapboxgl.Popup({ offset: 10, maxWidth: '360px', className: 'dark-popup' })
            .setLngLat([lon, lat])
            .setHTML(renderPopup(eventTitle, '', srcLinks, '<span style="color:#94a3b8;font-size:12px">Fetching news\u2026</span>'))
            .addTo(map);
          popupRef.current = popup;

          fetchEventNews({ title: eventTitle, lat, lon, days: 3, categoryId })
            .then((data) => {
              const arts = data.articles || [];
              if (!arts.length) { popup.setHTML(renderPopup(eventTitle, '', srcLinks, '')); return; }
              const list = arts.slice(0, 8).map((a: any) =>
                `<a href="${a.url}" target="_blank" rel="noopener" style="color:#60a5fa;font-size:12px;display:block;margin:4px 0">${(a.title || 'Article').slice(0, 60)}\u2026</a>`
              ).join('');
              popup.setHTML(renderPopup(eventTitle, '', srcLinks, `<strong>Related News</strong> (${arts.length}):<br/>${list}`));
            })
            .catch(() => popup.setHTML(renderPopup(eventTitle, '', srcLinks, '')));
        }, 2200);
        break;
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Initialize Mapbox GL map (runs once) ────────────────────────── */
  useEffect(() => {
    let cancelled = false;

    async function initMap() {
      /* Fetch Mapbox token from backend */
      let token: string | null = null;
      try {
        const { data, error } = await supabase.functions.invoke('mapbox-token');
        if (error) throw error;
        token = data?.token;
      } catch (e) {
        console.error('Mapbox token fetch error:', e);
        if (!cancelled) {
          setMapError('Failed to load Mapbox token from backend.');
          if (globeTransition.isActive()) { globeTransition.cleanup(); setMapVisible(true); }
        }
        return;
      }

      if (!token) {
        if (!cancelled) {
          setMapError('Mapbox token not configured in backend.');
          if (globeTransition.isActive()) { globeTransition.cleanup(); setMapVisible(true); }
        }
        return;
      }
      if (cancelled || !containerRef.current) return;

      mapboxgl.accessToken = token;

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [0, 20],
        zoom: 1.5,
        projection: 'globe',
      });

    map.addControl(new mapboxgl.NavigationControl(), 'bottom-right');

    /* ── Globe atmosphere ──────────────────────────────────────────── */
    map.on('style.load', () => {
      map.setFog({
        color: 'rgb(186, 210, 235)',
        'high-color': 'rgb(36, 92, 223)',
        'horizon-blend': 0.02,
        'space-color': 'rgb(11, 11, 25)',
        'star-intensity': 0.6,
      });
    });

    /* ── Sources & layers ──────────────────────────────────────────── */
    map.on('load', () => {
      map.addSource('eonet-data', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      /* polygon fills */
      map.addLayer({
        id: 'eonet-fills',
        type: 'fill',
        source: 'eonet-data',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': FILL_EXPR, 'fill-opacity': 0.25 },
      });

      /* polygon outlines */
      map.addLayer({
        id: 'eonet-outlines',
        type: 'line',
        source: 'eonet-data',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'line-color': STROKE_EXPR, 'line-width': 1 },
      });

      /* point circles */
      map.addLayer({
        id: 'eonet-circles',
        type: 'circle',
        source: 'eonet-data',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 7,
          'circle-color': FILL_EXPR,
          'circle-opacity': 0.9,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': STROKE_EXPR,
        },
      });

      /* ── Aid resources source + layer ─────────────────────────────── */
      map.addSource('aid-resources', {
        type: 'geojson',
        data: aidResourcesToGeoJSON(),
      });

      map.addLayer({
        id: 'aid-resource-circles',
        type: 'circle',
        source: 'aid-resources',
        paint: {
          'circle-radius': 8,
          'circle-color': [
            'match', ['get', 'type'],
            'shelter', RESOURCE_TYPE_COLORS.shelter,
            'medical', RESOURCE_TYPE_COLORS.medical,
            'food', RESOURCE_TYPE_COLORS.food,
            'evacuation_center', RESOURCE_TYPE_COLORS.evacuation_center,
            'supply_distribution', RESOURCE_TYPE_COLORS.supply_distribution,
            'general_help', RESOURCE_TYPE_COLORS.general_help,
            '#6b7280',
          ] as unknown as mapboxgl.ExpressionSpecification,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
        layout: { visibility: 'none' },
      });

      /* Aid resource click → popup */
      map.on('click', 'aid-resource-circles', (e) => {
        const feat = e.features?.[0];
        if (!feat?.properties) return;
        if (popupRef.current) popupRef.current.remove();
        const popup = new mapboxgl.Popup({ offset: 10, maxWidth: '340px', className: 'dark-popup' })
          .setLngLat(e.lngLat)
          .setHTML(renderAidPopup(feat.properties))
          .addTo(map);
        popupRef.current = popup;
      });

      /* Aid resource hover cursor */
      map.on('mouseenter', 'aid-resource-circles', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'aid-resource-circles', () => { map.getCanvas().style.cursor = ''; });

      /* ── FEMA DRC source + layer ────────────────────────────────── */
      map.addSource('fema-resources', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'fema-resource-circles',
        type: 'circle',
        source: 'fema-resources',
        paint: {
          'circle-radius': 7,
          'circle-color': FEMA_DRC_COLOR,
          'circle-opacity': 0.9,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
        layout: { visibility: 'none' },
      });

      /* FEMA click → popup */
      map.on('click', 'fema-resource-circles', (e) => {
        const feat = e.features?.[0];
        if (!feat?.properties) return;
        if (popupRef.current) popupRef.current.remove();
        const popup = new mapboxgl.Popup({ offset: 10, maxWidth: '340px', className: 'dark-popup' })
          .setLngLat(e.lngLat)
          .setHTML(renderFemaPopup(feat.properties))
          .addTo(map);
        popupRef.current = popup;
      });

      map.on('mouseenter', 'fema-resource-circles', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'fema-resource-circles', () => { map.getCanvas().style.cursor = ''; });

      /* Debounced FEMA data fetch on viewport change */
      const loadFemaForViewport = () => {
        if (map.getLayoutProperty('fema-resource-circles', 'visibility') !== 'visible') return;
        if (femaDebounceRef.current) clearTimeout(femaDebounceRef.current);
        femaDebounceRef.current = setTimeout(() => {
          const bounds = map.getBounds();
          const bbox = `${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()},${bounds.getSouth()}`;
          fetchFemaGeoJSON(bbox)
            .then((gj) => {
              const src = map.getSource('fema-resources') as mapboxgl.GeoJSONSource | undefined;
              if (src) src.setData(gj);
            })
            .catch((err) => console.warn('FEMA fetch error:', err));
        }, 800);
      };
      map.on('moveend', loadFemaForViewport);
      map.on('idle', loadFemaForViewport);

      /* ── Click → popup ───────────────────────────────────────────── */
      const handleClick = (e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) => {
        const feat = e.features?.[0];
        if (!feat?.properties) return;
        const p = feat.properties;
        const coords = e.lngLat;
        const title = p.title || 'Event';
        const extra = p.extra || '';
        const isPred = p.isPrediction === true || p.isPrediction === 'true';
        let sources: { url?: string }[] = [];
        try { sources = JSON.parse(p.sourcesJson || '[]'); } catch { /* empty */ }
        const lat = Number(p.lat);
        const lon = Number(p.lon);
        const categoryId = p.categoryId;

        setSelectedContext({
          type: 'event',
          lat,
          lon,
          title,
          category: categoryId || undefined,
          sources,
        });

        const srcLinks = !isPred
          ? sources.filter((s) => s.url).map((s) => `<a href="${s.url}" target="_blank" rel="noopener" style="color:#60a5fa">Source</a>`).join(' ')
          : '';

        if (popupRef.current) popupRef.current.remove();
        const popup = new mapboxgl.Popup({ offset: 10, maxWidth: '360px', className: 'dark-popup' })
          .setLngLat(coords)
          .setHTML(renderPopup(title, extra, srcLinks, isPred ? '' : '<span style="color:#94a3b8;font-size:12px">Fetching news\u2026</span>'))
          .addTo(map);
        popupRef.current = popup;

        if (!isPred && lat && lon) {
          fetchEventNews({ title, lat, lon, days: 3, categoryId: categoryId || 'other' })
            .then((data) => {
              const arts = data.articles || [];
              if (!arts.length) { popup.setHTML(renderPopup(title, extra, srcLinks, '')); return; }
              const list = arts.slice(0, 8).map((a: any) =>
                `<a href="${a.url}" target="_blank" rel="noopener" style="color:#60a5fa;font-size:12px;display:block;margin:4px 0">${(a.title || 'Article').slice(0, 60)}\u2026</a>`
              ).join('');
              popup.setHTML(renderPopup(title, extra, srcLinks, `<strong>Related News</strong> (${arts.length}):<br/>${list}`));
            })
            .catch(() => popup.setHTML(renderPopup(title, extra, srcLinks, '')));
        }
      };

      map.on('click', 'eonet-circles', handleClick);
      map.on('click', 'eonet-fills', handleClick);

      /* pointer cursor on hover */
      for (const layer of ['eonet-circles', 'eonet-fills'] as const) {
        map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
      }

      /* General map click → set location context */
      map.on('click', (e) => {
        const layers = ['eonet-circles', 'eonet-fills'];
        if (map.getLayer('aid-resource-circles')) layers.push('aid-resource-circles');
        if (map.getLayer('fema-resource-circles')) layers.push('fema-resource-circles');
        const features = map.queryRenderedFeatures(e.point, { layers });
        if (features.length > 0) return;
        setSelectedContext({ type: 'location', lat: e.lngLat.lat, lon: e.lngLat.lng });
      });

      /* mark ready & load initial data */
      mapRef.current = map;
      mapReadyRef.current = true;

      /* ── Globe transition: measure real globe and start morph ─────── */
      if (globeTransition.isActive() && containerRef.current) {
        const globeRect = measureGlobeRect(map, containerRef.current);
        globeTransition.morphToTarget(
          globeRect,
          () => setMapVisible(true),
          () => {},
        );
      }

      fetchData();

      /* start auto-rotate */
      spinGlobe();
    });

    /* ── Auto-rotate ───────────────────────────────────────────────── */
    function spinGlobe() {
      if (userInteractingRef.current || !map) return;
      const zoom = map.getZoom();
      if (zoom >= MAX_SPIN_ZOOM) return;
      const dps = 360 / SECONDS_PER_REVOLUTION;
      const center = map.getCenter();
      center.lng -= dps;
      map.easeTo({ center, duration: 1000, easing: (n) => n });
    }

    map.on('moveend', () => {
      if (!userInteractingRef.current) spinGlobe();
    });

    const pauseRotation = () => {
      userInteractingRef.current = true;
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
    const scheduleResume = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        userInteractingRef.current = false;
        spinGlobe();
      }, IDLE_RESUME_MS);
    };

    map.on('mousedown', pauseRotation);
    map.on('touchstart', pauseRotation);
    map.on('mouseup', scheduleResume);
    map.on('touchend', scheduleResume);
    map.on('dragend', scheduleResume);
    map.on('wheel', () => { pauseRotation(); scheduleResume(); });
    map.on('zoomstart', pauseRotation);
    map.on('zoomend', scheduleResume);

    } // end initMap

    initMap();

    return () => {
      cancelled = true;
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (userMarkerRef.current) { userMarkerRef.current.remove(); userMarkerRef.current = null; }
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        mapReadyRef.current = false;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── User location marker (pulsing blue dot) ────────────────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!userLocation || !map || !mapReadyRef.current) return;

    /* Build a pulsing dot element */
    if (!userMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'user-location-marker';
      el.style.cssText = `
        width: 18px; height: 18px; border-radius: 50%;
        background: radial-gradient(circle, #3b82f6 40%, transparent 70%);
        border: 2.5px solid #ffffff;
        box-shadow: 0 0 0 0 rgba(59,130,246,0.5);
        animation: user-loc-pulse 2s ease-out infinite;
        cursor: pointer;
      `;
      /* Add keyframe animation once */
      if (!document.getElementById('user-loc-pulse-style')) {
        const style = document.createElement('style');
        style.id = 'user-loc-pulse-style';
        style.textContent = `@keyframes user-loc-pulse { 0% { box-shadow: 0 0 0 0 rgba(59,130,246,0.5); } 70% { box-shadow: 0 0 0 14px rgba(59,130,246,0); } 100% { box-shadow: 0 0 0 0 rgba(59,130,246,0); } }`;
        document.head.appendChild(style);
      }

      el.addEventListener('click', () => {
        setSelectedContext({ type: 'user_location', lat: userLocation.lat, lon: userLocation.lon });
      });

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([userLocation.lon, userLocation.lat])
        .addTo(map);
      userMarkerRef.current = marker;

      /* Fly to user location if no focus event was set */
      if (!focusEventRef.current) {
        map.flyTo({ center: [userLocation.lon, userLocation.lat], zoom: 5, duration: 2500 });
      }
    } else {
      userMarkerRef.current.setLngLat([userLocation.lon, userLocation.lat]);
    }
  }, [userLocation]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Re-fetch when mode / season changes ─────────────────────────── */
  useEffect(() => {
    fetchData();
  }, [mapMode, seasonFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Error state ─────────────────────────────────────────────────── */
  if (mapError) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
          <p className="font-medium text-destructive">Failed to load map</p>
          <p className="mt-2 text-sm text-muted-foreground">{mapError}</p>
        </div>
      </div>
    );
  }

  /* ── Render ──────────────────────────────────────────────────────── */
  return (
    <div
      className="h-[calc(100vh-4rem)] flex flex-row w-full"
      style={{
        opacity: mapVisible ? 1 : 0,
        transition: mapVisible ? 'opacity 0.5s ease-out' : 'none',
      }}
    >
      <div className="flex-1 h-full relative min-w-0">
        {/* Click-away backdrop for filters */}
        {filtersOpen && (
          <div className="fixed inset-0 z-[999]" onClick={() => setFiltersOpen(false)} />
        )}

        {/* Filters dropdown */}
        <div className="absolute top-4 left-4 z-[1000] select-none">
          <button
            onClick={() => setFiltersOpen((f) => !f)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-wider bg-card/95 backdrop-blur-md border border-border transition-colors',
              filtersOpen ? 'text-foreground border-primary/50' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Filter className="h-3.5 w-3.5" />
            Filters
            {[showAidResources, showFemaResources].filter(Boolean).length > 0 && (
              <span className="flex items-center justify-center h-4 min-w-[16px] px-1 text-[9px] font-bold bg-primary text-primary-foreground">
                {[showAidResources, showFemaResources].filter(Boolean).length}
              </span>
            )}
            <ChevronDown className={cn('h-3 w-3 transition-transform duration-200', filtersOpen && 'rotate-180')} />
          </button>

          {filtersOpen && (
            <div className="mt-px bg-card/95 backdrop-blur-md border border-border border-t-0 min-w-[220px]">
              {/* Map Mode */}
              <div className="px-3 pt-3 pb-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Map Mode</span>
              </div>
              <div className="px-1.5 pb-2 space-y-px">
                <button
                  onClick={() => setMapMode('current')}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-2.5 py-1.5 text-xs transition-colors text-left',
                    mapMode === 'current' ? 'text-foreground bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 shrink-0', mapMode === 'current' ? 'bg-primary' : 'bg-muted-foreground/30')} />
                  Current Events
                </button>
                <button
                  onClick={() => setMapMode('predictions')}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-2.5 py-1.5 text-xs transition-colors text-left',
                    mapMode === 'predictions' ? 'text-foreground bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 shrink-0', mapMode === 'predictions' ? 'bg-primary' : 'bg-muted-foreground/30')} />
                  Seasonal Predictions
                </button>
              </div>

              {/* Season picker */}
              {mapMode === 'predictions' && (
                <>
                  <div className="border-t border-border/50" />
                  <div className="px-3 pt-2.5 pb-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Season</span>
                  </div>
                  <div className="px-1.5 pb-2 grid grid-cols-2 gap-px">
                    {(['Spring', 'Summer', 'Fall', 'Winter'] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => setSeasonFilter(s)}
                        className={cn(
                          'px-2.5 py-1.5 text-xs font-medium transition-colors text-center',
                          seasonFilter === s ? 'bg-indigo-500/20 text-indigo-400' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* Layers */}
              <div className="border-t border-border/50" />
              <div className="px-3 pt-2.5 pb-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Layers</span>
              </div>
              <div className="px-1.5 pb-3 space-y-px">
                <button
                  onClick={() => {
                    const next = !showAidResources;
                    setShowAidResources(next);
                    const map = mapRef.current;
                    if (map?.getLayer('aid-resource-circles')) {
                      map.setLayoutProperty('aid-resource-circles', 'visibility', next ? 'visible' : 'none');
                      if (next) {
                        const src = map.getSource('aid-resources') as mapboxgl.GeoJSONSource | undefined;
                        if (src) src.setData(aidResourcesToGeoJSON());
                      }
                    }
                  }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-2.5 py-1.5 text-xs transition-colors text-left',
                    showAidResources ? 'text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                  )}
                >
                  <span className={cn(
                    'h-3 w-3 shrink-0 border flex items-center justify-center',
                    showAidResources ? 'border-emerald-500 bg-emerald-500' : 'border-muted-foreground/30',
                  )} />
                  Aid Resources
                </button>
                <button
                  onClick={() => {
                    const next = !showFemaResources;
                    setShowFemaResources(next);
                    const map = mapRef.current;
                    if (map?.getLayer('fema-resource-circles')) {
                      map.setLayoutProperty('fema-resource-circles', 'visibility', next ? 'visible' : 'none');
                      if (next) {
                        const bounds = map.getBounds();
                        const bbox = `${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()},${bounds.getSouth()}`;
                        fetchFemaGeoJSON(bbox)
                          .then((gj) => {
                            const src = map.getSource('fema-resources') as mapboxgl.GeoJSONSource | undefined;
                            if (src) src.setData(gj);
                          })
                          .catch((err) => console.warn('FEMA fetch error:', err));
                      }
                    }
                  }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-2.5 py-1.5 text-xs transition-colors text-left',
                    showFemaResources ? 'text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                  )}
                >
                  <span className={cn(
                    'h-3 w-3 shrink-0 border flex items-center justify-center',
                    showFemaResources ? 'border-orange-500 bg-orange-500' : 'border-muted-foreground/30',
                  )} />
                  FEMA Centers
                </button>
              </div>
            </div>
          )}
        </div>


        {/* Mapbox GL container */}
        <div ref={containerRef} className="w-full h-full" />
      </div>
      <ChatPanel
        selectedContext={selectedContext}
        onClearContext={() => {
          /* Fall back to user location context instead of null */
          if (userLocation) {
            setSelectedContext({ type: 'user_location', lat: userLocation.lat, lon: userLocation.lon });
          } else {
            setSelectedContext(null);
          }
        }}
        onCommand={handleCommand}
        activeEvents={activeEvents}
        userLocation={userLocation}
      />
    </div>
  );
}
