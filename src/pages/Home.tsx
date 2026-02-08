import { Link } from 'react-router-dom';
import { MapPin, ChevronLeft, ChevronRight, Menu, ExternalLink, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { HeroVideoCarousel } from '@/components/HeroVideoCarousel';
import { useState, useRef, useCallback, useEffect } from 'react';
import { fetchHeadlines } from '@/lib/api';

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
  { to: '/trends', label: 'Trends' },
  { to: '/resources', label: 'Aid Resources' },
  { to: '/about', label: 'Our Mission' },
];

const VIDEOS_PER_HEADLINE = 2;

const fade = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };

export default function Home() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const videoChangeCountRef = useRef(0);
  const [headlines, setHeadlines] = useState<HeadlineArticle[]>([]);
  const [headlinesLoading, setHeadlinesLoading] = useState(true);

  // Fetch real headlines via EONET + Google News
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setHeadlinesLoading(true);
        const data = await fetchHeadlines();
        if (!cancelled) {
          setHeadlines(data.articles || []);
        }
      } catch {
        if (!cancelled) setHeadlines([]);
      } finally {
        if (!cancelled) setHeadlinesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Every 2 video swaps, advance headline
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
    <div className="relative h-screen overflow-hidden bg-black">
      {/* Video Background */}
      <div className="absolute inset-0">
        <HeroVideoCarousel onVideoChange={handleVideoChange} />
        <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-black to-transparent z-[5]" />
      </div>

      <div className="relative z-10 h-full flex flex-col" style={{ zIndex: 20 }}>
          <div className="flex-1 flex items-center justify-center px-4 pb-8">
            <div className="text-center">
              <motion.h1
                initial="hidden"
                animate="visible"
                variants={fade}
                transition={{ duration: 0.6 }}
                className="font-heading text-5xl sm:text-6xl md:text-7xl font-light text-white tracking-tight leading-none"
              >
                FIND AID.
                <br />
                STAY SAFE.
              </motion.h1>

              <motion.p
                initial="hidden"
                animate="visible"
                variants={fade}
                transition={{ duration: 0.6, delay: 0.15 }}
                className="mt-5 text-sm tracking-[0.2em] uppercase text-white/40"
              >
                Real-time disaster tracking &amp; relief resources
              </motion.p>

              <motion.div
                initial="hidden"
                animate="visible"
                variants={fade}
                transition={{ duration: 0.6, delay: 0.3 }}
                className="mt-12 flex items-center justify-center"
              >
                <Link
                  to="/map"
                  className="w-72 py-5 text-center text-sm font-semibold tracking-[0.2em] uppercase bg-white/20 backdrop-blur-sm border border-white/30 text-white hover:bg-white/30 transition-colors flex items-center justify-center gap-2"
                >
                  <MapPin className="h-4 w-4" />
                  DISASTER MAP
                </Link>
              </motion.div>
            </div>
          </div>

          {/* Carousel — real headlines from GDELT */}
          <div className="pb-12 pt-2 px-4">
            <Link to="/news" className="block">
              <h2 className="font-heading text-xl sm:text-2xl font-light text-white tracking-tight text-center mb-8 hover:text-white/70 transition-colors">
                Latest Headlines
              </h2>
            </Link>

            {headlinesLoading ? (
              <div className="flex items-center justify-center gap-2 text-white/50 py-12">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Loading headlines…</span>
              </div>
            ) : carouselItems.length === 0 ? (
              <p className="text-center text-white/40 text-sm py-12">No headlines available</p>
            ) : (
              <>
                <div className="relative h-56 max-w-4xl mx-auto">
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
                          className="absolute top-0 left-1/2 w-[320px] sm:w-[380px] -ml-[160px] sm:-ml-[190px]"
                        >
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`block h-52 border border-white/15 backdrop-blur-sm flex flex-col justify-end p-6 transition-colors cursor-pointer group ${
                              offset === 0
                                ? 'bg-white/10 hover:bg-white/15'
                                : 'bg-white/5 pointer-events-none'
                            }`}
                          >
                            {item.disasterCategory && (
                              <span className="text-[10px] tracking-[0.15em] uppercase text-red-400/70 mb-1">
                                {item.disasterCategory}{item.disasterTitle ? ` — ${item.disasterTitle}` : ''}
                              </span>
                            )}
                            <span className="text-[10px] tracking-[0.2em] uppercase text-white/35 mb-2">
                              {item.source}
                            </span>
                            <h3 className="font-heading text-lg font-semibold text-white mb-1 line-clamp-2">
                              {item.title}
                            </h3>
                            {offset === 0 && (
                              <span className="text-xs text-white/40 flex items-center gap-1 mt-1">
                                <ExternalLink className="h-3 w-3" /> Read full article
                              </span>
                            )}
                          </a>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>

                {/* Arrows + Dots */}
                <div className="flex items-center justify-center gap-4 mt-6">
                  <button
                    onClick={() => setActiveIndex((prev) => (prev - 1 + count) % count)}
                    className="p-2 text-white/50 hover:text-white transition-colors"
                    aria-label="Previous headline"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <div className="flex gap-2">
                    {carouselItems.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setActiveIndex(i)}
                        className={`w-2 h-2 transition-colors ${
                          i === activeIndex ? 'bg-white' : 'bg-white/25'
                        }`}
                      />
                    ))}
                  </div>
                  <button
                    onClick={() => setActiveIndex((prev) => (prev + 1) % count)}
                    className="p-2 text-white/50 hover:text-white transition-colors"
                    aria-label="Next headline"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
              </>
            )}
          </div>
      </div>

      {/* Menu trigger — top right */}
      <div
        className="fixed top-4 right-6 z-[60]"
        onMouseEnter={() => setSidebarOpen(true)}
      >
        <div className="p-2 text-white/60 hover:text-white transition-colors cursor-pointer">
          <Menu className="h-6 w-6" />
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
