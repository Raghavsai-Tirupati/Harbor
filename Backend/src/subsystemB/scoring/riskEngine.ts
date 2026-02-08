import { haversineKm, normalizeScore, clamp, logger } from '../../../shared/utils/index.js';
import { getSeasonalBaseline, getAllSeasonalBaselines } from '../seasonality/tables.js';
import { fetchForecastWeather, computeWeatherAdjustment } from '../weather/openMeteo.js';
import type {
  HazardMarker, HazardType, Mode, ConfidenceLevel,
  PerHazardScore, RiskScoreResponse,
} from '../../../shared/types/index.js';

const ALL_HAZARD_TYPES: HazardType[] = ['wildfire', 'earthquake', 'cyclone', 'flood', 'tornado'];

// ─── Vulnerability Heuristic (MVP) ──────────────────────────
/**
 * Coarse global vulnerability estimate based on latitude/longitude.
 * In production, replace with population density / infrastructure index.
 */
function estimateVulnerability(lat: number, lon: number): { score: number; confidence: ConfidenceLevel; note: string } {
  // Very rough heuristic: populated latitudes (20-50° N/S) get higher vulnerability
  const absLat = Math.abs(lat);
  let score: number;
  if (absLat < 5) score = 50;           // equatorial – moderate population
  else if (absLat < 35) score = 60;     // subtropics – generally populated
  else if (absLat < 55) score = 55;     // temperate – developed but variable
  else score = 25;                      // polar – sparse population

  return {
    score: normalizeScore(score),
    confidence: 'LOW',
    note: 'Vulnerability based on coarse latitude proxy. No population/infrastructure dataset loaded.',
  };
}

// ─── Live Risk Scoring ──────────────────────────────────────

/**
 * Compute current hazard pressure from nearby markers.
 * Returns per-hazard scores based on count, severity, and proximity.
 */
function computeLiveHazardPressure(
  markers: HazardMarker[],
  lat: number,
  lon: number,
  radiusKm: number,
): PerHazardScore[] {
  const byType = new Map<HazardType, HazardMarker[]>();

  for (const m of markers) {
    const dist = haversineKm(lat, lon, m.lat, m.lon);
    if (dist <= radiusKm) {
      const arr = byType.get(m.hazardType) || [];
      arr.push(m);
      byType.set(m.hazardType, arr);
    }
  }

  return ALL_HAZARD_TYPES.map((type): PerHazardScore => {
    const nearby = byType.get(type) || [];
    if (nearby.length === 0) {
      return { hazardType: type, score: 0, drivers: ['No active events nearby'] };
    }

    // Score based on: max severity * proximity decay + count bonus
    let maxProxScore = 0;
    const drivers: string[] = [];

    for (const m of nearby) {
      const dist = haversineKm(lat, lon, m.lat, m.lon);
      const proximityFactor = Math.max(0, 1 - dist / radiusKm);
      const proxScore = m.severity * proximityFactor;
      if (proxScore > maxProxScore) maxProxScore = proxScore;
    }

    // Count bonus: more events = higher risk
    const countBonus = Math.min(20, nearby.length * 3);
    const avgSeverity = nearby.reduce((s, m) => s + m.severity, 0) / nearby.length;

    const score = normalizeScore(maxProxScore * 0.6 + avgSeverity * 0.2 + countBonus);

    drivers.push(`${nearby.length} active ${type} event(s) within ${radiusKm}km`);
    drivers.push(`Highest proximity-weighted severity: ${Math.round(maxProxScore)}`);
    if (countBonus > 5) drivers.push(`Multiple concurrent events add ${countBonus} to score`);

    return { hazardType: type, score, drivers };
  });
}

/**
 * Compute live risk score.
 */
export function computeLiveRiskScore(
  markers: HazardMarker[],
  lat: number,
  lon: number,
  radiusKm: number,
): Omit<RiskScoreResponse, 'mode' | 'horizonDays' | 'location'> {
  const perHazard = computeLiveHazardPressure(markers, lat, lon, radiusKm);
  const vulnerability = estimateVulnerability(lat, lon);

  // Overall hazard risk = weighted max of per-hazard scores
  const hazardScores = perHazard.map(h => h.score).filter(s => s > 0);
  const hazardRiskScore = hazardScores.length > 0
    ? normalizeScore(
      Math.max(...hazardScores) * 0.7 +
      (hazardScores.reduce((a, b) => a + b, 0) / hazardScores.length) * 0.3
    )
    : 0;

  // Impact = hazard × vulnerability interaction
  const impactScore = normalizeScore(hazardRiskScore * 0.6 + vulnerability.score * 0.4);

  // Confidence: HIGH if we have markers, MED if some data, LOW if nothing
  const totalMarkers = markers.filter(m => haversineKm(lat, lon, m.lat, m.lon) <= radiusKm * 2).length;
  const confidence: ConfidenceLevel = totalMarkers > 10 ? 'HIGH' : totalMarkers > 0 ? 'MED' : 'LOW';

  const notes: string[] = [];
  if (hazardRiskScore === 0) notes.push('No active hazard events detected in radius');
  notes.push(vulnerability.note);
  if (confidence === 'LOW') notes.push('Low data density in this area — confidence is limited');

  return {
    hazardRiskScore,
    vulnerabilityScore: vulnerability.score,
    impactScore,
    confidence,
    perHazard,
    notes,
  };
}

