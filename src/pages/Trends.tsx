import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, AreaChart, Area } from 'recharts';
import { TrendingUp, Globe2, Calendar } from 'lucide-react';

const barData = [
  { name: 'Earthquakes', count: 142, fill: 'hsl(0, 72%, 51%)' },
  { name: 'Floods', count: 198, fill: 'hsl(217, 91%, 60%)' },
  { name: 'Hurricanes', count: 67, fill: 'hsl(258, 90%, 66%)' },
  { name: 'Wildfires', count: 89, fill: 'hsl(38, 92%, 50%)' },
  { name: 'Extreme Heat', count: 124, fill: 'hsl(25, 95%, 53%)' },
];

const lineData = [
  { year: '2020', earthquakes: 120, floods: 150, wildfires: 60 },
  { year: '2021', earthquakes: 115, floods: 170, wildfires: 75 },
  { year: '2022', earthquakes: 130, floods: 185, wildfires: 90 },
  { year: '2023', earthquakes: 125, floods: 195, wildfires: 82 },
  { year: '2024', earthquakes: 140, floods: 210, wildfires: 95 },
  { year: '2025', earthquakes: 138, floods: 198, wildfires: 89 },
];

const monthlyData = [
  { month: 'Jan', events: 45 }, { month: 'Feb', events: 38 }, { month: 'Mar', events: 52 },
  { month: 'Apr', events: 61 }, { month: 'May', events: 75 }, { month: 'Jun', events: 89 },
  { month: 'Jul', events: 98 }, { month: 'Aug', events: 105 }, { month: 'Sep', events: 82 },
  { month: 'Oct', events: 68 }, { month: 'Nov', events: 55 }, { month: 'Dec', events: 42 },
];

const insights = [
  { icon: Globe2, title: 'Most Disaster-Prone Regions', desc: 'Southeast Asia, Central America, and the Pacific Ring of Fire see the highest disaster frequency.', color: 'text-disaster-blue', bg: 'bg-disaster-blue/10' },
  { icon: TrendingUp, title: 'Fastest Rising Disaster Type', desc: 'Floods have increased 32% in the last 5 years, driven by climate change and urbanization.', color: 'text-disaster-teal', bg: 'bg-disaster-teal/10' },
  { icon: Calendar, title: 'Seasonal Patterns', desc: 'June–September is peak disaster season globally, with hurricanes and monsoon floods dominating.', color: 'text-disaster-amber', bg: 'bg-disaster-amber/10' },
];

export default function Trends() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-24 pb-16">
      <div className="mb-8">
        <h1 className="font-heading text-2xl md:text-3xl font-bold">Trends & Insights</h1>
        <p className="text-sm text-muted-foreground mt-1">Global disaster patterns and data analysis.</p>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
        {/* Bar chart */}
        <div className="bg-card border border-border p-6">
          <h3 className="font-heading font-semibold mb-6">Most Frequent Disaster Types (2025)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
              <YAxis tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
              <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0', fontSize: 13 }} />
              <Bar dataKey="count" radius={[0, 0, 0, 0]} fill="var(--primary)" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Line chart */}
        <div className="bg-card border border-border p-6">
          <h3 className="font-heading font-semibold mb-6">Event Trends Over Time</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={lineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="year" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
              <YAxis tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
              <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0', fontSize: 13 }} />
              <Line type="monotone" dataKey="earthquakes" stroke="hsl(0, 72%, 51%)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="floods" stroke="hsl(217, 91%, 60%)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="wildfires" stroke="hsl(38, 92%, 50%)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Seasonal area chart */}
        <div className="bg-card border border-border p-6 lg:col-span-2">
          <h3 className="font-heading font-semibold mb-6">Seasonal Disaster Patterns (Monthly Events)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
              <YAxis tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
              <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0', fontSize: 13 }} />
              <Area type="monotone" dataKey="events" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.15} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Insight cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {insights.map((ins) => (
          <div key={ins.title} className="bg-card border border-border p-6">
            <div className={`inline-flex items-center justify-center w-10 h-10 ${ins.bg} mb-4`}>
              <ins.icon className={`h-5 w-5 ${ins.color}`} />
            </div>
            <h3 className="font-heading font-semibold mb-2">{ins.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{ins.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
