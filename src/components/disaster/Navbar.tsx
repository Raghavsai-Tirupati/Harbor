import { Link, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import harborLogo from '@/assets/harbor-logo.png';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

const NAV_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/map', label: 'Disaster Map' },
  { to: '/news', label: 'Disaster News' },
  { to: '/trends', label: 'Trends' },
  { to: '/resources', label: 'Aid Resources' },
  { to: '/about', label: 'Our Mission' },
];

export function Navbar() {
  const { pathname } = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const showBg = scrolled || pathname === '/map';

  return (
    <nav
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        showBg ? 'bg-black/95 border-b border-white/10' : 'bg-transparent'
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-3 font-heading font-bold text-xl text-white tracking-tight hover:text-white/90">
            <img src={harborLogo} alt="Harbor" className="h-9 w-9 object-contain" />
            <span>Harbor</span>
          </Link>
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <button
                className="p-2 text-white/80 hover:text-white transition-colors"
                aria-label="Open menu"
              >
                <Menu className="h-6 w-6" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[280px] bg-black/95 border-white/10">
              <nav className="mt-8 space-y-1">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    onClick={() => setMenuOpen(false)}
                    className={cn(
                      'block py-3 px-4 font-heading text-sm font-medium text-white/80 hover:text-white hover:bg-white/5 rounded transition-colors',
                      pathname === link.to && 'text-white bg-white/10'
                    )}
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
}
