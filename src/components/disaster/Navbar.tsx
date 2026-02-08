import { Link, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import harborLogo from '@/assets/harbor-logo.png';

const NAV_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/map', label: 'Disaster Map' },
  { to: '/news', label: 'News' },
  { to: '/trends', label: 'Trends' },
  { to: '/resources', label: 'Aid Resources' },
  { to: '/about', label: 'Our Mission' },
];

export function Navbar() {
  const { pathname } = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const isHome = pathname === '/';

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Logo — fixed top-left */}
      <Link
        to="/"
        className="fixed top-4 left-4 sm:left-6 z-[60] flex items-center gap-2 font-heading font-bold text-lg text-white tracking-tight"
      >
        <img src={harborLogo} alt="Harbor" className="h-8 w-8 object-contain" />
        <span className={cn(
          'transition-opacity',
          isHome && !scrolled ? 'opacity-100' : 'opacity-100'
        )}>Harbor</span>
      </Link>

      {/* Hamburger — fixed top-right */}
      <button
        onClick={() => setMenuOpen((prev) => !prev)}
        className="fixed top-4 right-4 sm:right-6 z-[60] p-2 text-white/70 hover:text-white transition-colors"
        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
      >
        {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
      </button>

      {/* Sidebar overlay + panel */}
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="fixed inset-0 bg-black/50 z-[55]"
              onClick={() => setMenuOpen(false)}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="fixed top-0 right-0 h-full w-3/4 sm:w-72 bg-black/90 backdrop-blur-xl border-l border-white/10 z-[58] flex flex-col"
            >
              <div className="p-6 border-b border-white/10">
                <span className="font-heading text-xs tracking-[0.15em] uppercase text-white/50">Menu</span>
              </div>
              <nav className="flex-1 p-4 space-y-1">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    onClick={() => setMenuOpen(false)}
                    className={cn(
                      'block py-3 px-4 font-heading text-sm font-semibold tracking-[0.1em] uppercase transition-colors',
                      pathname === link.to
                        ? 'text-white bg-white/10'
                        : 'text-white/50 hover:text-white hover:bg-white/5'
                    )}
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
