import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  AWS_REGION: z.string().default('us-east-1'),
  DDB_TABLE_HAZARDS: z.string().default('harbor-hazards'),
  DDB_TABLE_CACHE: z.string().default('harbor-cache'),
  S3_BUCKET_SNAPSHOTS: z.string().default('harbor-snapshots'),
  GEMINI_API_KEY: z.string().default(''),
  FEATHERLESS_API_KEY: z.string().default(''),
  FEATHERLESS_BASE_URL: z.string().default('https://api.featherless.ai/v1'),
  FIRMS_API_KEY: z.string().default(''),
  GOOGLE_PLACES_API_KEY: z.string().default(''),
  NEWS_MODE: z.enum(['gdelt', 'mock']).default('gdelt'),
  AID_MODE: z.enum(['places', 'mock']).default('mock'),
  ALLOWED_ORIGINS: z.string().default('*'),
  ENABLE_API_KEY: z.enum(['true', 'false']).default('false'),
  API_KEY_VALUE: z.string().default(''),
  LOG_LEVEL: z.string().default('info'),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function loadEnv(): Env {
  if (_env) return _env;
  _env = envSchema.parse(process.env);
  return _env;
}

export function getEnv(): Env {
  if (!_env) return loadEnv();
  return _env;
}
