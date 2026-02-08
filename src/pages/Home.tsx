import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Menu, ExternalLink, Loader2 } from 'lucide-react';
import harborLogo from '@/assets/harbor-logo.png';
import { motion, AnimatePresence } from 'framer-motion';
import { HeroVideoCarousel } from '@/components/HeroVideoCarousel';
import { useState, useRef, useCallback, useEffect } from 'react';
import { fetchHeadlines } from '@/lib/api';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from '@/integrations/supabase/client';
import { captureGlobe } from '@/lib/globeTransition';

type HeadlineArticle = {
  url: string;
  title: string;
  source: string;
  publishedAt?: string | null;
  image?: string | null;
  disasterTitle?: string;
  disasterCategory?: string;
};

const SIDEBAR_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/map', label: 'Disaster Map' },
  { to: '/news', label: 'Disaster News' },
];

const VIDEOS_PER_HEADLINE = 2;

const fade = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };

const SEASONS = ['Spring', 'Summer', 'Fall', 'Winter'] as const;
const SEASON_CYCLE_MS = 20_000;

const CATEGORY_COLORS: Record<string, string> = {
  severeStorms: '#0ea5e9',
  wildfires: '#ef4444',
  volcanoes: '#7c3aed',
  earthquakes: '#f59e0b',
  droughts: '#d97706',
  floods: '#06b6d4',
  landslides: '#78716c',
  seaLakeIce: '#22d3ee',
  snow: '#e0e7ff',
  temperatureExtremes: '#f97316',
};

const API_BASE = 'http://localhost:3001';

/* ── Home Globe ──────────────────────────────────────────────────── */

function HomeGlobe({ onSeasonChange }: { onSeasonChange: (s: string) => void }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const rafRef = useRef<number>(0);
  const seasonIdxRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    async function init() {
      let token: string | null = null;
      try {
        const { data, error } = await supabase.functions.invoke('mapbox-token');
        if (error) throw error;
        token = data?.token;
      } catch {
        return;
      }
      if (!token || cancelled || !containerRef.current) return;

      mapboxgl.accessToken = token;

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [0, 20],
        zoom: 1.3,
        projection: 'globe',
        interactive: false,
        attributionControl: false,
        preserveDrawingBuffer: true, // needed for canvas capture during transition
      });

      mapRef.current = map;

      map.on('style.load', () => {
        map.setFog({
          color: 'rgb(15, 15, 30)',
          'high-color': 'rgb(30, 60, 140)',
          'horizon-blend': 0.03,
          'space-color': 'rgb(5, 5, 15)',
          'star-intensity': 0,
        });
      });

      map.on('load', () => {
        map.addSource('seasonal-events', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });

        map.addLayer({
          id: 'seasonal-circles',
          type: 'circle',
          source: 'seasonal-events',
          paint: {
            'circle-radius': 5,
            'circle-color': [
              'match', ['get', 'categoryId'],
              ...Object.entries(CATEGORY_COLORS).flatMap(([k, v]) => [k, v]),
              '#64748b',
            ] as unknown as mapboxgl.ExpressionSpecification,
            'circle-opacity': 0.85,
            'circle-blur': 0.4,
            'circle-stroke-width': 0,
          },
        });

        map.addLayer({
          id: 'seasonal-glow',
          type: 'circle',
          source: 'seasonal-events',
          paint: {
            'circle-radius': 12,
            'circle-color': [
              'match', ['get', 'categoryId'],
              ...Object.entries(CATEGORY_COLORS).flatMap(([k, v]) => [k, v]),
              '#64748b',
            ] as unknown as mapboxgl.ExpressionSpecification,
            'circle-opacity': 0.2,
            'circle-blur': 1,
            'circle-stroke-width': 0,
          },
        });

        loadSeasonData(map, SEASONS[0].toLowerCase());

        let lastTime = performance.now();
        const DPS = 360 / 120;

        function rotate(now: number) {
          if (!map || cancelled) return;
          if (!document.hidden) {
            const dt = (now - lastTime) / 1000;
            const center = map.getCenter();
            center.lng -= DPS * dt;
            map.jumpTo({ center });
          }
          lastTime = now;
          rafRef.current = requestAnimationFrame(rotate);
        }
        rafRef.current = requestAnimationFrame(rotate);

        timerRef.current = setInterval(() => {
          if (cancelled) return;
          seasonIdxRef.current = (seasonIdxRef.current + 1) % SEASONS.length;
          const season = SEASONS[seasonIdxRef.current];
          onSeasonChange(season);
          loadSeasonData(map, season.toLowerCase());
        }, SEASON_CYCLE_MS);
      });
    }

    init();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGlobeClick = () => {
    // Attempt shared-element transition; fall back to normal nav
    if (outerRef.current && captureGlobe(outerRef.current)) {
      // Wait for the starfield iris to mostly close before route switch
      setTimeout(() => navigate('/map'), 650);
    } else {
      navigate('/map');
    }
  };

  return (
    <div
      ref={outerRef}
      onClick={handleGlobeClick}
      className="relative cursor-pointer group"
      style={{ width: 'min(42vh, 55vw)', height: 'min(42vh, 55vw)' }}
    >
      <div
        ref={containerRef}
        className="w-full h-full rounded-full overflow-hidden transition-transform duration-300 group-hover:scale-[1.02]"
        style={{ clipPath: 'circle(50% at 50% 50%)' }}
      />
      <div className="absolute inset-0 rounded-full border border-white/0 group-hover:border-white/15 transition-colors duration-300 pointer-events-none" />
    </div>
  );
}

