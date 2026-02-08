// ─── Hazard Types ────────────────────────────────────────────
export const HAZARD_TYPES = [
  'wildfire', 'earthquake', 'cyclone', 'flood', 'tornado', 'other'
] as const;
export type HazardType = (typeof HAZARD_TYPES)[number];

export const MODES = ['live', 'prediction'] as const;
export type Mode = (typeof MODES)[number];

export const CONFIDENCE_LEVELS = ['LOW', 'MED', 'HIGH'] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

// ─── Geometry ────────────────────────────────────────────────
export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number]; // [lon, lat]
}

export interface GeoPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

export type Geometry = GeoPoint | GeoPolygon | null;

// ─── HazardMarker ────────────────────────────────────────────
export interface HazardMarker {
  id: string;
  hazardType: HazardType;
  lat: number;
  lon: number;
  severity: number;          // 0-100
  weight: number;            // for clustering
  title: string;
  updatedAt: string;         // ISO-8601
  source: { name: string; url: string };
  geometry: Geometry;
}

export interface HazardMarkersResponse {
  mode: Mode;
  horizonDays: number;
  bbox: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
  markers: HazardMarker[];
  generatedAt: string;
}

// ─── Risk Score ──────────────────────────────────────────────
export interface PerHazardScore {
  hazardType: HazardType;
  score: number;
  drivers: string[];
}

export interface RiskScoreResponse {
  mode: Mode;
  horizonDays: number;
  location: { lat: number; lon: number; label: string | null };
  hazardRiskScore: number;        // 0-100
  vulnerabilityScore: number;     // 0-100
  impactScore: number;            // 0-100
  confidence: ConfidenceLevel;
  perHazard: PerHazardScore[];
  notes: string[];
}

// ─── Weather ─────────────────────────────────────────────────
export interface WeatherCurrent {
  temperature: number;
  windSpeed: number;
  humidity: number;
  precipitation: number;
  weatherCode: number;
  description: string;
}

export interface WeatherForecastHour {
  time: string;
  temperature: number;
  windSpeed: number;
  humidity: number;
  precipitationProbability: number;
  weatherCode: number;
}

export interface WeatherResponse {
  mode: 'live' | 'forecast';
  lat: number;
  lon: number;
  current?: WeatherCurrent;
  hourly?: WeatherForecastHour[];
  generatedAt: string;
}

// ─── News ────────────────────────────────────────────────────
export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  imageUrl: string | null;
  publishedAt: string;
  hazardTypes: HazardType[];
}

export interface CarouselResponse {
  items: NewsItem[];
}

export interface NewsFeedResponse {
  items: NewsItem[];
  nextCursor: string | null;
}

// ─── Aid ─────────────────────────────────────────────────────
export type AidType = 'shelter' | 'aid' | 'ngo' | 'hospital' | 'food' | 'other';

export interface AidItem {
  id: string;
  name: string;
  type: AidType;
  address: string | null;
  phone: string | null;
  url: string | null;
  distanceKm: number;
  lat: number;
  lon: number;
  source: { name: 'google_places' | 'mock' | 'reliefweb'; url: string | null };
}

export interface AidNearbyResponse {
  items: AidItem[];
}

export interface AidHubItem {
  name: string;
  url: string;
  description: string;
  scope: 'global' | 'regional' | 'national';
  country?: string;
}

export interface AidHubResponse {
  items: AidHubItem[];
}

// ─── Chat ────────────────────────────────────────────────────
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatContext {
  selected: { lat: number; lon: number; label: string | null };
  mode: Mode;
  horizonDays: number;
}

export interface ChatRequest {
  sessionId: string | null;
  messages: ChatMessage[];
  context: ChatContext;
}

export interface ChatAction {
  title: string;
  detail: string;
}

export interface ChatCitation {
  title: string;
  url: string;
}

export interface ChatResponse {
  sessionId: string;
  answer: string;
  actions: ChatAction[];
  citations: ChatCitation[];
  safetyNotes: string[];
}

// ─── Hotspots ────────────────────────────────────────────────
export interface HotspotItem {
  lat: number;
  lon: number;
  label: string;
  hazardType: HazardType;
  severity: number;
  markerCount: number;
}

export interface HotspotsResponse {
  items: HotspotItem[];
  generatedAt: string;
}

// ─── Shared Errors ───────────────────────────────────────────
export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
}
