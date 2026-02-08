import { Context } from "hono";
import { eq } from "drizzle-orm";
import type { Env } from "../bindings";
import { createDatabase } from "../drizzle/db";
import * as schema from "../drizzle/schema";
import { CustomError } from "../error/CustomError";
import { ErrorCode } from "../error/ErrorCodes";

/**
 * Get the currently authenticated user from session
 * Throws UNAUTHORIZED if not authenticated
 */
export async function getCurrentUser(c: Context<{ Bindings: Env }>) {
  const session = c.get("session");
  const uid = await session.get("uid");

  if (!uid) {
    throw new CustomError("Not authenticated", ErrorCode.UNAUTHORIZED);
  }

  const db = createDatabase(c.env);
  const user = await db.query.user.findFirst({
    where: eq(schema.user.id, uid),
  });

  if (!user) {
    throw new CustomError("User not found", ErrorCode.UNAUTHORIZED);
  }

  return user;
}

/**
 * Get the currently authenticated user and verify admin status
 * Throws PERMISSION_DENIED if not admin
 */
export async function requireAdminUser(c: Context<{ Bindings: Env }>) {
  const user = await getCurrentUser(c);

  if (!user.isAdmin) {
    throw new CustomError("Admin access required", ErrorCode.PERMISSION_DENIED);
  }

  return user;
}
