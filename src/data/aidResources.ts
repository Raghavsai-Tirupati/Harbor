/* ── Aid Resource Data Module ─────────────────────────────────────── */

export type ResourceType =
  | "shelter"
  | "medical"
  | "food"
  | "evacuation_center"
  | "supply_distribution"
  | "general_help";

export interface AidResourceEntry {
  id: string;
  name: string;
  type: ResourceType;
  description: string;
  lat: number;
  lon: number;
  address: string | null;
  phone: string | null;
  website: string | null;
  disasterTypes: string[];
}

/* ── Color & label maps ──────────────────────────────────────────── */

export const RESOURCE_TYPE_COLORS: Record<ResourceType, string> = {
  shelter: "#3b82f6",
  medical: "#ef4444",
  food: "#22c55e",
  evacuation_center: "#f59e0b",
  supply_distribution: "#a855f7",
  general_help: "#6b7280",
};

export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  shelter: "Shelter",
  medical: "Medical Aid",
  food: "Food Distribution",
  evacuation_center: "Evacuation Center",
  supply_distribution: "Supply Distribution",
  general_help: "General Help",
};

/* ── Seed data ───────────────────────────────────────────────────── */

export const aidResources: AidResourceEntry[] = [
  // Nationwide
  {
    id: "r01",
    name: "FEMA Disaster Assistance",
    type: "general_help",
    description: "Federal emergency management providing disaster relief coordination, temporary housing, and recovery assistance nationwide.",
    lat: 38.8847,
    lon: -77.0164,
    address: "500 C Street SW, Washington, DC 20472",
    phone: "1-800-621-3362",
    website: "https://www.fema.gov",
    disasterTypes: ["wildfire", "flood", "storm", "hurricane", "blizzard", "earthquake"],
  },
  {
    id: "r02",
    name: "American Red Cross National HQ",
    type: "general_help",
    description: "National disaster relief organization providing emergency shelter, food, health services, and family reunification.",
    lat: 38.8964,
    lon: -77.0678,
    address: "431 18th Street NW, Washington, DC 20006",
    phone: "1-800-733-2767",
    website: "https://www.redcross.org",
    disasterTypes: ["wildfire", "flood", "storm", "hurricane", "blizzard", "earthquake"],
  },
  {
    id: "r03",
    name: "211 Helpline",
    type: "general_help",
    description: "Free, confidential service connecting people with local resources for food, shelter, utilities, and disaster assistance.",
    lat: 38.9072,
    lon: -77.0369,
    address: null,
    phone: "211",
    website: "https://www.211.org",
    disasterTypes: ["wildfire", "flood", "storm", "hurricane", "blizzard", "earthquake"],
  },
  {
    id: "r04",
    name: "Salvation Army Disaster Services",
    type: "food",
    description: "Mobile feeding units, emergency shelter, and emotional/spiritual care during disasters.",
    lat: 38.8833,
    lon: -77.1073,
    address: "615 Slaters Lane, Alexandria, VA 22314",
    phone: "1-800-725-2769",
    website: "https://www.salvationarmyusa.org",
    disasterTypes: ["wildfire", "flood", "storm", "hurricane", "blizzard", "earthquake"],
  },

  // Southeast / Hurricane
  {
    id: "r05",
    name: "Miami-Dade Emergency Management",
    type: "evacuation_center",
    description: "County emergency operations center coordinating hurricane evacuations, shelters, and disaster response for Miami-Dade.",
    lat: 25.7617,
    lon: -80.1918,
    address: "9300 NW 41st Street, Doral, FL 33178",
    phone: "305-468-5900",
    website: "https://www.miamidade.gov/emergency",
    disasterTypes: ["hurricane", "flood", "storm"],
  },
  {
    id: "r06",
    name: "New Orleans Emergency Shelter",
    type: "shelter",
    description: "Emergency shelter and evacuation staging area for hurricane and flood events in the Greater New Orleans area.",
    lat: 29.9511,
    lon: -90.0715,
    address: "1500 Sugar Bowl Drive, New Orleans, LA 70112",
    phone: "504-658-8700",
    website: null,
    disasterTypes: ["hurricane", "flood", "storm"],
  },
  {
    id: "r07",
    name: "Florida Division of Emergency Management",
    type: "general_help",
    description: "State-level emergency coordination for hurricane preparedness, response, and recovery across Florida.",
    lat: 30.4383,
    lon: -84.2807,
    address: "2555 Shumard Oak Blvd, Tallahassee, FL 32399",
    phone: "850-815-4000",
    website: "https://www.floridadisaster.org",
    disasterTypes: ["hurricane", "flood", "storm"],
  },

  // West / Wildfire
  {
    id: "r08",
    name: "CAL FIRE Sacramento HQ",
    type: "general_help",
    description: "California Department of Forestry and Fire Protection — wildfire response, evacuations, and fire safety information.",
    lat: 38.5816,
    lon: -121.4944,
    address: "1416 9th Street, Sacramento, CA 95814",
    phone: "916-653-5123",
    website: "https://www.fire.ca.gov",
    disasterTypes: ["wildfire"],
  },
  {
    id: "r09",
    name: "LA County Evacuation Center",
    type: "evacuation_center",
    description: "Emergency evacuation and shelter center for wildfire and earthquake events in Los Angeles County.",
    lat: 34.0522,
    lon: -118.2437,
    address: "1201 S Figueroa Street, Los Angeles, CA 90015",
    phone: "213-484-4800",
    website: null,
    disasterTypes: ["wildfire", "earthquake"],
  },
  {
    id: "r10",
    name: "Bay Area Red Cross",
    type: "shelter",
    description: "Regional Red Cross chapter providing shelter, meals, and disaster relief services across the San Francisco Bay Area.",
    lat: 37.7749,
    lon: -122.4194,
    address: "85 Second Street, San Francisco, CA 94105",
    phone: "415-427-8000",
    website: "https://www.redcross.org/local/california/northern-california-coastal.html",
    disasterTypes: ["wildfire", "earthquake"],
  },
  {
    id: "r11",
    name: "Portland Emergency Food Bank",
    type: "food",
    description: "Emergency food distribution serving displaced families during wildfire and flood events in the Portland metro area.",
    lat: 45.5152,
    lon: -122.6784,
    address: "7900 SE Johnson Creek Blvd, Portland, OR 97206",
    phone: "503-282-0555",
    website: null,
    disasterTypes: ["wildfire", "flood"],
  },

  // Midwest / Winter
  {
    id: "r12",
    name: "Chicago Winter Shelter Network",
    type: "shelter",
    description: "Network of warming centers and emergency shelters activated during blizzards and extreme cold events in Chicago.",
    lat: 41.8781,
    lon: -87.6298,
    address: "1615 W Chicago Ave, Chicago, IL 60622",
    phone: "311",
    website: null,
    disasterTypes: ["blizzard", "storm"],
  },
  {
    id: "r13",
    name: "Minneapolis Emergency Center",
    type: "medical",
    description: "Emergency medical and shelter services for blizzard, flood, and severe storm events in the Twin Cities metro.",
    lat: 44.9778,
    lon: -93.2650,
    address: "250 S 4th Street, Minneapolis, MN 55415",
    phone: "612-673-3000",
    website: null,
    disasterTypes: ["blizzard", "flood", "storm"],
  },
  {
    id: "r14",
    name: "FEMA Region V Office",
    type: "general_help",
    description: "FEMA regional office serving Illinois, Indiana, Michigan, Minnesota, Ohio, and Wisconsin for all disaster types.",
    lat: 41.8827,
    lon: -87.6233,
    address: "536 S Clark Street, Chicago, IL 60605",
    phone: "312-408-5500",
    website: "https://www.fema.gov/about/organization/region-5",
    disasterTypes: ["wildfire", "flood", "storm", "hurricane", "blizzard", "earthquake"],
  },

  // Northeast / General
  {
    id: "r15",
    name: "NYC Emergency Management",
    type: "general_help",
    description: "New York City's emergency management agency coordinating disaster preparedness, response, and recovery.",
    lat: 40.7128,
    lon: -74.0060,
    address: "165 Cadman Plaza East, Brooklyn, NY 11201",
    phone: "718-422-4888",
    website: "https://www.nyc.gov/site/em",
    disasterTypes: ["hurricane", "flood", "storm", "blizzard"],
  },
  {
    id: "r16",
    name: "Boston Emergency Shelter",
    type: "shelter",
    description: "Emergency shelter providing housing, meals, and services during blizzards and nor'easters in the Boston area.",
    lat: 42.3601,
    lon: -71.0589,
    address: "112 Southampton Street, Boston, MA 02118",
    phone: "617-534-5395",
    website: null,
    disasterTypes: ["blizzard", "storm", "hurricane"],
  },
  {
    id: "r17",
    name: "Houston Food Bank Disaster Relief",
    type: "food",
    description: "Large-scale food distribution and disaster meal services for hurricane and flood events in the Houston region.",
    lat: 29.7604,
    lon: -95.3698,
    address: "535 Portwall Street, Houston, TX 77029",
    phone: "713-223-3700",
    website: "https://www.houstonfoodbank.org",
    disasterTypes: ["hurricane", "flood", "storm"],
  },
  {
    id: "r18",
    name: "Denver Medical Supply Center",
    type: "supply_distribution",
    description: "Emergency medical supply distribution hub serving the Rocky Mountain region during blizzards and wildfires.",
    lat: 39.7392,
    lon: -104.9903,
    address: "660 Bannock Street, Denver, CO 80204",
    phone: "720-913-2000",
    website: null,
    disasterTypes: ["blizzard", "wildfire"],
  },
];

