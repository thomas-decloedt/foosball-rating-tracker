import { createMiddleware } from "hono/factory";
import type { Env } from "../bindings";
import { getCurrentUser, requireAdminUser } from "../auth/context";
import * as schema from "../drizzle/schema";

/**
 * Middleware that requires user authentication
 * Attaches authenticated user to context at c.get("user")
 */
export const requireAuth = createMiddleware<{ Bindings: Env }>(
  async (c, next) => {
    const user = await getCurrentUser(c);
    c.set("user", user);
    await next();
  },
);

/**
 * Middleware that requires admin authentication
 * Attaches authenticated admin user to context at c.get("user")
 */
export const requireAdmin = createMiddleware<{ Bindings: Env }>(
  async (c, next) => {
    const user = await requireAdminUser(c);
    c.set("user", user);
    await next();
  },
);

/**
 * Marker middleware for public routes (no-op)
 * Used for explicit documentation and security auditing
 * Makes it easy to find all public endpoints: grep for "publicRoute"
 */
export const publicRoute = createMiddleware<{ Bindings: Env }>(
  async (_c, next) => {
    // This is a no-op middleware for documentation purposes
    // It explicitly marks routes as intentionally public
    await next();
  },
);

// Type safety: extend Hono context to include authenticated user
// Use the inferred type from the schema to ensure accuracy
declare module "hono" {
  interface ContextVariableMap {
    user?: typeof schema.user.$inferSelect;
  }
}
