import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';

const HEADLINES = [
  { id: 1, title: 'Earthquake Response', subtitle: 'Breaking disaster news updates', source: 'Reuters', slug: 'earthquake-response' },
  { id: 2, title: 'Flood Warning Issued', subtitle: 'Emergency response coverage', source: 'AP News', slug: 'flood-warning' },
  { id: 3, title: 'Global Relief Efforts', subtitle: 'Global relief efforts underway', source: 'BBC World', slug: 'global-relief' },
  { id: 4, title: 'Climate Event Tracking', subtitle: 'Climate event tracking report', source: 'Al Jazeera', slug: 'climate-tracking' },
  { id: 5, title: 'Aid Distribution', subtitle: 'Aid distribution developments', source: 'CNN', slug: 'aid-distribution' },
  { id: 6, title: 'Recovery Operations', subtitle: 'Recovery operations in progress', source: 'The Guardian', slug: 'recovery-ops' },
];

const fade = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };

export default function Home() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % HEADLINES.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // Get 3 visible cards: previous, active (center), next
  const getIndex = (offset: number) =>
    (activeIndex + offset + HEADLINES.length) % HEADLINES.length;

  const positions = [
    { offset: -1, scale: 0.85, x: '-60%', z: 1, opacity: 0.5 },
    { offset: 0, scale: 1, x: '0%', z: 10, opacity: 1 },
    { offset: 1, scale: 0.85, x: '60%', z: 1, opacity: 0.5 },
  ];

  return (
    <div className="relative h-screen overflow-hidden bg-black">
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(135deg, hsl(220,20%,8%) 0%, hsl(240,15%,12%) 50%, hsl(220,18%,10%) 100%)',
        }}
      />

      <div className="relative z-10 h-full flex flex-col">
        {/* Hero */}
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
          </div>
        </div>

        {/* Carousel — 3D rotating cards */}
        <div className="pb-12 pt-2 px-4">
          <h2 className="font-heading text-xl sm:text-2xl font-light text-white tracking-tight text-center mb-8">
            Latest Headlines
          </h2>

          <div className="relative h-56 max-w-4xl mx-auto">
            <AnimatePresence mode="popLayout">
              {positions.map(({ offset, scale, x, z, opacity }) => {
                const idx = getIndex(offset);
                const item = HEADLINES[idx];
                return (
                  <motion.div
                    key={`${item.id}-${offset}`}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{
                      opacity,
                      scale,
                      x,
                      zIndex: z,
                    }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.5, ease: 'easeInOut' }}
                    className="absolute top-0 left-1/2 w-[320px] sm:w-[380px] -ml-[160px] sm:-ml-[190px]"
                  >
                    <Link
                      to={`/headlines/${item.slug}`}
                      className={`block h-52 border border-white/15 backdrop-blur-sm flex flex-col justify-end p-6 transition-colors cursor-pointer group ${
                        offset === 0
                          ? 'bg-white/10 hover:bg-white/15'
                          : 'bg-white/5 pointer-events-none'
                      }`}
                    >
                      <span className="text-[10px] tracking-[0.2em] uppercase text-white/35 mb-2">
                        {item.source}
                      </span>
                      <h3 className="font-heading text-lg font-semibold text-white mb-1">
                        {item.title}
                      </h3>
                      <p className="text-sm text-white/50">{item.subtitle}</p>
                    </Link>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {/* Dots */}
          <div className="flex justify-center gap-2 mt-6">
            {HEADLINES.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveIndex(i)}
                className={`w-2 h-2 transition-colors ${
                  i === activeIndex ? 'bg-white' : 'bg-white/25'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
