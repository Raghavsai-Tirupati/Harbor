import { useState, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import { mockAidResources, aidColors, type AidResource } from '@/data/mockDisasters';
import { cn } from '@/lib/utils';
import { Home, UtensilsCrossed, Stethoscope, Route, Navigation } from 'lucide-react';
import { Button } from '@/components/ui/button';

const typeIcons: Record<AidResource['type'], React.ElementType> = {
  shelter: Home,
  food: UtensilsCrossed,
  medical: Stethoscope,
  evacuation: Route,
};

const typeLabels: Record<AidResource['type'], string> = {
  shelter: 'Shelter',
  food: 'Food Distribution',
  medical: 'Medical Aid',
  evacuation: 'Evacuation Center',
};

const filterTypes: (AidResource['type'] | 'all')[] = ['all', 'shelter', 'food', 'medical', 'evacuation'];

export default function AidResources() {
  const [filter, setFilter] = useState<AidResource['type'] | 'all'>('all');

  const filtered = useMemo(
    () => mockAidResources.filter((r) => filter === 'all' || r.type === filter),
    [filter]
  );

  return (
    <div className="flex flex-col lg:flex-row h-screen">
      {/* Map */}
      <div className="flex-1 relative min-h-[300px]">
        <div className="absolute top-4 left-4 z-[1000] bg-card/90 backdrop-blur-md border border-border p-2 flex flex-wrap gap-1">
          {filterTypes.map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium transition-colors capitalize',
                filter === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
              )}
            >
              {t === 'all' ? 'All' : typeLabels[t]}
            </button>
          ))}
        </div>

        <MapContainer center={[14.59, 120.98]} zoom={12} className="h-full w-full" scrollWheelZoom>
          <TileLayer
            attribution='&copy; <a href="https://carto.com">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          {filtered.map((r) => (
            <CircleMarker
              key={r.id}
              center={[r.lat, r.lng]}
              radius={8}
              pathOptions={{ color: aidColors[r.type], fillColor: aidColors[r.type], fillOpacity: 0.7, weight: 2 }}
            >
              <Popup>
                <strong>{r.name}</strong>
                <br />
                {typeLabels[r.type]} · {r.distance}
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      {/* List */}
      <div className="w-full lg:w-96 bg-card border-l border-border overflow-y-auto">
        <div className="p-6 border-b border-border">
          <h2 className="font-heading text-xl font-bold">Aid & Resources</h2>
          <p className="text-sm text-muted-foreground mt-1">Emergency support near affected areas</p>
        </div>
        <div className="divide-y divide-border">
          {filtered.map((r) => {
            const Icon = typeIcons[r.type];
            return (
              <div key={r.id} className="p-4 hover:bg-muted/30 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 flex items-center justify-center shrink-0" style={{ backgroundColor: `${aidColors[r.type]}20` }}>
                    <Icon className="h-4 w-4" style={{ color: aidColors[r.type] }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm">{r.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{typeLabels[r.type]} · {r.distance}</p>
                    <p className="text-xs text-muted-foreground">{r.address}</p>
                  </div>
                  <Button size="sm" variant="outline" className="shrink-0 text-xs">
                    <Navigation className="h-3 w-3 mr-1" /> Directions
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
