import { ShieldAlert, Database, AlertTriangle } from 'lucide-react';

export default function About() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
      <h1 className="font-heading text-3xl md:text-4xl font-bold mb-8">About & Disclaimer</h1>

      <div className="space-y-8">
        <div className="bg-card border border-border p-8">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-disaster-blue/10 flex items-center justify-center shrink-0">
              <Database className="h-5 w-5 text-disaster-blue" />
            </div>
            <div>
              <h2 className="font-heading text-xl font-semibold mb-2">Data Sources</h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                This platform aggregates publicly available disaster and aid data from sources including USGS earthquake feeds, NOAA weather alerts, NASA FIRMS wildfire data, and humanitarian organizations. Data is provided for informational purposes only.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border p-8">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-disaster-red/10 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-5 w-5 text-disaster-red" />
            </div>
            <div>
              <h2 className="font-heading text-xl font-semibold mb-2">Important Disclaimer</h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                <strong className="text-foreground">This tool is NOT an official emergency response service.</strong> It is a prototype designed to help people explore disaster trends and find general resource information. In case of an emergency, always contact your local emergency services (911 in the US) and follow instructions from official authorities.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border p-8">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-disaster-green/10 flex items-center justify-center shrink-0">
              <ShieldAlert className="h-5 w-5 text-disaster-green" />
            </div>
            <div>
              <h2 className="font-heading text-xl font-semibold mb-2">Safety First</h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Always follow local authorities during emergencies. This platform provides supplementary information and should not replace official emergency guidance. Shelter locations and aid resources shown may not be current — verify with local agencies before traveling.
              </p>
            </div>
          </div>
        </div>

        {/* Partner logos placeholder */}
        <div className="bg-card border border-border p-8 text-center">
          <h3 className="font-heading font-semibold mb-6">Ecosystem Partners</h3>
          <div className="flex flex-wrap items-center justify-center gap-8 text-muted-foreground text-sm font-medium">
            <span className="px-4 py-2 bg-muted">🏥 Red Cross</span>
            <span className="px-4 py-2 bg-muted">🌾 World Food Programme</span>
            <span className="px-4 py-2 bg-muted">🦄 UNICEF</span>
            <span className="px-4 py-2 bg-muted">🌍 Local NGOs</span>
          </div>
        </div>
      </div>
    </div>
  );
}
