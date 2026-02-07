import { Link, useLocation } from 'react-router-dom';
import { Globe, Menu, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

const links = [
  { to: '/', label: 'HOME' },
  { to: '/map', label: 'DISASTER MAP' },
  { to: '/aid', label: 'AID & RESOURCES' },
  { to: '/assistant', label: 'AI ASSISTANT' },
  { to: '/trends', label: 'TRENDS' },
  { to: '/about', label: 'ABOUT' },
];

export function Navbar() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        scrolled
          ? 'bg-background/90 backdrop-blur-lg border-b border-border'
          : 'bg-transparent'
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2 font-heading font-bold text-lg text-white">
            <Globe className="h-6 w-6 text-primary" />
            <span>Global Disaster Insight</span>
          </Link>

          {/* Desktop */}
          <div className="hidden md:flex items-center gap-1">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className={cn(
                  'px-3 py-2 text-xs font-semibold tracking-wider transition-colors',
                  pathname === l.to
                    ? 'text-white'
                    : 'text-white/60 hover:text-white'
                )}
              >
                {l.label}
              </Link>
            ))}
          </div>

          {/* Mobile toggle */}
          <button className="md:hidden p-2 text-white" onClick={() => setOpen(!open)}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden bg-background/95 backdrop-blur-lg border-t border-border px-4 pb-4 space-y-1">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              onClick={() => setOpen(false)}
              className={cn(
                'block px-3 py-2 text-sm font-semibold tracking-wider transition-colors',
                pathname === l.to
                  ? 'text-white'
                  : 'text-white/60 hover:text-white'
              )}
            >
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
