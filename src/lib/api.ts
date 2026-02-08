/**
 * API base URL configuration.
 * - In development (Vite dev server): uses "/api" which gets proxied to localhost:3001
 * - In production (Lovable/deployed): uses the deployed API server URL
 */
const PROD_API_URL = 'https://harbor-disaster-api.onrender.com';

export const API_BASE = import.meta.env.DEV ? '/api' : PROD_API_URL;