// ─── Prediction Risk Scoring ────────────────────────────────

/**
 * Compute predicted risk using seasonality + weather forecast adjustments.
 */
export async function computePredictionRiskScore(
  markers: HazardMarker[],
  lat: number,
  lon: number,
  radiusKm: number,
  horizonDays: number,
  monthOverride?: number,
): Promise<Omit<RiskScoreResponse, 'mode' | 'horizonDays' | 'location'>> {
  const month = monthOverride || new Date().getMonth() + 1;
  const vulnerability = estimateVulnerability(lat, lon);
  const seasonalBaselines = getAllSeasonalBaselines(lat, month);

  // Get weather forecast adjustment for short-term predictions
  let weatherAdj = { heatStress: 0, windRisk: 0, precipRisk: 0, stormRisk: 0, explanation: 'No forecast data' };
  if (horizonDays <= 7) {
    try {
      const forecast = await fetchForecastWeather(lat, lon, Math.min(horizonDays, 7));
      weatherAdj = computeWeatherAdjustment(forecast);
    } catch (err) {
      logger.warn({ err }, 'Weather forecast fetch failed for prediction');
    }
  }

  // Also factor in current live hazard pressure (recent events indicate ongoing risk)
  const livePressure = computeLiveHazardPressure(markers, lat, lon, radiusKm);

  const perHazard: PerHazardScore[] = ALL_HAZARD_TYPES.map((type) => {
    const seasonal = seasonalBaselines.find(s => s.hazardType === type)!;
    const live = livePressure.find(l => l.hazardType === type)!;

    let score = seasonal.baseScore;
    const drivers: string[] = [seasonal.driver];

    // Blend live data: if there are active events, increase prediction
    if (live.score > 0) {
      const liveBoost = live.score * 0.3; // Damped live contribution
      score += liveBoost;
      drivers.push(`Active events nearby add +${Math.round(liveBoost)} to prediction`);
    }

    // Weather adjustments per hazard type
    if (type === 'wildfire') {
      score += weatherAdj.heatStress * 0.5 + weatherAdj.windRisk * 0.3;
      if (weatherAdj.heatStress > 0) drivers.push(`Heat stress: +${Math.round(weatherAdj.heatStress * 0.5)}`);
    } else if (type === 'flood') {
      score += weatherAdj.precipRisk * 0.6;
      if (weatherAdj.precipRisk > 0) drivers.push(`Precip risk: +${Math.round(weatherAdj.precipRisk * 0.6)}`);
    } else if (type === 'tornado' || type === 'cyclone') {
      score += weatherAdj.stormRisk * 0.5 + weatherAdj.windRisk * 0.3;
      if (weatherAdj.stormRisk > 0) drivers.push(`Storm activity: +${Math.round(weatherAdj.stormRisk * 0.5)}`);
    }

    // Horizon scaling: longer horizons have higher uncertainty
    if (horizonDays > 7) {
      const horizonScale = 1 + (horizonDays - 7) / 90 * 0.3;
      score *= horizonScale;
      drivers.push(`${horizonDays}-day horizon applies ${Math.round((horizonScale - 1) * 100)}% uncertainty uplift`);
    }

    return {
      hazardType: type,
      score: normalizeScore(score),
      drivers,
    };
  });

  const hazardScores = perHazard.map(h => h.score).filter(s => s > 0);
  const hazardRiskScore = hazardScores.length > 0
    ? normalizeScore(
      Math.max(...hazardScores) * 0.6 +
      (hazardScores.reduce((a, b) => a + b, 0) / ALL_HAZARD_TYPES.length) * 0.4
    )
    : 0;

  const impactScore = normalizeScore(hazardRiskScore * 0.6 + vulnerability.score * 0.4);

  // Confidence degrades with horizon
  let confidence: ConfidenceLevel;
  if (horizonDays <= 7 && weatherAdj.explanation !== 'No forecast data') {
    confidence = 'MED';
  } else if (horizonDays <= 30) {
    confidence = 'LOW';
  } else {
    confidence = 'LOW';
  }

  const notes: string[] = [];
  notes.push(`Prediction for ${horizonDays}-day horizon, month ${month}`);
  if (weatherAdj.explanation !== 'No forecast data' && horizonDays <= 7) {
    notes.push(`Weather adjustment: ${weatherAdj.explanation}`);
  }
  if (horizonDays > 7) {
    notes.push('Forecast weather not available beyond 7 days; using seasonal baselines only');
  }
  notes.push(vulnerability.note);

  return {
    hazardRiskScore,
    vulnerabilityScore: vulnerability.score,
    impactScore,
    confidence,
    perHazard,
    notes,
  };
}
