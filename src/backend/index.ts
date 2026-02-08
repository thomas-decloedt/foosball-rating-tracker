import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { Env } from "./bindings";
import { createRouter } from "./router";
export { StatsHub } from "./realtime/StatsHub";

const app = new Hono<{ Bindings: Env }>();

// Middleware
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: (origin, c) => {
      // Industry best practice: whitelist specific origins
      // See: https://snyk.io/blog/security-implications-cors-node-js/
      const allowedOrigins = [
        c.env.FRONTEND_URL, // Production frontend (HTTPS)
        "https://foosball.thomas-decloedt.be", // Portfolio custom domain
        "http://localhost:5173", // Vite dev server
        "http://localhost:3000", // Alternative dev server
      ].filter(Boolean); // Remove undefined values

      // Return origin if it's in allowed list, otherwise reject
      if (!origin || allowedOrigins.includes(origin)) {
        return origin;
      }

      // Development fallback: allow localhost if no FRONTEND_URL set
      if (!c.env.FRONTEND_URL && origin.startsWith("http://localhost")) {
        return origin;
      }

      return null; // Reject unlisted origins
    },
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400, // Cache preflight for 24 hours
  }),
);

// Security headers
app.use("*", async (c, next) => {
  await next();
  c.res.headers.set("X-Content-Type-Options", "nosniff");
  c.res.headers.set("X-Frame-Options", "DENY");
  c.res.headers.set("X-XSS-Protection", "1; mode=block");
  c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  c.res.headers.set(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=()",
  );
});

// Health checks
app.get("/", (c) =>
  c.json({ status: "ok", service: "foosball-elo-tracker-api" }),
);

app.get("/api/v1/health", async (c) => {
  const health: any = {
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: {
      nodeEnv: c.env.ENVIRONMENT,
      hasDatabaseConnection: !!c.env.HYPERDRIVE,
      hasSessionStore: !!c.env.SESSIONS_KV,
      hasSessionSecret: !!c.env.SESSION_SECRET,
    },
  };

  // Test database connection if Hyperdrive is available
  if (c.env.HYPERDRIVE) {
    try {
      const { createDatabase } = await import("./drizzle/db");
      const { sql } = await import("drizzle-orm");
      const db = createDatabase(c.env);
      // Try a simple query
      await db.execute(sql`SELECT 1`);

      // Check if player table exists
      let playerTableExists = false;
      try {
        const result = await db.execute(
          sql`SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'player'
          )`,
        );
        playerTableExists = result[0]?.exists === true;
      } catch (err) {
        // Log table check errors but don't fail health check
        console.error("Error checking if player table exists:", err);
      }

      health.database = {
        status: "connected",
        connectionString: c.env.HYPERDRIVE.connectionString
          ? "present"
          : "missing",
        playerTableExists,
      };
    } catch (err: any) {
      health.database = {
        status: "error",
        error: err.message,
      };
    }
  }

  return c.json(health);
});

// Mount API router
app.route("/api/v1", createRouter());

// Global error handler
app.onError((err, c) => {
  console.error("Global error handler:", err);
  return c.json({ error: "Internal server error", message: err.message }, 500);
});

export default app;
