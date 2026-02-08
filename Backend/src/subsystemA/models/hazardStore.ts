import {
  DynamoDBClient,
  CreateTableCommand,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  BatchWriteCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { getEnv } from '../../../shared/config.js';
import { logger, geohashEncode } from '../../../shared/utils/index.js';
import type { HazardMarker } from '../../../shared/types/index.js';

let _client: DynamoDBDocumentClient | null = null;

function getClient(): DynamoDBDocumentClient {
  if (_client) return _client;
  const raw = new DynamoDBClient({ region: getEnv().AWS_REGION });
  _client = DynamoDBDocumentClient.from(raw, {
    marshallOptions: { removeUndefinedValues: true },
  });
  return _client;
}

function tableName(): string {
  return getEnv().DDB_TABLE_HAZARDS;
}

/**
 * DynamoDB schema:
 *   PK = GEOHASH#<geohash5>
 *   SK = <hazardType>#<updatedAt>#<id>
 *   GSI1PK = HAZARD#<hazardType>
 *   GSI1SK = <updatedAt>
 *   TTL = expiresAt (epoch seconds, 7 days from ingestion)
 */
interface HazardRow {
  PK: string;
  SK: string;
  GSI1PK: string;
  GSI1SK: string;
  id: string;
  hazardType: string;
  lat: number;
  lon: number;
  severity: number;
  weight: number;
  title: string;
  updatedAt: string;
  sourceName: string;
  sourceUrl: string;
  geometry: any;
  expiresAt: number;
}

function markerToRow(m: HazardMarker): HazardRow {
  const gh = geohashEncode(m.lat, m.lon, 5);
  const ttl = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;
  return {
    PK: `GEOHASH#${gh}`,
    SK: `${m.hazardType}#${m.updatedAt}#${m.id}`,
    GSI1PK: `HAZARD#${m.hazardType}`,
    GSI1SK: m.updatedAt,
    id: m.id,
    hazardType: m.hazardType,
    lat: m.lat,
    lon: m.lon,
    severity: m.severity,
    weight: m.weight,
    title: m.title,
    updatedAt: m.updatedAt,
    sourceName: m.source.name,
    sourceUrl: m.source.url,
    geometry: m.geometry ? JSON.stringify(m.geometry) : null,
    expiresAt: ttl,
  };
}

function rowToMarker(row: any): HazardMarker {
  return {
    id: row.id,
    hazardType: row.hazardType as any,
    lat: row.lat,
    lon: row.lon,
    severity: row.severity,
    weight: row.weight,
    title: row.title,
    updatedAt: row.updatedAt,
    source: { name: row.sourceName, url: row.sourceUrl },
    geometry: row.geometry ? JSON.parse(row.geometry) : null,
  };
}

// ─── Write Markers ───────────────────────────────────────────
export async function putMarkers(markers: HazardMarker[]): Promise<number> {
  const client = getClient();
  const table = tableName();
  let written = 0;

  // Batch write in groups of 25 (DDB limit)
  for (let i = 0; i < markers.length; i += 25) {
    const batch = markers.slice(i, i + 25);
    const items = batch.map(m => ({
      PutRequest: { Item: markerToRow(m) },
    }));

    try {
      await client.send(new BatchWriteCommand({
        RequestItems: { [table]: items },
      }));
      written += batch.length;
    } catch (err) {
      logger.error({ err, batch: i }, 'DynamoDB batch write failed');
    }
  }

  return written;
}

// ─── Query Markers by Bbox ──────────────────────────────────
/**
 * For MVP, we do a scan with filter (small dataset).
 * In production, use geohash prefix queries for efficiency.
 */
export async function queryMarkersByBbox(params: {
  bbox: [number, number, number, number];
  types?: string[];
  sinceHours: number;
}): Promise<HazardMarker[]> {
  const client = getClient();
  const table = tableName();
  const { bbox, types, sinceHours } = params;
  const sinceIso = new Date(Date.now() - sinceHours * 3600 * 1000).toISOString();

  try {
    const result = await client.send(new ScanCommand({
      TableName: table,
      FilterExpression: '#lat BETWEEN :minLat AND :maxLat AND #lon BETWEEN :minLon AND :maxLon AND #updatedAt >= :sinceIso',
      ExpressionAttributeNames: {
        '#lat': 'lat',
        '#lon': 'lon',
        '#updatedAt': 'updatedAt',
      },
      ExpressionAttributeValues: {
        ':minLat': bbox[1],
        ':maxLat': bbox[3],
        ':minLon': bbox[0],
        ':maxLon': bbox[2],
        ':sinceIso': sinceIso,
      },
    }));

    let markers = (result.Items || []).map(rowToMarker);

    if (types && types.length > 0) {
      markers = markers.filter(m => types.includes(m.hazardType));
    }

    return markers;
  } catch (err) {
    logger.error({ err }, 'DynamoDB scan failed');
    return [];
  }
}

// ─── Query All Recent (for hotspots/scoring) ─────────────────
export async function queryRecentMarkers(sinceHours: number): Promise<HazardMarker[]> {
  const client = getClient();
  const table = tableName();
  const sinceIso = new Date(Date.now() - sinceHours * 3600 * 1000).toISOString();

  try {
    const result = await client.send(new ScanCommand({
      TableName: table,
      FilterExpression: '#updatedAt >= :sinceIso',
      ExpressionAttributeNames: { '#updatedAt': 'updatedAt' },
      ExpressionAttributeValues: { ':sinceIso': sinceIso },
    }));
    return (result.Items || []).map(rowToMarker);
  } catch (err) {
    logger.error({ err }, 'DynamoDB scan (recent) failed');
    return [];
  }
}

// ─── Query Markers Near Point ────────────────────────────────
export async function queryMarkersNear(lat: number, lon: number, radiusKm: number, sinceHours = 48): Promise<HazardMarker[]> {
  // Quick bbox approximation for radius
  const dLat = radiusKm / 111;
  const dLon = radiusKm / (111 * Math.cos(lat * Math.PI / 180));
  const bbox: [number, number, number, number] = [
    lon - dLon, lat - dLat, lon + dLon, lat + dLat,
  ];
  return queryMarkersByBbox({ bbox, sinceHours });
}
