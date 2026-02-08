import type { HazardType } from '../../../shared/types/index.js';

/**
 * Seasonality Model
 * -----------------
 * Returns a base risk score (0-100) for a given hazard type,
 * month (1-12), and latitude. These are explainable heuristics
 * based on well-known seasonal patterns.
 *
 * Latitude bands:
 *   tropics:    -23.5 to 23.5
 *   subtropics: 23.5 to 40 / -23.5 to -40
 *   temperate:  40 to 60 / -40 to -60
 *   polar:      60+ / -60+
 */

type LatBand = 'tropics' | 'subtropics_n' | 'subtropics_s' | 'temperate_n' | 'temperate_s' | 'polar';

function getLatBand(lat: number): LatBand {
  const absLat = Math.abs(lat);
  if (absLat <= 23.5) return 'tropics';
  if (absLat <= 40) return lat > 0 ? 'subtropics_n' : 'subtropics_s';
  if (absLat <= 60) return lat > 0 ? 'temperate_n' : 'temperate_s';
  return 'polar';
}

/**
 * Wildfire seasonality:
 * - N. hemisphere subtropics/temperate: peaks Jun-Oct (dry season)
 * - S. hemisphere: peaks Dec-Mar
 * - Tropics: year-round moderate, slight dry season peaks
 */
const WILDFIRE_SEASON: Record<LatBand, number[]> = {
  tropics:       [30, 35, 35, 30, 25, 25, 30, 35, 40, 35, 30, 30],
  subtropics_n:  [10, 15, 20, 30, 45, 60, 70, 75, 65, 45, 25, 10],
  subtropics_s:  [60, 55, 45, 30, 15, 10, 10, 10, 15, 25, 40, 55],
  temperate_n:   [5, 10, 15, 25, 40, 55, 65, 70, 55, 35, 15, 5],
  temperate_s:   [55, 50, 40, 25, 10, 5, 5, 5, 10, 20, 35, 50],
  polar:         [2, 2, 5, 10, 20, 35, 40, 35, 20, 10, 3, 2],
};

/**
 * Cyclone (tropical storm/hurricane) seasonality:
 * Based on basin-specific hurricane seasons.
 * Atlantic: Jun-Nov, peak Aug-Oct
 * W. Pacific: year-round, peak Jul-Nov
 * Tropics get year-round activity.
 */
const CYCLONE_SEASON: Record<LatBand, number[]> = {
  tropics:       [20, 15, 15, 20, 30, 40, 50, 55, 60, 50, 35, 25],
  subtropics_n:  [5, 5, 5, 10, 20, 40, 55, 65, 70, 55, 30, 10],
  subtropics_s:  [50, 55, 50, 35, 15, 5, 3, 3, 5, 10, 25, 40],
  temperate_n:   [3, 3, 5, 8, 12, 20, 25, 30, 35, 25, 15, 5],
  temperate_s:   [25, 30, 25, 15, 8, 3, 2, 2, 3, 5, 12, 20],
  polar:         [1, 1, 1, 1, 2, 2, 3, 3, 2, 2, 1, 1],
};

/**
 * Earthquake: not seasonal – return flat baseline.
 * We set moderate (20-30) everywhere since earthquakes are tectonic, not weather-dependent.
 * Actual risk is dominated by live data and plate boundary proximity.
 */
const EARTHQUAKE_BASE: Record<LatBand, number> = {
  tropics: 25,
  subtropics_n: 25,
  subtropics_s: 25,
  temperate_n: 20,
  temperate_s: 20,
  polar: 10,
};

/**
 * Flood seasonality:
 * Monsoon-driven in tropics, snowmelt + spring rains in temperate.
 */
const FLOOD_SEASON: Record<LatBand, number[]> = {
  tropics:       [25, 25, 30, 40, 50, 55, 60, 60, 55, 45, 35, 25],
  subtropics_n:  [15, 20, 30, 40, 45, 50, 55, 55, 45, 35, 20, 15],
  subtropics_s:  [50, 50, 45, 35, 20, 15, 10, 10, 15, 25, 35, 45],
  temperate_n:   [20, 25, 40, 50, 45, 35, 25, 20, 25, 30, 30, 20],
  temperate_s:   [25, 20, 20, 25, 30, 40, 45, 50, 45, 40, 30, 25],
  polar:         [5, 5, 10, 25, 40, 50, 45, 35, 25, 15, 8, 5],
};

/**
 * Tornado seasonality (primarily US/temperate N. hemisphere):
 * Peak: Mar-Jun in US. Minor second peak Oct-Nov.
 */
const TORNADO_SEASON: Record<LatBand, number[]> = {
  tropics:       [5, 5, 8, 10, 10, 8, 5, 5, 5, 8, 8, 5],
  subtropics_n:  [10, 15, 30, 45, 55, 50, 35, 25, 20, 25, 20, 10],
  subtropics_s:  [15, 10, 8, 10, 12, 15, 20, 25, 30, 25, 20, 15],
  temperate_n:   [8, 12, 25, 40, 55, 60, 45, 30, 20, 15, 12, 8],
  temperate_s:   [20, 15, 10, 8, 10, 15, 20, 25, 30, 35, 25, 20],
  polar:         [1, 1, 2, 5, 8, 10, 10, 8, 5, 3, 2, 1],
};

export interface SeasonalityResult {
  hazardType: HazardType;
  baseScore: number;
  driver: string; // human-readable explanation
}

/**
 * Get seasonal baseline risk for a specific hazard at a location and month.
 */
export function getSeasonalBaseline(
  hazardType: HazardType,
  lat: number,
  month: number, // 1-12
): SeasonalityResult {
  const band = getLatBand(lat);
  const monthIdx = Math.max(0, Math.min(11, month - 1));
  const hemisphere = lat >= 0 ? 'Northern' : 'Southern';

  let baseScore: number;
  let driver: string;

  switch (hazardType) {
    case 'wildfire':
      baseScore = WILDFIRE_SEASON[band][monthIdx];
      driver = `Wildfire seasonal baseline for ${band} (${hemisphere} hemisphere) in month ${month}: ${baseScore}/100`;
      break;
    case 'cyclone':
      baseScore = CYCLONE_SEASON[band][monthIdx];
      driver = `Cyclone seasonal baseline for ${band} (${hemisphere} hemisphere) in month ${month}: ${baseScore}/100`;
      break;
    case 'earthquake':
      baseScore = EARTHQUAKE_BASE[band];
      driver = `Earthquake risk is tectonic (non-seasonal). Baseline for ${band}: ${baseScore}/100`;
      break;
    case 'flood':
      baseScore = FLOOD_SEASON[band][monthIdx];
      driver = `Flood seasonal baseline for ${band} (${hemisphere} hemisphere) in month ${month}: ${baseScore}/100`;
      break;
    case 'tornado':
      baseScore = TORNADO_SEASON[band][monthIdx];
      driver = `Tornado seasonal baseline for ${band} (${hemisphere} hemisphere) in month ${month}: ${baseScore}/100`;
      break;
    default:
      baseScore = 15;
      driver = `Generic hazard baseline: ${baseScore}/100`;
  }

  return { hazardType, baseScore, driver };
}

/**
 * Get all hazard seasonal baselines for a location.
 */
export function getAllSeasonalBaselines(lat: number, month: number): SeasonalityResult[] {
  const types: HazardType[] = ['wildfire', 'earthquake', 'cyclone', 'flood', 'tornado'];
  return types.map(t => getSeasonalBaseline(t, lat, month));
}
