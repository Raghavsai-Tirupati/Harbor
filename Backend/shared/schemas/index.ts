import { z } from 'zod';
import { HAZARD_TYPES, MODES, CONFIDENCE_LEVELS } from '../types/index.js';

// ─── Reusable ────────────────────────────────────────────────
export const latSchema = z.coerce.number().min(-90).max(90);
export const lonSchema = z.coerce.number().min(-180).max(180);
export const radiusKmSchema = z.coerce.number().min(1).max(500).default(50);
export const limitSchema = z.coerce.number().min(1).max(100).default(20);
export const cursorSchema = z.string().optional();
export const hazardTypeSchema = z.enum(HAZARD_TYPES);
export const modeSchema = z.enum(MODES).default('live');
export const horizonDaysSchema = z.coerce.number().refine((v: number) => [7, 30, 90].includes(v), {
  message: 'horizonDays must be 7, 30, or 90',
}).default(7);

// ─── /api/hazards/markers query ──────────────────────────────
export const hazardMarkersQuerySchema = z.object({
  bbox: z.string().transform((s: string) => {
    const parts = s.split(',').map(Number);
    if (parts.length !== 4 || parts.some(isNaN)) throw new Error('bbox must be minLon,minLat,maxLon,maxLat');
    return parts as [number, number, number, number];
  }),
  types: z.string().optional().transform((s: string | undefined) => {
    if (!s) return undefined;
    const parts = s.split(',').map(t => t.trim());
    return z.array(hazardTypeSchema).parse(parts);
  }),
  sinceHours: z.coerce.number().min(1).max(720).default(48),
  mode: modeSchema,
  horizonDays: horizonDaysSchema,
});

// ─── /api/risk/score query ───────────────────────────────────
export const riskScoreQuerySchema = z.object({
  lat: latSchema,
  lon: lonSchema,
  radiusKm: radiusKmSchema,
  horizonDays: horizonDaysSchema,
  mode: modeSchema,
  month: z.coerce.number().min(1).max(12).optional(),
});

// ─── /api/weather query ──────────────────────────────────────
export const weatherQuerySchema = z.object({
  lat: latSchema,
  lon: lonSchema,
  mode: z.enum(['live', 'forecast']).default('live'),
  hours: z.coerce.number().min(1).max(168).default(24),
  days: z.coerce.number().min(1).max(16).default(7),
});

// ─── /api/news queries ──────────────────────────────────────
export const newsGlobalQuerySchema = z.object({
  limit: limitSchema,
  cursor: cursorSchema,
  types: z.string().optional().transform((s: string | undefined) => {
    if (!s) return undefined;
    const parts = s.split(',').map(t => t.trim());
    return z.array(hazardTypeSchema).parse(parts);
  }),
});

export const newsLocalQuerySchema = z.object({
  lat: latSchema,
  lon: lonSchema,
  radiusKm: radiusKmSchema,
  limit: limitSchema,
  cursor: cursorSchema,
  types: z.string().optional().transform((s: string | undefined) => {
    if (!s) return undefined;
    const parts = s.split(',').map(t => t.trim());
    return z.array(hazardTypeSchema).parse(parts);
  }),
});

// ─── /api/home/carousel query ────────────────────────────────
export const carouselQuerySchema = z.object({
  lat: latSchema.optional(),
  lon: lonSchema.optional(),
});

// ─── /api/aid queries ────────────────────────────────────────
export const aidNearbyQuerySchema = z.object({
  lat: latSchema,
  lon: lonSchema,
  radiusKm: radiusKmSchema,
  limit: limitSchema,
});

// ─── /api/chat body ──────────────────────────────────────────
export const chatRequestSchema = z.object({
  sessionId: z.string().nullable(),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().max(4000),
  })).min(1).max(50),
  context: z.object({
    selected: z.object({
      lat: latSchema,
      lon: lonSchema,
      label: z.string().nullable(),
    }),
    mode: modeSchema,
    horizonDays: horizonDaysSchema,
  }),
});

// ─── /api/risk/compare query ─────────────────────────────────
export const riskCompareQuerySchema = z.object({
  lat1: latSchema,
  lon1: lonSchema,
  lat2: latSchema,
  lon2: lonSchema,
  mode: modeSchema,
  horizonDays: horizonDaysSchema,
});

// ─── Response schemas (for OpenAPI docs) ─────────────────────
export const hazardMarkerSchema = z.object({
  id: z.string(),
  hazardType: hazardTypeSchema,
  lat: z.number(),
  lon: z.number(),
  severity: z.number().min(0).max(100),
  weight: z.number(),
  title: z.string(),
  updatedAt: z.string(),
  source: z.object({ name: z.string(), url: z.string() }),
  geometry: z.any().nullable(),
});

export const riskScoreResponseSchema = z.object({
  mode: z.enum(MODES),
  horizonDays: z.number(),
  location: z.object({ lat: z.number(), lon: z.number(), label: z.string().nullable() }),
  hazardRiskScore: z.number(),
  vulnerabilityScore: z.number(),
  impactScore: z.number(),
  confidence: z.enum(CONFIDENCE_LEVELS),
  perHazard: z.array(z.object({
    hazardType: hazardTypeSchema,
    score: z.number(),
    drivers: z.array(z.string()),
  })),
  notes: z.array(z.string()),
});
