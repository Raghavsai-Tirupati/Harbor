import { useState, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import { Button } from '@/components/ui/button';
import { mockDisasters, disasterColors, type DisasterType, type DisasterEvent } from '@/data/mockDisasters';
import { Link } from 'react-router-dom';
import { MapPin, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const types: { value: DisasterType | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'earthquake', label: 'Earthquakes' },
  { value: 'flood', label: 'Floods' },
  { value: 'hurricane', label: 'Hurricanes' },
  { value: 'wildfire', label: 'Wildfires' },
  { value: 'extreme-heat', label: 'Extreme Heat' },
];

const times = ['Last 24 Hours', 'Last 7 Days', 'Last 30 Days', 'Historical'] as const;

const severityColor: Record<string, string> = {
  Low: 'text-disaster-green',
  Moderate: 'text-disaster-amber',
  High: 'text-disaster-red',
  Critical: 'text-disaster-purple',
};

export default function DisasterMap() {
  const [typeFilter, setTypeFilter] = useState<DisasterType | 'all'>('all');
  const [timeFilter, setTimeFilter] = useState<(typeof times)[number]>('Last 30 Days');
  const [selected, setSelected] = useState<DisasterEvent | null>(null);

  const filtered = useMemo(
    () => mockDisasters.filter((d) => typeFilter === 'all' || d.type === typeFilter),
    [typeFilter]
  );

  return (
    <div className="flex flex-col lg:flex-row h-screen">
      {/* Map */}
      <div className="flex-1 relative">
        {/* Controls */}
        <div className="absolute top-4 left-4 right-4 z-[1000] flex flex-wrap gap-2">
          <div className="bg-card/90 backdrop-blur-md border border-border p-2 flex flex-wrap gap-1">
            {types.map((t) => (
              <button
                key={t.value}
                onClick={() => setTypeFilter(t.value)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium transition-colors',
                  typeFilter === t.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="bg-card/90 backdrop-blur-md border border-border p-2 flex flex-wrap gap-1">
            {times.map((t) => (
              <button
                key={t}
                onClick={() => setTimeFilter(t)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium transition-colors',
                  timeFilter === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <MapContainer center={[20, 0]} zoom={2} className="h-full w-full" scrollWheelZoom>
          <TileLayer
            attribution='&copy; <a href="https://carto.com">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          {filtered.map((d) => (
            <CircleMarker
              key={d.id}
              center={[d.lat, d.lng]}
              radius={d.severity === 'Critical' ? 12 : d.severity === 'High' ? 10 : 7}
              pathOptions={{ color: disasterColors[d.type], fillColor: disasterColors[d.type], fillOpacity: 0.6, weight: 2 }}
              eventHandlers={{ click: () => setSelected(d) }}
            >
              <Popup>
                <strong>{d.title}</strong>
                <br />
                {d.location}
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      {/* Side panel */}
      {selected && (
        <div className="w-full lg:w-96 bg-card border-l border-border p-6 overflow-y-auto">
          <div className="flex items-start justify-between mb-4">
            <h2 className="font-heading text-xl font-bold">{selected.title}</h2>
            <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Location</p>
              <p className="font-medium">{selected.location}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Date</p>
              <p className="font-medium">{selected.date}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Severity</p>
              <p className={cn('font-semibold', severityColor[selected.severity])}>{selected.severity}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Type</p>
              <p className="font-medium capitalize">{selected.type.replace('-', ' ')}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Historical Frequency</p>
              <p className="font-medium">{selected.frequency}</p>
            </div>

            <div className="pt-4 border-t border-border space-y-3">
              <Button asChild className="w-full">
                <Link to="/aid">
                  <MapPin className="h-4 w-4 mr-2" /> Find Nearby Aid
                </Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
