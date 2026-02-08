import { describe, it, expect } from 'vitest';

/**
 * Integration smoke tests — require a running local server.
 * Run: npm run dev  (in another terminal)
 * Then: npm run test:integration
 */
const BASE = process.env.API_BASE_URL || 'http://localhost:3001';

describe('API Health', () => {
  it('GET /api/health returns 200', async () => {
    const res = await fetch(`${BASE}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });
});

describe('Hazard Markers', () => {
  it('GET /api/hazards/markers returns markers array', async () => {
    const res = await fetch(
      `${BASE}/api/hazards/markers?bbox=-120,30,-110,40&mode=live&sinceHours=48`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('markers');
    expect(Array.isArray(body.markers)).toBe(true);
    expect(body).toHaveProperty('mode', 'live');
  });

  it('GET /api/hazards/hotspots returns hotspots', async () => {
    const res = await fetch(`${BASE}/api/hazards/hotspots`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('hotspots');
  });
});

describe('Risk Score', () => {
  it('GET /api/risk/score returns valid score shape', async () => {
    const res = await fetch(
      `${BASE}/api/risk/score?lat=34.05&lon=-118.25&radiusKm=50&mode=prediction&horizonDays=7`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('hazardRiskScore');
    expect(body).toHaveProperty('vulnerabilityScore');
    expect(body).toHaveProperty('impactScore');
    expect(body).toHaveProperty('confidence');
    expect(body.hazardRiskScore).toBeGreaterThanOrEqual(0);
    expect(body.hazardRiskScore).toBeLessThanOrEqual(100);
  });

  it('GET /api/weather returns weather data', async () => {
    const res = await fetch(
      `${BASE}/api/weather?lat=34.05&lon=-118.25&mode=forecast&days=7`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('lat');
  });
});

describe('News & Aid', () => {
  it('GET /api/home/carousel returns carousel items', async () => {
    const res = await fetch(
      `${BASE}/api/home/carousel?lat=34.05&lon=-118.25`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('items');
  });

  it('GET /api/aid/hub returns aid resources', async () => {
    const res = await fetch(`${BASE}/api/aid/hub`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('items');
  });
});

describe('Chat', () => {
  it('POST /api/chat returns answer', async () => {
    const res = await fetch(`${BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'test-session-1',
        messages: [{ role: 'user', content: 'What are the current wildfire risks in LA?' }],
        context: { selected: { lat: 34.05, lon: -118.25, label: 'Los Angeles' }, mode: 'live', horizonDays: 7 },
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('sessionId');
    expect(body).toHaveProperty('answer');
    expect(typeof body.answer).toBe('string');
  });
});
