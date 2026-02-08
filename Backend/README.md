# Harbor Backend 🌊

Production backend for **Harbor** — a disaster safety platform providing real-time hazard intelligence, risk scoring, AI-powered chat, news feeds, and aid/shelter discovery. Built for a 24-36 hour hackathon.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Lovable Frontend                          │
│   Home • Map+Chat • Aid & Resources • News                  │
└────────────────────────┬────────────────────────────────────┘
                         │ REST JSON
┌────────────────────────▼────────────────────────────────────┐
│              API Gateway (/api)  — Fastify                   │
│              CORS · Rate Limit · Swagger                     │
├──────────────┬──────────────────┬───────────────────────────┤
│ Subsystem A  │   Subsystem B    │      Subsystem C          │
│ Hazard Intel │ Risk & Prediction│  AI + News + Aid          │
│              │                  │                           │
│ • USGS       │ • Seasonality    │ • Gemini chat             │
│ • NASA FIRMS │ • Weather fusion │ • Featherless preprocess  │
│ • NASA EONET │ • Live scoring   │ • GDELT news              │
│ • DynamoDB   │ • Prediction     │ • Google Places / mock    │
│ • S3 archive │ • Vulnerability  │ • Prompt guardrails       │
└──────────────┴──────────────────┴───────────────────────────┘
         │              │                    │
    DynamoDB        Open-Meteo          Gemini API
    S3 Bucket       Subsystem A         Featherless API
    EventBridge     (marker query)      GDELT / Places
```

Three independent subsystems communicate only through shared types and HTTP interfaces.

## Quick Start (Local Dev)

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — at minimum set GEMINI_API_KEY and FEATHERLESS_API_KEY

# 3. Start dev server
npm run dev
# Server at http://localhost:3001
# Swagger docs at http://localhost:3001/api/docs

# 4. Run tests
npm test
```

## API Keys — Where to Get Them

