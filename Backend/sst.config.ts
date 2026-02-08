/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "harbor",
      removal: input?.stage === "prod" ? "retain" : "remove",
      home: "aws",
      providers: { aws: { region: "us-east-1" } },
    };
  },
  async run() {
    // ── DynamoDB Tables ──────────────────────────────────────
    const hazardsTable = new sst.aws.Dynamo("HazardsTable", {
      fields: {
        PK: "string",
        SK: "string",
        GSI1PK: "string",
        GSI1SK: "string",
      },
      primaryIndex: { hashKey: "PK", rangeKey: "SK" },
      globalIndexes: {
        GSI1: { hashKey: "GSI1PK", rangeKey: "GSI1SK" },
      },
      ttl: "expiresAt",
    });

    const cacheTable = new sst.aws.Dynamo("CacheTable", {
      fields: {
        PK: "string",
        SK: "string",
      },
      primaryIndex: { hashKey: "PK", rangeKey: "SK" },
      ttl: "expiresAt",
    });

    // ── S3 Bucket ────────────────────────────────────────────
    const snapshotsBucket = new sst.aws.Bucket("SnapshotsBucket");

    // ── Shared environment variables ─────────────────────────
    const sharedEnv = {
      NODE_ENV: $app.stage === "prod" ? "production" : "development",
      DDB_TABLE_HAZARDS: hazardsTable.name,
      DDB_TABLE_CACHE: cacheTable.name,
      S3_BUCKET_SNAPSHOTS: snapshotsBucket.name,
      GEMINI_API_KEY: new sst.Secret("GeminiApiKey").value,
      FEATHERLESS_API_KEY: new sst.Secret("FeatherlessApiKey").value,
      FEATHERLESS_BASE_URL: "https://api.featherless.ai/v1",
      FIRMS_API_KEY: new sst.Secret("FirmsApiKey").value,
      GOOGLE_PLACES_API_KEY: new sst.Secret("GooglePlacesApiKey").value,
      NEWS_MODE: "gdelt",
      AID_MODE: "mock",
      ALLOWED_ORIGINS: "*",
    };

    // ── API Lambda ───────────────────────────────────────────
    const api = new sst.aws.Function("ApiHandler", {
      handler: "src/lambda.handler",
      runtime: "nodejs20.x",
      timeout: "30 seconds",
      memory: "512 MB",
      environment: sharedEnv,
      url: true,
    });

    // Grant DynamoDB + S3 permissions
    hazardsTable.grant(api, "readwrite");
    cacheTable.grant(api, "readwrite");
    snapshotsBucket.grant(api, "readwrite");

    // ── Ingestion Lambda ─────────────────────────────────────
    const ingestFn = new sst.aws.Function("IngestHandler", {
      handler: "src/ingestHandler.handler",
      runtime: "nodejs20.x",
      timeout: "120 seconds",
      memory: "512 MB",
      environment: sharedEnv,
    });

    hazardsTable.grant(ingestFn, "readwrite");
    snapshotsBucket.grant(ingestFn, "readwrite");

    // ── EventBridge Schedule (every 15 min) ──────────────────
    new sst.aws.Cron("IngestSchedule", {
      schedule: "rate(15 minutes)",
      function: ingestFn,
    });

    return {
      apiUrl: api.url,
      hazardsTable: hazardsTable.name,
      cacheTable: cacheTable.name,
      snapshotsBucket: snapshotsBucket.name,
    };
  },
});
