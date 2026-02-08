import { Link } from 'react-router-dom';
import harborLogo from '@/assets/harbor-logo.png';

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-black mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-2">
            <div className="flex items-center gap-3 font-heading font-bold text-lg text-white mb-3">
              <img src={harborLogo} alt="Harbor" className="h-7 w-7 object-contain" />
              Harbor
            </div>
            <p className="text-sm text-white/40 max-w-md">
              Helping people understand global disaster trends and locate emergency resources. This is not an official emergency response service.
            </p>
          </div>

          <div>
            <h4 className="font-heading font-semibold text-sm text-white mb-3">Navigate</h4>
            <div className="space-y-2">
              {[{ to: '/map', label: 'Disaster Map' }, { to: '/news', label: 'News' }, { to: '/trends', label: 'Trends' }, { to: '/resources', label: 'Aid Resources' }, { to: '/about', label: 'Our Mission' }].map(l => (
                <Link key={l.to} to={l.to} className="block text-sm text-white/40 hover:text-white transition-colors">{l.label}</Link>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-white/10">
          <p className="text-xs text-white/30">© 2026 Harbor. Not an official emergency service.</p>
        </div>
      </div>
    </footer>
  );
}
