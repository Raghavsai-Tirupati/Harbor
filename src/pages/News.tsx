import { useState } from 'react';
import { cn } from '@/lib/utils';

const CATEGORIES = ['All', 'Earthquakes', 'Floods', 'Hurricanes', 'Wildfires', 'Climate'] as const;

type Category = (typeof CATEGORIES)[number];

interface NewsItem {
  id: number;
  title: string;
  summary: string;
  source: string;
  time: string;
  category: Exclude<Category, 'All'>;
}

const NEWS_ITEMS: NewsItem[] = [
  { id: 1, title: '7.2 Earthquake Strikes Southern Philippines', summary: 'A powerful earthquake has been felt across Mindanao with tsunami warnings issued for coastal areas. Emergency teams mobilized.', source: 'Reuters', time: '2h ago', category: 'Earthquakes' },
  { id: 2, title: 'Severe Flooding in Bangladesh Displaces Thousands', summary: 'Monsoon rains have caused the worst flooding in a decade. Over 50,000 people have been evacuated from low-lying regions.', source: 'AP News', time: '3h ago', category: 'Floods' },
  { id: 3, title: 'Hurricane Maria Strengthens to Category 4', summary: 'The storm is expected to make landfall in the Caribbean within 48 hours. Evacuation orders have been issued for several islands.', source: 'BBC World', time: '4h ago', category: 'Hurricanes' },
  { id: 4, title: 'California Wildfire Containment Reaches 60%', summary: 'Firefighters continue battling the blaze that has burned over 100,000 acres. Air quality warnings remain in effect.', source: 'CNN', time: '5h ago', category: 'Wildfires' },
  { id: 5, title: 'Record Heatwave Across Southern Europe', summary: 'Temperatures exceed 45C in parts of Spain and Italy. Authorities urge residents to stay indoors and hydrate.', source: 'The Guardian', time: '6h ago', category: 'Climate' },
  { id: 6, title: 'Aftershock Sequence Continues in Turkey', summary: 'Multiple aftershocks above magnitude 5.0 have been recorded. Relief operations continue in affected provinces.', source: 'Al Jazeera', time: '7h ago', category: 'Earthquakes' },
  { id: 7, title: 'Flash Floods Hit Central Vietnam', summary: 'Heavy rainfall triggered flash floods in Quang Nam province. At least 12 villages have been cut off from main roads.', source: 'Reuters', time: '8h ago', category: 'Floods' },
  { id: 8, title: 'Tropical Storm Forms in Western Pacific', summary: 'Meteorologists are tracking a new tropical depression that could intensify into a typhoon within 72 hours.', source: 'AP News', time: '10h ago', category: 'Hurricanes' },
  { id: 9, title: 'Australian Bushfire Season Starts Early', summary: 'Dry conditions and high temperatures have sparked early-season fires in New South Wales and Queensland.', source: 'BBC World', time: '12h ago', category: 'Wildfires' },
  { id: 10, title: 'Arctic Ice Reaches Record Low for February', summary: 'Satellite data confirms the lowest sea ice extent ever recorded for the month, raising concerns about accelerating climate change.', source: 'The Guardian', time: '14h ago', category: 'Climate' },
  { id: 11, title: 'Magnitude 6.1 Earthquake in Peru', summary: 'The quake struck near Arequipa at a depth of 30km. No tsunami warning issued. Damage assessment underway.', source: 'Reuters', time: '16h ago', category: 'Earthquakes' },
  { id: 12, title: 'Danube River Flooding Threatens Hungary', summary: 'Water levels on the Danube are expected to peak this weekend. Budapest has activated its flood defense systems.', source: 'Al Jazeera', time: '18h ago', category: 'Floods' },
];

export default function News() {
  const [filter, setFilter] = useState<Category>('All');

  const filtered = filter === 'All'
    ? NEWS_ITEMS
    : NEWS_ITEMS.filter((n) => n.category === filter);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-24 pb-16">
      <div className="mb-8">
        <h1 className="font-heading text-2xl md:text-3xl font-bold">News</h1>
        <p className="text-sm text-muted-foreground mt-1">Global disaster news and updates.</p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-1.5 mb-8">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium transition-colors',
              filter === cat
                ? 'bg-primary text-primary-foreground'
                : 'bg-card border border-border text-muted-foreground hover:text-foreground'
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* News list */}
      <div className="space-y-4">
        {filtered.map((item) => (
          <article
            key={item.id}
            className="bg-card border border-border p-5 hover:border-white/20 transition-colors"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h3 className="font-heading text-sm sm:text-base font-semibold leading-snug">
                  {item.title}
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1.5 leading-relaxed">
                  {item.summary}
                </p>
                <div className="flex items-center gap-3 mt-3">
                  <span className="text-[10px] tracking-wider uppercase text-muted-foreground">
                    {item.source}
                  </span>
                  <span className="text-[10px] text-muted-foreground/50">|</span>
                  <span className="text-[10px] text-muted-foreground/70">{item.time}</span>
                  <span className="text-[10px] text-muted-foreground/50">|</span>
                  <span className="text-[10px] tracking-wider uppercase text-muted-foreground/70">
                    {item.category}
                  </span>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
