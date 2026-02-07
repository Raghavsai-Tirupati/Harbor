import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRef, useEffect, useState, useCallback } from 'react';

const VIDEO_SOURCES = [
  'https://mojli.s3.us-east-2.amazonaws.com/Mojli+Website+upscaled+(12mb).webm',
];

const HEADLINES = [
  { id: 1, title: 'Headline', subtitle: 'Breaking disaster news updates', source: 'Reuters' },
  { id: 2, title: 'Headline', subtitle: 'Emergency response coverage', source: 'AP News' },
  { id: 3, title: 'Headline', subtitle: 'Global relief efforts underway', source: 'BBC World' },
  { id: 4, title: 'Headline', subtitle: 'Climate event tracking report', source: 'Al Jazeera' },
  { id: 5, title: 'Headline', subtitle: 'Aid distribution developments', source: 'CNN' },
  { id: 6, title: 'Headline', subtitle: 'Recovery operations in progress', source: 'The Guardian' },
];

const ITEMS_PER_VIEW = 3;
const TOTAL_PAGES = Math.ceil(HEADLINES.length / ITEMS_PER_VIEW);

const fade = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [activePage, setActivePage] = useState(0);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.src = VIDEO_SOURCES[0];
      videoRef.current.load();
      videoRef.current.loop = true;
      videoRef.current.muted = true;
      const p = videoRef.current.play();
      if (p) p.catch(() => {});
    }
  }, []);

  // Auto-rotate carousel
  useEffect(() => {
    const timer = setInterval(() => {
      setActivePage((prev) => (prev + 1) % TOTAL_PAGES);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const currentItems = HEADLINES.slice(
    activePage * ITEMS_PER_VIEW,
    activePage * ITEMS_PER_VIEW + ITEMS_PER_VIEW
  );

  return (
    <div className="relative min-h-screen">
      {/* Full-page video background */}
      <video
        ref={videoRef}
        className="fixed inset-0 w-full h-full object-cover"
        muted
        playsInline
        preload="auto"
        style={{ pointerEvents: 'none' }}
      />
      <div className="fixed inset-0 bg-black/60" />

      {/* Content layer */}
      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Hero — top two-thirds */}
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="max-w-4xl mx-auto text-center">
            <motion.h1
              initial="hidden"
              animate="visible"
              variants={fade}
              transition={{ duration: 0.6 }}
              className="font-heading text-5xl sm:text-6xl md:text-7xl font-light text-white tracking-tight leading-none"
            >
              GLOBAL DISASTER
              <br />
              INSIGHT
            </motion.h1>

            <motion.div
              initial="hidden"
              animate="visible"
              variants={fade}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-6"
            >
              <Link
                to="/map"
                className="w-72 py-5 text-center text-sm font-semibold tracking-[0.2em] uppercase bg-white text-black hover:bg-white/90 transition-colors"
              >
                GET STARTED
              </Link>
              <Link
                to="/map"
                className="w-72 py-5 text-center text-sm font-semibold tracking-[0.2em] uppercase border border-white/40 text-white hover:bg-white/10 transition-colors flex items-center justify-center gap-2"
              >
                <MapPin className="h-4 w-4" />
                DISASTER MAP
              </Link>
            </motion.div>

            <motion.p
              initial="hidden"
              animate="visible"
              variants={fade}
              transition={{ duration: 0.6, delay: 0.35 }}
              className="mt-8 text-xs tracking-[0.15em] uppercase text-white/40"
            >
              Real-time tracking. No account required.
            </motion.p>
          </div>
        </div>

        {/* News carousel — bottom third, overlaying video */}
        <div className="px-4 sm:px-8 pb-12 pt-8">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-end justify-between mb-6">
              <div>
                <h2 className="font-heading text-2xl sm:text-3xl font-light text-white tracking-tight mb-1">
                  Latest Headlines
                </h2>
                <p className="text-sm text-white/50">
                  Disaster news from around the world
                </p>
              </div>
              {/* Page indicators */}
              <div className="flex gap-2">
                {Array.from({ length: TOTAL_PAGES }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setActivePage(i)}
                    className={`w-8 h-1 transition-colors ${
                      i === activePage ? 'bg-white' : 'bg-white/25'
                    }`}
                  />
                ))}
              </div>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={activePage}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                transition={{ duration: 0.4 }}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
              >
                {currentItems.map((item) => (
                  <div
                    key={item.id}
                    className="h-52 border border-white/15 bg-black/40 backdrop-blur-sm flex flex-col justify-end p-6 hover:bg-white/10 transition-colors cursor-pointer group"
                  >
                    <span className="text-[10px] tracking-[0.2em] uppercase text-white/35 mb-2">
                      {item.source}
                    </span>
                    <h3 className="font-heading text-xl font-semibold text-white mb-1 group-hover:text-white/90">
                      {item.title}
                    </h3>
                    <p className="text-sm text-white/50">{item.subtitle}</p>
                  </div>
                ))}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      <style>{`
        video::-webkit-media-controls,
        video::-webkit-media-controls-panel,
        video::-webkit-media-controls-play-button,
        video::-webkit-media-controls-start-playback-button,
        video::-webkit-media-controls-enclosure {
          display: none !important;
          -webkit-appearance: none !important;
          opacity: 0 !important;
          pointer-events: none !important;
        }
      `}</style>
    </div>
  );
}
