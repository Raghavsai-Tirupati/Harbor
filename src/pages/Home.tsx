import { Link } from 'react-router-dom';
import { MapPin, Brain, BarChart3, ArrowRight, Shield, Globe2, MessageSquare, Bookmark, Clock, TrendingUp, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { useState, useRef, useEffect, useCallback } from 'react';

const VIDEO_SOURCES = [
  'https://mojli.s3.us-east-2.amazonaws.com/Mojli+Website+upscaled+(12mb).webm',
  // Add more video URLs here for cycling
];

const stats = [
  { icon: Bookmark, value: '1,200+', label: 'Active Disasters Tracked' },
  { icon: CheckCircle, value: '8,500+', label: 'Aid Locations Mapped' },
  { icon: TrendingUp, value: '45', label: 'Countries Covered' },
  { icon: Clock, value: '24/7', label: 'Real-Time Monitoring' },
];

const actions = [
  { icon: Globe2, label: 'Disaster Map', to: '/map' },
  { icon: Brain, label: 'AI Assistant', to: '/assistant' },
  { icon: BarChart3, label: 'View Trends', to: '/trends' },
  { icon: MapPin, label: 'Find Aid', to: '/aid' },
];

const features = [
  {
    icon: BarChart3,
    title: 'Global Disaster Trends',
    description: 'See where earthquakes, floods, hurricanes, and wildfires occur most often.',
  },
  {
    icon: MapPin,
    title: 'Live Aid Resource Map',
    description: 'Find shelters, food banks, and emergency support near affected areas.',
  },
  {
    icon: Brain,
    title: 'AI Emergency Assistant',
    description: 'Ask questions and get guidance about disaster risks and available help.',
  },
];

const steps = [
  { num: '01', title: 'View disaster data', desc: 'Explore the interactive map showing global events.' },
  { num: '02', title: 'Click a region', desc: 'Select an event or region to see details.' },
  { num: '03', title: 'Discover aid nearby', desc: 'Find shelters, medical aid, and safety info.' },
  { num: '04', title: 'Ask the AI', desc: 'Get personalized guidance from the assistant.' },
];

const fade = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } };

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);

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
      {/* Hero with Video Background */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* Video Background */}
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          muted
          playsInline
          preload="auto"
          style={{ pointerEvents: 'none' }}
        />
        {/* Dark overlay */}
        <div className="absolute inset-0 bg-black/70" />

        {/* Hero Content */}
        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 pt-24 pb-16 text-center">
          <motion.h1
            initial="hidden"
            animate="visible"
            variants={fade}
            transition={{ duration: 0.6 }}
            className="font-heading text-4xl sm:text-5xl md:text-6xl font-extrabold text-white leading-tight tracking-tight"
          >
            Welcome to Global Disaster Insight
          </motion.h1>
          <motion.p
            initial="hidden"
            animate="visible"
            variants={fade}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="mt-4 text-lg text-white/50 max-w-2xl mx-auto"
          >
            Track global disasters and find emergency resources in real time
          </motion.p>

          {/* Stat Cards Row */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={fade}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4"
          >
            {stats.map((s) => (
              <div
                key={s.label}
                className="bg-white/10 backdrop-blur-sm border border-white/10 p-5 flex items-center gap-3"
              >
                <s.icon className="h-5 w-5 text-white/40 shrink-0" />
                <div className="text-left">
                  <div className="text-xl font-bold text-white">{s.value}</div>
                  <div className="text-xs text-white/50">{s.label}</div>
                </div>
              </div>
            ))}
          </motion.div>

          {/* Action Buttons Row */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={fade}
            transition={{ duration: 0.6, delay: 0.45 }}
            className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4"
          >
            {actions.map((a) => (
              <Link
                key={a.label}
                to={a.to}
                className="bg-white/10 backdrop-blur-sm border border-white/10 p-5 flex flex-col items-center gap-2 hover:bg-white/20 transition-colors"
              >
                <a.icon className="h-6 w-6 text-white/70" />
                <span className="text-sm font-semibold text-white">{a.label}</span>
              </Link>
            ))}
          </motion.div>

          {/* Get Started Button */}
          <motion.div
            initial="hidden"
            animate="visible"
            variants={fade}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="mt-10"
          >
            <Button asChild size="lg" className="px-10 font-semibold text-base">
              <Link to="/map">
                Get Started <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </motion.div>
        </div>

        {/* Hide native video controls */}
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

      {/* Features */}
      <section className="py-20 md:py-28 bg-background">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-16">
            <h2 className="font-heading text-3xl md:text-4xl font-bold">What We Offer</h2>
            <p className="mt-3 text-muted-foreground max-w-xl mx-auto">Real-time data, interactive maps, and AI-powered guidance to help communities prepare and respond.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fade}
                transition={{ delay: i * 0.1 }}
                className="bg-card border border-border p-8 hover:shadow-lg transition-shadow"
              >
                <div className="inline-flex items-center justify-center w-12 h-12 bg-primary/10 mb-5">
                  <f.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-heading text-xl font-semibold mb-2">{f.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{f.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 bg-muted/30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <h2 className="font-heading text-3xl md:text-4xl font-bold text-center mb-16">How It Works</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((s, i) => (
              <motion.div
                key={s.num}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fade}
                transition={{ delay: i * 0.1 }}
                className="text-center"
              >
                <div className="text-4xl font-heading font-bold text-primary/20 mb-3">{s.num}</div>
                <h3 className="font-heading font-semibold text-lg mb-1">{s.title}</h3>
                <p className="text-muted-foreground text-sm">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Preparedness CTA */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="p-10 md:p-16 text-center text-white relative overflow-hidden" style={{ background: 'var(--gradient-card)' }}>
            <div className="grain-overlay absolute inset-0" />
            <div className="relative z-10">
              <Shield className="h-10 w-10 mx-auto mb-5 text-disaster-teal" />
              <h2 className="font-heading text-3xl md:text-4xl font-bold mb-4">Check Your Region's Readiness</h2>
              <p className="text-white/70 mb-8 max-w-lg mx-auto">Discover disaster risk scores, shelter density, and medical facility access for any location worldwide.</p>
              <Button asChild size="lg" className="px-8">
                <Link to="/map">
                  Explore the Map <ArrowRight className="h-4 w-4 ml-2" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
