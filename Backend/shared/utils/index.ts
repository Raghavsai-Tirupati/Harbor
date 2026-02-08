import pino from 'pino';
import { getEnv } from '../config.js';

// ─── Logger ──────────────────────────────────────────────────
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino/file', options: { destination: 1 } }
    : undefined,
});

// ─── Geo Utilities ───────────────────────────────────────────
const DEG_TO_RAD = Math.PI / 180;
const EARTH_RADIUS_KM = 6371;

/** Haversine distance in km */
export function haversineKm(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLon = (lon2 - lon1) * DEG_TO_RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) *
    Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Check if point is inside bbox [minLon, minLat, maxLon, maxLat] */
export function inBbox(
  lat: number, lon: number,
  bbox: [number, number, number, number],
): boolean {
  return lon >= bbox[0] && lat >= bbox[1] && lon <= bbox[2] && lat <= bbox[3];
}

/** Geohash encode (simplified 5-char for tile keys) */
export function geohashEncode(lat: number, lon: number, precision = 5): string {
  const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
  let minLat = -90, maxLat = 90, minLon = -180, maxLon = 180;
  let hash = '';
  let bit = 0;
  let ch = 0;
  let isLon = true;

  while (hash.length < precision) {
    if (isLon) {
      const mid = (minLon + maxLon) / 2;
      if (lon >= mid) { ch = ch * 2 + 1; minLon = mid; }
      else { ch = ch * 2; maxLon = mid; }
    } else {
      const mid = (minLat + maxLat) / 2;
      if (lat >= mid) { ch = ch * 2 + 1; minLat = mid; }
      else { ch = ch * 2; maxLat = mid; }
    }
    isLon = !isLon;
    bit++;
    if (bit === 5) {
      hash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}

// ─── Error formatting ────────────────────────────────────────
export function formatApiError(statusCode: number, message: string) {
  const errorNames: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
  };
  return {
    statusCode,
    error: errorNames[statusCode] || 'Error',
    message,
  };
}

// ─── HTTP fetch with timeout ─────────────────────────────────
export async function fetchJson<T = any>(
  url: string,
  options: { timeoutMs?: number; headers?: Record<string, string> } = {},
): Promise<T> {
  const { timeoutMs = 10000, headers = {} } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', ...headers },
    });
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status} from ${url}`);
    }
    return (await resp.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Clamp / Normalize ──────────────────────────────────────
export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function normalizeScore(val: number): number {
  return clamp(Math.round(val), 0, 100);
}
