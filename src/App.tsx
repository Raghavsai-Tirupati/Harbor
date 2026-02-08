import { Routes, Route, useLocation } from 'react-router-dom';
import { Navbar } from './components/disaster/Navbar';
import { Footer } from './components/disaster/Footer';
import { cn } from './lib/utils';
import Home from './pages/Home';
import DisasterMap from './pages/DisasterMap';
import DisasterNews from './pages/DisasterNews';
import Trends from './pages/Trends';
import AidResources from './pages/AidResources';
import About from './pages/About';
import NotFound from './pages/NotFound';

export default function App() {
  const location = useLocation();
  const isHome = location.pathname === '/';

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {!isHome && <Navbar />}
      <main className={cn("flex-1", !isHome && "pt-16")}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/map" element={<DisasterMap />} />
          <Route path="/news" element={<DisasterNews />} />
          <Route path="/trends" element={<Trends />} />
          <Route path="/resources" element={<AidResources />} />
          <Route path="/about" element={<About />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}
