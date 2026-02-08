# Disaster Map API

Backend proxy for NASA EONET natural disaster events. No auth or service account required.

## Run

```bash
cd api
npm install
node server.js
```

The API listens on `http://localhost:3001`.

## Run full app

1. Start the API: `cd api && node server.js`
2. Start the frontend: `npm run dev` (from project root)

The Vite dev server proxies `/api` to the backend.

## Endpoints

- `GET /eonet?bbox=minLon,maxLat,maxLon,minLat` – NASA EONET GeoJSON (60s cache)
- `GET /health` – Health check