| Key | Source | Cost | Required? |
|-----|--------|------|-----------|
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/app/apikey) | Free tier generous | **Yes** (chat) |
| `FEATHERLESS_API_KEY` | [Featherless.ai](https://featherless.ai) | Free tier available | **Yes** (preprocessing) |
| `FIRMS_API_KEY` | [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/api/area/) | Free | **Yes** (wildfires) |
| `GOOGLE_PLACES_API_KEY` | [Google Cloud Console](https://console.cloud.google.com/) | $17/1K requests | No (mock fallback) |

Free data sources (no key needed): USGS earthquakes, NASA EONET events, Open-Meteo weather, GDELT news.

## Endpoints

All endpoints return JSON. Base URL: `/api`

### Health & Home
```bash
# Health check
curl http://localhost:3001/api/health

# News carousel (5-10 items for home screen)
curl "http://localhost:3001/api/home/carousel?lat=34.05&lon=-118.25"
```

### Hazard Markers (Subsystem A)
```bash
# Get markers in bounding box (live mode)
curl "http://localhost:3001/api/hazards/markers?bbox=-120,30,-110,40&types=wildfire,earthquake&sinceHours=48&mode=live"

# Get markers (prediction mode, 7-day horizon)
curl "http://localhost:3001/api/hazards/markers?bbox=-120,30,-110,40&mode=prediction&horizonDays=7"

# Global hotspots (top 5 by severity, last 24h)
curl http://localhost:3001/api/hazards/hotspots
```

### Risk Scoring (Subsystem B)
```bash
# Live risk score for Los Angeles, 50km radius
curl "http://localhost:3001/api/risk/score?lat=34.05&lon=-118.25&radiusKm=50&mode=live"

# Prediction risk score, 30-day horizon
curl "http://localhost:3001/api/risk/score?lat=34.05&lon=-118.25&radiusKm=50&mode=prediction&horizonDays=30"

# Compare two locations
curl "http://localhost:3001/api/risk/compare?lat1=34.05&lon1=-118.25&lat2=25.76&lon2=-80.19&mode=prediction&horizonDays=7"

# Weather data
curl "http://localhost:3001/api/weather?lat=34.05&lon=-118.25&mode=live"
curl "http://localhost:3001/api/weather?lat=34.05&lon=-118.25&mode=forecast&days=7"
```

### News (Subsystem C)
```bash
# Global news feed with pagination
curl "http://localhost:3001/api/news/global?limit=20&types=wildfire,flood"

# Local news near coordinates
curl "http://localhost:3001/api/news/local?lat=34.05&lon=-118.25&radiusKm=100&limit=20"
```

### Aid & Shelters (Subsystem C)
```bash
# Nearby shelters/resources
curl "http://localhost:3001/api/aid/nearby?lat=34.05&lon=-118.25&radiusKm=25&limit=10"

# Global aid hub (curated organizations)
curl http://localhost:3001/api/aid/hub
```

### AI Chat (Subsystem C)
```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": null,
    "messages": [{"role": "user", "content": "What are the wildfire risks near Los Angeles right now?"}],
    "context": {
      "selected": {"lat": 34.05, "lon": -118.25, "label": "Los Angeles"},
      "mode": "live",
      "horizonDays": 7
    }
  }'
```

## AWS Deployment (SST v3)

### Prerequisites
- AWS CLI configured with credentials
- Node.js 20+
- SST v3 (`npx sst@latest`)

### Set Secrets
```bash
npx sst secret set GeminiApiKey YOUR_KEY
npx sst secret set FeatherlessApiKey YOUR_KEY
npx sst secret set FirmsApiKey YOUR_KEY
npx sst secret set GooglePlacesApiKey YOUR_KEY  # optional
```

### Deploy
```bash
# Dev stage
npm run deploy:dev

# Production
npm run deploy:prod
```

### What Gets Deployed
- **API Gateway HTTP API** — single base URL for all endpoints
- **Lambda: ApiHandler** — Fastify app serving all routes (30s timeout, 512MB)
- **Lambda: IngestHandler** — scheduled hazard data ingestion (120s timeout)
- **DynamoDB: HazardsTable** — hazard markers with geohash keys + TTL
- **DynamoDB: CacheTable** — response caching
- **S3: SnapshotsBucket** — raw data archival
- **EventBridge: Cron** — triggers ingestion every 15 minutes

## Project Structure

```
harbor/
├── package.json
├── tsconfig.json
├── sst.config.ts                    # AWS infrastructure
├── .env.example
│
├── shared/                          # Shared contracts (all subsystems import)
│   ├── config.ts                    # Env validation (Zod)
│   ├── types/index.ts               # HazardMarker, RiskScoreResponse, NewsItem, etc.
│   ├── schemas/index.ts             # Zod request/response schemas
│   └── utils/index.ts               # haversine, geohash, fetchJson, logger
│
├── src/
│   ├── server.ts                    # Fastify bootstrap
│   ├── lambda.ts                    # AWS Lambda handler
│   ├── ingestHandler.ts             # EventBridge scheduled ingestion
│   ├── gateway/
│   │   └── routes.ts                # Thin router wiring all subsystems
│   │
│   ├── subsystemA/                  # ── Hazard Intelligence Service ──
│   │   ├── adapters/
│   │   │   ├── usgsAdapter.ts       # USGS earthquake GeoJSON
│   │   │   ├── firmsAdapter.ts      # NASA FIRMS wildfire CSV
│   │   │   └── eonetAdapter.ts      # NASA EONET multi-hazard events
│   │   ├── models/
│   │   │   ├── hazardStore.ts       # DynamoDB read/write
│   │   │   └── snapshotWriter.ts    # S3 archival
│   │   ├── ingestion/
│   │   │   └── ingestAll.ts         # Orchestrates all adapters
│   │   └── routes/
│   │       └── hazardRoutes.ts      # /hazards/markers, /hazards/hotspots
│   │
│   ├── subsystemB/                  # ── Risk & Prediction Engine ──
│   │   ├── seasonality/
│   │   │   └── tables.ts            # Month/latitude risk baselines
│   │   ├── weather/
│   │   │   └── openMeteo.ts         # Open-Meteo client + weather adjustments
│   │   ├── scoring/
│   │   │   └── riskEngine.ts        # Live + prediction scoring
│   │   └── routes/
│   │       └── riskRoutes.ts        # /risk/score, /weather, /risk/compare
│   │
│   └── subsystemC/                  # ── AI + News + Aid Service ──
│       ├── ai/
│       │   ├── geminiClient.ts      # Google Gemini wrapper
│       │   └── featherlessClient.ts # Featherless/OpenAI-compatible wrapper
│       ├── news/
│       │   └── gdeltProvider.ts     # GDELT 2.1 + mock fallback
│       ├── aid/
│       │   └── aidProvider.ts       # Google Places + mock provider
│       ├── chat/
│       │   └── chatService.ts       # Context assembly, guardrails, citations
│       └── routes/
│           └── newsAidChatRoutes.ts # /news/*, /aid/*, /chat, /home/carousel
│
└── tests/
    └── unit/
        └── subsystemB/
            └── scoring.test.ts      # Seasonality, scoring, weather tests
```

## Data Flow

### Map Marker Query
```
Frontend → GET /api/hazards/markers?bbox=...&mode=live
  → Subsystem A: queryMarkersByBbox()
  → DynamoDB geohash scan + type/time filters
  → Returns: { markers: HazardMarker[], generatedAt }
```

### Risk Score
```
Frontend → GET /api/risk/score?lat=...&lon=...&mode=prediction&horizonDays=7
  → Subsystem B:
    → Query Subsystem A for nearby markers
    → Seasonality baseline (month + latitude + hazard type)
    → Open-Meteo forecast adjustment (heat, wind, precip, storms)
    → Blend live pressure + prediction
    → Returns: { hazardRiskScore, perHazard[], confidence, notes[] }
```

### Chat
```
Frontend → POST /api/chat { messages, context: { lat, lon, mode } }
  → Subsystem C:
    → Featherless: preprocess (extract intent, location, hazard types)
    → Fetch context: risk score (B), nearby hazards (A), news, shelters
    → Build system prompt with all context
    → Gemini: generate response (fallback: Featherless)
    → Post-process: extract citations, generate actions, safety notes
    → Returns: { answer, actions, citations, safetyNotes }
```

## Live vs Prediction Mode

| Aspect | `mode=live` | `mode=prediction` |
|--------|------------|-------------------|
| Markers | Currently observed (last 48h) | Seasonal propensity zones |
| Risk score | Based on active nearby hazards | Seasonal baseline + forecast weather |
| Weather | Current conditions | 7-16 day forecast |
| Confidence | HIGH if many data points | Degrades with horizon length |

## Cost Control Tips

- **USGS, NASA EONET, Open-Meteo, GDELT**: All free, no API keys needed
- **NASA FIRMS**: Free API key, generous rate limits
- **Gemini**: Free tier = 60 req/min — sufficient for hackathon
- **Featherless**: Free tier available
- **Google Places**: Set `AID_MODE=mock` to avoid costs entirely
- **DynamoDB**: On-demand pricing, TTL auto-cleans stale data
- **Lambda**: Pay-per-invocation, negligible at hackathon scale

## Safety Guarantees

1. **No fabricated addresses** — mock shelter provider returns `address: null`, only verified names + links
2. **Citation enforcement** — chat only cites URLs from news provider results
3. **Prompt injection defense** — regex detection + news text sanitization
4. **Emergency detection** — advises calling 911/112 if user appears in danger
5. **Confidence labeling** — all predictions labeled LOW/MED/HIGH with explanations
6. **Data attribution** — every marker and news item includes source name + URL

## Team Workflow (3 Backend Devs)

- **Dev A**: Subsystem A (`src/subsystemA/`) — hazard data ingestion, adapters, DynamoDB
- **Dev B**: Subsystem B (`src/subsystemB/`) — risk scoring, seasonality, weather
- **Dev C**: Subsystem C (`src/subsystemC/`) — chat, news, aid, AI clients

Each dev works independently. Shared contracts in `/shared` are the integration boundary. The gateway router in `src/gateway/routes.ts` wires everything together.

## License

MIT
