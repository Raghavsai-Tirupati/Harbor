import { useState, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import { aidResources, RESOURCE_TYPE_COLORS, RESOURCE_TYPE_LABELS, type ResourceType, type AidResourceEntry } from '@/data/aidResources';
import { cn } from '@/lib/utils';
import { Home, UtensilsCrossed, Stethoscope, Route, Navigation, Package, HelpCircle, Phone, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';

const typeIcons: Record<ResourceType, React.ElementType> = {
  shelter: Home,
  food: UtensilsCrossed,
  medical: Stethoscope,
  evacuation_center: Route,
  supply_distribution: Package,
  general_help: HelpCircle,
};

const filterTypes: (ResourceType | 'all')[] = ['all', 'shelter', 'food', 'medical', 'evacuation_center', 'supply_distribution', 'general_help'];

export default function AidResources() {
  const [filter, setFilter] = useState<ResourceType | 'all'>('all');

  const filtered = useMemo(
    () => aidResources.filter((r) => filter === 'all' || r.type === filter),
    [filter]
  );

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-4rem)]">
      {/* Map */}
      <div className="flex-1 relative min-h-[300px]">
        <div className="absolute top-4 left-4 z-[1000] bg-card/90 backdrop-blur-md border border-border p-2 flex flex-wrap gap-1 rounded">
          {filterTypes.map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium transition-colors rounded',
                filter === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
              )}
            >
              {t === 'all' ? 'All' : RESOURCE_TYPE_LABELS[t]}
            </button>
          ))}
        </div>

        <MapContainer center={[39.5, -98.35]} zoom={4} className="h-full w-full" scrollWheelZoom>
          <TileLayer
            attribution='&copy; <a href="https://carto.com">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          {filtered.map((r) => (
            <CircleMarker
              key={r.id}
              center={[r.lat, r.lon]}
              radius={8}
              pathOptions={{
                color: RESOURCE_TYPE_COLORS[r.type],
                fillColor: RESOURCE_TYPE_COLORS[r.type],
                fillOpacity: 0.7,
                weight: 2,
              }}
            >
              <Popup>
                <div style={{ minWidth: 200 }}>
                  <strong>{r.name}</strong>
                  <br />
                  <span style={{ fontSize: 12, color: '#666' }}>{RESOURCE_TYPE_LABELS[r.type]}</span>
                  <br />
                  <span style={{ fontSize: 12 }}>{r.description}</span>
                  {r.phone && <><br /><span style={{ fontSize: 12 }}>📞 {r.phone}</span></>}
                  {r.website && <><br /><a href={r.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12 }}>{r.website}</a></>}
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      {/* List */}
      <div className="w-full lg:w-96 bg-card border-l border-border overflow-y-auto">
        <div className="p-6 border-b border-border">
          <h2 className="font-heading text-xl font-bold">Aid & Resources</h2>
          <p className="text-sm text-muted-foreground mt-1">Emergency support across the United States</p>
        </div>
        <div className="divide-y divide-border">
          {filtered.map((r) => {
            const Icon = typeIcons[r.type];
            return (
              <div key={r.id} className="p-4 hover:bg-muted/30 transition-colors">
                <div className="flex items-start gap-3">
                  <div
                    className="w-9 h-9 flex items-center justify-center shrink-0 rounded"
                    style={{ backgroundColor: `${RESOURCE_TYPE_COLORS[r.type]}20` }}
                  >
                    <Icon className="h-4 w-4" style={{ color: RESOURCE_TYPE_COLORS[r.type] }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm">{r.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{RESOURCE_TYPE_LABELS[r.type]}</p>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.description}</p>
                    {r.address && <p className="text-xs text-muted-foreground mt-1">📍 {r.address}</p>}
                    <div className="flex items-center gap-3 mt-1.5">
                      {r.phone && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Phone className="h-3 w-3" /> {r.phone}
                        </span>
                      )}
                      {r.website && (
                        <a
                          href={r.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                        >
                          <Globe className="h-3 w-3" /> Website
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
