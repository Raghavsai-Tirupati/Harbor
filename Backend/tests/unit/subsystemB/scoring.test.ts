import { describe, it, expect } from 'vitest';
import { computeLiveRiskScore } from '@subsystemB/scoring/riskEngine';
import { getSeasonalBaseline, getAllSeasonalBaselines } from '@subsystemB/seasonality/tables';
import type { HazardMarker } from '@shared/types/index';

// ─── Seasonality Tests ───────────────────────────────────────
describe('Seasonality Tables', () => {
  it('returns higher wildfire risk in summer for Northern subtropics', () => {
    const july = getSeasonalBaseline('wildfire', 35, 7); // July, ~35°N
    const january = getSeasonalBaseline('wildfire', 35, 1);
    expect(july.baseScore).toBeGreaterThan(january.baseScore);
    expect(july.driver).toContain('Wildfire');
  });

  it('returns higher cyclone risk in Sep for North Atlantic', () => {
    const sep = getSeasonalBaseline('cyclone', 25, 9); // September, ~25°N
    const feb = getSeasonalBaseline('cyclone', 25, 2);
    expect(sep.baseScore).toBeGreaterThan(feb.baseScore);
  });

  it('earthquake risk is non-seasonal (flat)', () => {
    const jan = getSeasonalBaseline('earthquake', 40, 1);
    const jul = getSeasonalBaseline('earthquake', 40, 7);
    expect(jan.baseScore).toBe(jul.baseScore);
  });

  it('returns all 5 hazard types for getAllSeasonalBaselines', () => {
    const all = getAllSeasonalBaselines(40, 6);
    expect(all).toHaveLength(5);
    expect(all.map((a: { hazardType: string }) => a.hazardType)).toEqual(
      expect.arrayContaining(['wildfire', 'earthquake', 'cyclone', 'flood', 'tornado'])
    );
  });

  it('Southern hemisphere has opposite seasonality', () => {
    const nJuly = getSeasonalBaseline('wildfire', 35, 7);
    const sJuly = getSeasonalBaseline('wildfire', -35, 7);
    // In July, N should be higher (summer) than S (winter)
    expect(nJuly.baseScore).toBeGreaterThan(sJuly.baseScore);
  });
});

// ─── Live Risk Scoring Tests ─────────────────────────────────
describe('Live Risk Scoring', () => {
  const makeMarker = (overrides: Partial<HazardMarker> = {}): HazardMarker => ({
    id: 'test-1',
    hazardType: 'earthquake',
    lat: 34.05,
    lon: -118.25,
    severity: 60,
    weight: 5,
    title: 'Test quake',
    updatedAt: new Date().toISOString(),
    source: { name: 'test', url: 'http://test.com' },
    geometry: null,
    ...overrides,
  });

  it('returns zero hazard risk when no markers are nearby', () => {
    const result = computeLiveRiskScore([], 34.05, -118.25, 50);
    expect(result.hazardRiskScore).toBe(0);
    expect(result.confidence).toBe('LOW');
  });

  it('returns positive risk when markers are within radius', () => {
    const markers = [
      makeMarker({ severity: 70, lat: 34.06, lon: -118.24 }),
    ];
    const result = computeLiveRiskScore(markers, 34.05, -118.25, 50);
    expect(result.hazardRiskScore).toBeGreaterThan(0);
    expect(result.perHazard.find(h => h.hazardType === 'earthquake')!.score).toBeGreaterThan(0);
  });

  it('higher severity markers produce higher scores', () => {
    const lowSev = computeLiveRiskScore(
      [makeMarker({ severity: 20 })], 34.05, -118.25, 50
    );
    const highSev = computeLiveRiskScore(
      [makeMarker({ severity: 90 })], 34.05, -118.25, 50
    );
    expect(highSev.hazardRiskScore).toBeGreaterThan(lowSev.hazardRiskScore);
  });

  it('multiple markers increase the count bonus', () => {
    const single = computeLiveRiskScore(
      [makeMarker({ severity: 50 })], 34.05, -118.25, 50
    );
    const multi = computeLiveRiskScore(
      [
        makeMarker({ id: 'a', severity: 50, lat: 34.06 }),
        makeMarker({ id: 'b', severity: 50, lat: 34.04 }),
        makeMarker({ id: 'c', severity: 50, lat: 34.07 }),
      ],
      34.05, -118.25, 50
    );
    expect(multi.hazardRiskScore).toBeGreaterThanOrEqual(single.hazardRiskScore);
  });

  it('scores are clamped between 0 and 100', () => {
    const result = computeLiveRiskScore(
      Array.from({ length: 20 }, (_: unknown, i: number) =>
        makeMarker({ id: `q-${i}`, severity: 100, lat: 34.05 + i * 0.001 })
      ),
      34.05, -118.25, 50
    );
    expect(result.hazardRiskScore).toBeGreaterThanOrEqual(0);
    expect(result.hazardRiskScore).toBeLessThanOrEqual(100);
    expect(result.vulnerabilityScore).toBeGreaterThanOrEqual(0);
    expect(result.vulnerabilityScore).toBeLessThanOrEqual(100);
  });

  it('includes vulnerability assessment', () => {
    const result = computeLiveRiskScore([], 34.05, -118.25, 50);
    expect(result.vulnerabilityScore).toBeGreaterThan(0);
    expect(result.notes).toContain(expect.stringContaining('Vulnerability'));
  });

  it('generates per-hazard driver explanations', () => {
    const markers = [makeMarker({ severity: 70 })];
    const result = computeLiveRiskScore(markers, 34.05, -118.25, 50);
    const eqScore = result.perHazard.find((h) => h.hazardType === 'earthquake')!;
    expect(eqScore.drivers.length).toBeGreaterThan(0);
    expect(eqScore.drivers[0]).toContain('event');
  });
});

// ─── Weather Adjustment Tests ────────────────────────────────
describe('Weather Adjustments', () => {
  it('computeWeatherAdjustment handles empty data', async () => {
    const { computeWeatherAdjustment } = await import('@subsystemB/weather/openMeteo');
    const result = computeWeatherAdjustment([]);
    expect(result.heatStress).toBe(0);
    expect(result.windRisk).toBe(0);
    expect(result.precipRisk).toBe(0);
    expect(result.stormRisk).toBe(0);
  });

  it('detects heat stress for extreme temperatures', async () => {
    const { computeWeatherAdjustment } = await import('@subsystemB/weather/openMeteo');
    const result = computeWeatherAdjustment([
      {
        time: '2024-01-01T12:00', temperature: 42, windSpeed: 10,
        humidity: 20, precipitationProbability: 5, weatherCode: 0,
      } as any,
    ]);
    expect(result.heatStress).toBeGreaterThan(0);
    expect(result.explanation).toContain('heat');
  });

  it('detects wind risk for high winds', async () => {
    const { computeWeatherAdjustment } = await import('@subsystemB/weather/openMeteo');
    const result = computeWeatherAdjustment([
      {
        time: '2024-01-01T12:00', temperature: 20, windSpeed: 80,
        humidity: 50, precipitationProbability: 30, weatherCode: 0,
      } as any,
    ]);
    expect(result.windRisk).toBeGreaterThan(0);
  });
});