async function loadSeasonData(map: mapboxgl.Map, season: string) {
  try {
    const res = await fetch(`${API_BASE}/api/seasonal-events?season=${season}`);
    if (!res.ok) return;
    const gj = await res.json();
    const src = map.getSource('seasonal-events') as mapboxgl.GeoJSONSource | undefined;
    if (src) src.setData(gj);
  } catch {
    // silent
  }
}

/* ── Page ─────────────────────────────────────────────────────────── */

export default function Home() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const videoChangeCountRef = useRef(0);
  const [headlines, setHeadlines] = useState<HeadlineArticle[]>([]);
  const [headlinesLoading, setHeadlinesLoading] = useState(true);
  const [currentSeason, setCurrentSeason] = useState('Spring');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setHeadlinesLoading(true);
        const data = await fetchHeadlines();
        if (!cancelled) setHeadlines(data.articles || []);
      } catch {
        if (!cancelled) setHeadlines([]);
      } finally {
        if (!cancelled) setHeadlinesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleVideoChange = useCallback(() => {
    videoChangeCountRef.current += 1;
    if (videoChangeCountRef.current % VIDEOS_PER_HEADLINE === 0) {
      setActiveIndex((prev) => (prev + 1) % Math.max(headlines.length, 1));
    }
  }, [headlines.length]);

  const carouselItems = headlines.slice(0, 8);
  const count = carouselItems.length || 1;

  const getIndex = (offset: number) =>
    (activeIndex + offset + count) % count;

  const positions = [
    { offset: -1, scale: 0.85, x: '-60%', z: 1, opacity: 0.5 },
    { offset: 0, scale: 1, x: '0%', z: 10, opacity: 1 },
    { offset: 1, scale: 0.85, x: '60%', z: 1, opacity: 0.5 },
  ];

  return (
    <div className="relative bg-black h-screen overflow-hidden flex flex-col">
      {/* Video Background */}
      <div className="absolute inset-0">
        <HeroVideoCarousel onVideoChange={handleVideoChange} />
        <div className="absolute inset-0 bg-black/50 z-[5]" />
      </div>

      {/* Logo — top left */}
      <Link to="/" className="fixed top-5 left-6 z-[60] flex items-center gap-2.5">
        <img src={harborLogo} alt="Harbor" className="h-8 w-8 object-contain" />
        <span className="font-heading text-lg font-bold text-white tracking-tight">Harbor</span>
      </Link>

      {/* Menu trigger — top right */}
      <div
        className="fixed top-4 right-6 z-[60]"
        onMouseEnter={() => setSidebarOpen(true)}
      >
        <div className="p-2 text-white/60 hover:text-white transition-colors cursor-pointer">
          <Menu className="h-6 w-6" />
        </div>
      </div>

      {/* ═══ Main layout: headlines top, globe bottom ═══ */}
      <div className="relative z-10 flex-1 flex flex-col pt-14">
        {/* ── Top half: Headlines ── */}
        <div className="flex-1 flex flex-col items-center justify-center px-4 min-h-0">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={fade}
            transition={{ duration: 0.6 }}
          >
            <Link to="/news" className="block">
              <h2 className="font-heading text-sm sm:text-base font-medium tracking-[0.2em] uppercase text-white/60 text-center mb-4 hover:text-white/80 transition-colors">
                Live Natural Disaster News
              </h2>
            </Link>
          </motion.div>

          {headlinesLoading ? (
            <div className="flex items-center justify-center gap-2 text-white/50 py-8">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-xs">Loading headlines…</span>
            </div>
          ) : carouselItems.length === 0 ? (
            <p className="text-center text-white/40 text-xs py-8">No headlines available</p>
          ) : (
            <motion.div
              initial="hidden"
              animate="visible"
              variants={fade}
              transition={{ duration: 0.6, delay: 0.15 }}
              className="w-full"
            >
              <div className="relative h-40 max-w-3xl mx-auto">
                <AnimatePresence mode="popLayout">
                  {positions.map(({ offset, scale, x, z, opacity }) => {
                    const idx = getIndex(offset);
                    const item = carouselItems[idx];
                    if (!item) return null;
                    return (
                      <motion.div
                        key={`${idx}-${offset}`}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity, scale, x, zIndex: z }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.8, ease: 'easeInOut' }}
                        className="absolute top-0 left-1/2 w-[260px] sm:w-[320px] -ml-[130px] sm:-ml-[160px]"
                      >
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`block h-36 border border-white/15 backdrop-blur-sm flex flex-col justify-end p-4 transition-colors cursor-pointer group overflow-hidden ${
                            offset === 0
                              ? 'bg-white/10 hover:bg-white/15'
                              : 'bg-white/5 pointer-events-none'
                          }`}
                        >
                          {item.disasterCategory && (
                            <span className="text-[9px] tracking-[0.15em] uppercase text-red-400/70 mb-0.5">
                              {item.disasterCategory}{item.disasterTitle ? ` — ${item.disasterTitle}` : ''}
                            </span>
                          )}
                          <span className="text-[9px] tracking-[0.2em] uppercase text-white/35 mb-1.5">
                            {item.source}
                          </span>
                          <h3 className="font-heading text-sm sm:text-base font-semibold text-white mb-0.5 line-clamp-2 leading-tight">
                            {item.title}
                          </h3>
                          {offset === 0 && (
                            <span className="text-[10px] text-white/40 flex items-center gap-1 mt-0.5">
                              <ExternalLink className="h-2.5 w-2.5" /> Read article
                            </span>
                          )}
                        </a>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>

              {/* Arrows + Dots */}
              <div className="flex items-center justify-center gap-3 mt-3">
                <button
                  onClick={() => setActiveIndex((prev) => (prev - 1 + count) % count)}
                  className="p-1.5 text-white/50 hover:text-white transition-colors"
                  aria-label="Previous headline"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="flex gap-1.5">
                  {carouselItems.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveIndex(i)}
                      className={`w-1.5 h-1.5 transition-colors ${
                        i === activeIndex ? 'bg-white' : 'bg-white/25'
                      }`}
                    />
                  ))}
                </div>
                <button
                  onClick={() => setActiveIndex((prev) => (prev + 1) % count)}
                  className="p-1.5 text-white/50 hover:text-white transition-colors"
                  aria-label="Next headline"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          )}
        </div>

        {/* ── Bottom half: Globe ── */}
        <div className="flex flex-col items-center shrink-0 pb-2">
          {/* Prominent CTA above globe */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="flex flex-col items-center mb-3"
          >
            <span className="text-xs tracking-[0.15em] uppercase text-white/50 font-medium mb-1">
              {currentSeason}
            </span>
            <motion.p
              animate={{ opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
              className="text-sm sm:text-base font-heading font-semibold tracking-wide text-white/80"
            >
              Tap the globe to explore the live map &darr;
            </motion.p>
          </motion.div>

          <HomeGlobe onSeasonChange={setCurrentSeason} />
        </div>
      </div>

      {/* Sidebar overlay + panel */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="fixed inset-0 bg-black/50 z-40"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="fixed top-0 right-0 h-full w-3/4 sm:w-1/4 min-w-[260px] bg-black/85 backdrop-blur-xl border-l border-white/10 z-50 flex flex-col"
            >
              <div className="flex items-center p-6 border-b border-white/10">
                <span className="font-heading text-sm tracking-[0.15em] uppercase text-white/50">Menu</span>
              </div>
              <nav className="flex-1 p-4 space-y-1">
                {SIDEBAR_LINKS.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    onClick={() => setSidebarOpen(false)}
                    className="block py-3.5 px-4 font-heading text-sm font-semibold tracking-[0.15em] uppercase text-white/60 hover:text-white hover:bg-white/5 transition-colors"
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
