import { Link } from 'react-router-dom';
import { MapPin, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { useRef, useEffect } from 'react';

const VIDEO_SOURCES = [
  'https://mojli.s3.us-east-2.amazonaws.com/Mojli+Website+upscaled+(12mb).webm',
];

const HEADLINES = [
  { id: 1, title: 'Headline', subtitle: 'Breaking disaster news updates' },
  { id: 2, title: 'Headline', subtitle: 'Emergency response coverage' },
  { id: 3, title: 'Headline', subtitle: 'Global relief efforts underway' },
  { id: 4, title: 'Headline', subtitle: 'Climate event tracking report' },
  { id: 5, title: 'Headline', subtitle: 'Aid distribution developments' },
  { id: 6, title: 'Headline', subtitle: 'Recovery operations in progress' },
];

const fade = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  return (
    <div>
      {/* Hero — top half */}
      <section className="relative h-[60vh] flex items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          muted
          playsInline
          preload="auto"
          style={{ pointerEvents: 'none' }}
        />
        <div className="absolute inset-0 bg-black/60" />

        <div className="relative z-10 max-w-4xl mx-auto px-4 text-center">
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
      </section>

      {/* News headline carousel */}
      <section className="bg-background py-16 px-4 sm:px-8">
        <div className="max-w-7xl mx-auto">
          <h2 className="font-heading text-2xl sm:text-3xl font-light text-foreground tracking-tight mb-2">
            Latest Headlines
          </h2>
          <p className="text-sm text-muted-foreground mb-8">
            Disaster news from around the world
          </p>

          <div
            ref={scrollRef}
            className="flex gap-5 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {HEADLINES.map((item) => (
              <div
                key={item.id}
                className="snap-start shrink-0 w-72 sm:w-80 h-52 border border-border bg-card flex flex-col justify-end p-6 hover:bg-accent/30 transition-colors cursor-pointer"
              >
                <h3 className="font-heading text-xl font-semibold text-foreground mb-1">
                  {item.title}
                </h3>
                <p className="text-sm text-muted-foreground">{item.subtitle}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
