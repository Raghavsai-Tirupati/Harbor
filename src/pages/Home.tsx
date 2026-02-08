import { Link } from 'react-router-dom';
import { MapPin, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { HeroVideoCarousel } from '@/components/HeroVideoCarousel';
import { useState, useRef, useCallback, useEffect } from 'react';

const HEADLINES = [
  { id: 1, title: 'Earthquake Response', subtitle: 'Breaking disaster news updates', source: 'Reuters', slug: 'earthquake-response' },
  { id: 2, title: 'Flood Warning Issued', subtitle: 'Emergency response coverage', source: 'AP News', slug: 'flood-warning' },
  { id: 3, title: 'Global Relief Efforts', subtitle: 'Global relief efforts underway', source: 'BBC World', slug: 'global-relief' },
  { id: 4, title: 'Climate Event Tracking', subtitle: 'Climate event tracking report', source: 'Al Jazeera', slug: 'climate-tracking' },
  { id: 5, title: 'Aid Distribution', subtitle: 'Aid distribution developments', source: 'CNN', slug: 'aid-distribution' },
  { id: 6, title: 'Recovery Operations', subtitle: 'Recovery operations in progress', source: 'The Guardian', slug: 'recovery-ops' },
];

const VIDEOS_PER_HEADLINE = 2;
const AUTO_ROTATE_MS = 4000;

const fade = { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } };

export default function Home() {
  const [activeIndex, setActiveIndex] = useState(0);
  const videoChangeCountRef = useRef(0);

  // Every 2 video swaps, advance headline
  const handleVideoChange = useCallback(() => {
    videoChangeCountRef.current += 1;
    if (videoChangeCountRef.current % VIDEOS_PER_HEADLINE === 0) {
      setActiveIndex((prev) => (prev + 1) % HEADLINES.length);
    }
  }, []);

  // Auto-rotate carousel
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % HEADLINES.length);
    }, AUTO_ROTATE_MS);
    return () => clearInterval(timer);
  }, []);

  // For each card, compute its offset from center (-1=left, 0=center, 1=right, else hidden)
  const getOffset = (itemIndex: number) => {
    let diff = itemIndex - activeIndex;
    const half = Math.floor(HEADLINES.length / 2);
    // Wrap around for shortest path
    if (diff > half) diff -= HEADLINES.length;
    if (diff < -half) diff += HEADLINES.length;
    return diff;
  };

  const getSlotStyle = (offset: number) => {
    if (offset === 0) return { x: 0, scale: 1, opacity: 1, zIndex: 10 };
    if (offset === -1) return { x: -220, scale: 0.85, opacity: 0.4, zIndex: 5 };
    if (offset === 1) return { x: 220, scale: 0.85, opacity: 0.4, zIndex: 5 };
    // Off-screen cards: slide further out in the direction they're heading
    if (offset <= -2) return { x: -400, scale: 0.75, opacity: 0, zIndex: 1 };
    return { x: 400, scale: 0.75, opacity: 0, zIndex: 1 };
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black">
      {/* Video Background — full window */}
      <div className="absolute inset-0 w-full h-full">
        <HeroVideoCarousel onVideoChange={handleVideoChange} />
        <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-black/80 to-transparent z-[5]" />
      </div>

      {/* Content overlay */}
      <div className="relative z-20 h-full flex flex-col items-center justify-center px-4">
        {/* Hero text — centered, smaller */}
        <div className="text-center mb-auto mt-auto">
          <motion.h1
            initial="hidden"
            animate="visible"
            variants={fade}
            transition={{ duration: 0.6 }}
            className="font-heading text-3xl sm:text-4xl md:text-5xl font-light text-white tracking-tight leading-tight"
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
            className="mt-3 text-xs sm:text-sm tracking-[0.15em] uppercase text-white/40"
          >
            Real-time disaster tracking &amp; relief resources
          </motion.p>

          <motion.div
            initial="hidden"
            animate="visible"
            variants={fade}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-8"
          >
            <Link
              to="/map"
              className="inline-flex items-center justify-center gap-2 px-8 py-3 text-xs font-semibold tracking-[0.15em] uppercase bg-white/15 backdrop-blur-sm border border-white/20 text-white hover:bg-white/25 transition-colors"
            >
              <MapPin className="h-3.5 w-3.5" />
              DISASTER MAP
            </Link>
          </motion.div>
        </div>

        {/* Carousel — bottom area */}
        <div className="w-full pb-8 sm:pb-12 pt-4">
          <Link to="/news" className="block">
            <h2 className="font-heading text-base sm:text-lg font-light text-white/80 tracking-tight text-center mb-6 hover:text-white transition-colors">
              Latest Headlines
            </h2>
          </Link>

          <div className="relative h-40 sm:h-44 max-w-3xl mx-auto overflow-hidden">
            {HEADLINES.map((item, i) => {
              const offset = getOffset(i);
              const slot = getSlotStyle(offset);
              return (
                <motion.div
                  key={item.id}
                  animate={{
                    x: slot.x,
                    scale: slot.scale,
                    opacity: slot.opacity,
                    zIndex: slot.zIndex,
                  }}
                  transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
                  className="absolute top-0 left-1/2 w-[260px] sm:w-[300px] -ml-[130px] sm:-ml-[150px]"
                >
                  <div
                    className={`block h-36 sm:h-40 border border-white/10 backdrop-blur-sm flex flex-col justify-end p-4 sm:p-5 ${
                      offset === 0
                        ? 'bg-white/10'
                        : 'bg-white/5 pointer-events-none'
                    }`}
                  >
                    <span className="text-[9px] tracking-[0.15em] uppercase text-white/30 mb-1.5">
                      {item.source}
                    </span>
                    <h3 className="font-heading text-sm sm:text-base font-semibold text-white mb-0.5">
                      {item.title}
                    </h3>
                    <p className="text-xs text-white/45">{item.subtitle}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Dots + arrows */}
          <div className="flex items-center justify-center gap-3 mt-4">
            <button
              onClick={() => setActiveIndex((prev) => (prev - 1 + HEADLINES.length) % HEADLINES.length)}
              className="p-1.5 text-white/40 hover:text-white transition-colors"
              aria-label="Previous headline"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex gap-1.5">
              {HEADLINES.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActiveIndex(i)}
                  className={`w-1.5 h-1.5 transition-all ${
                    i === activeIndex ? 'bg-white scale-125' : 'bg-white/20'
                  }`}
                />
              ))}
            </div>
            <button
              onClick={() => setActiveIndex((prev) => (prev + 1) % HEADLINES.length)}
              className="p-1.5 text-white/40 hover:text-white transition-colors"
              aria-label="Next headline"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
