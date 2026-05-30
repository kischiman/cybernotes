interface Env {
  DB: D1Database;
  PHOTOS: R2Bucket;
  SESSIONS: KVNamespace;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  ALLOWED_EMAIL?: string;
  SESSION_SECRET?: string;
  R2_PUBLIC_BASE_URL?: string;
  DEV_AUTH_BYPASS?: string;
}
