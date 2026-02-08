export interface Env {
  // Hyperdrive binding for PostgreSQL
  HYPERDRIVE: Hyperdrive;

  // KV namespace for sessions
  SESSIONS_KV: KVNamespace;

  // R2 bucket for profile images
  PROFILE_IMAGES_R2: R2Bucket;

  // R2 bucket for season icons
  SEASON_ICONS_R2: R2Bucket;

  // Durable Object for real-time stats hub
  STATS_HUB: DurableObjectNamespace;

  // Environment variables
  SESSION_SECRET: string;
  ENVIRONMENT: string;
  SESSION_TTL: string;
  RESEND_API_KEY: string;
  INVITE_BASE_URL: string;
  FRONTEND_URL?: string; // Optional: Frontend URL for CORS whitelist
}