/* ── Fallback resources (always available) ───────────────────────── */

export const FALLBACK_RESOURCES: AidResourceEntry[] = [
  aidResources.find((r) => r.id === "r02")!, // American Red Cross
  aidResources.find((r) => r.id === "r01")!, // FEMA
  aidResources.find((r) => r.id === "r03")!, // 211 Helpline
];

/* ── Haversine distance (km) ─────────────────────────────────────── */

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ── Find nearby resources ───────────────────────────────────────── */

export interface NearbyResult extends AidResourceEntry {
  distanceKm: number;
}

export function findNearbyResources(
  lat: number,
  lon: number,
  opts?: { disasterType?: string; maxKm?: number; limit?: number },
): NearbyResult[] {
  const maxKm = opts?.maxKm ?? 500;
  const limit = opts?.limit ?? 10;

  let pool = aidResources;
  if (opts?.disasterType) {
    pool = pool.filter((r) => r.disasterTypes.includes(opts.disasterType!));
  }

  const withDist: NearbyResult[] = pool
    .map((r) => ({ ...r, distanceKm: haversineKm(lat, lon, r.lat, r.lon) }))
    .filter((r) => r.distanceKm <= maxKm);

  withDist.sort((a, b) => a.distanceKm - b.distanceKm);

  if (withDist.length === 0) {
    // Return fallback national resources with distances
    return FALLBACK_RESOURCES.map((r) => ({
      ...r,
      distanceKm: haversineKm(lat, lon, r.lat, r.lon),
    }));
  }

  return withDist.slice(0, limit);
}
