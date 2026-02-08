import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Env } from "../bindings";
import * as schema from "./schema";

// Create database connection from Hyperdrive binding
export function createDatabase(env: Env) {
  // Hyperdrive provides an optimized connection string
  const client = postgres(env.HYPERDRIVE.connectionString, {
    prepare: false, // Required for Hyperdrive
    max: 1, // Single connection per Worker instance
    idle_timeout: 0, // Don't close idle connections (Workers are stateless anyway)
    connect_timeout: 5, // 5 second connection timeout
    max_lifetime: 60 * 30, // 30 minutes max lifetime
  });

  return drizzle(client, { schema });
}

export type Database = ReturnType<typeof createDatabase>;
