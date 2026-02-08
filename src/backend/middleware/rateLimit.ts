import { createMiddleware } from "hono/factory";
import type { Env } from "../bindings";
import { CustomError } from "../error/CustomError";
import { ErrorCode } from "../error/ErrorCodes";

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const LOGIN_RATE_LIMIT = 5; // attempts
const LOGIN_WINDOW = 15 * 60 * 1000; // 15 minutes

/**
 * Rate limiting middleware for login endpoint
 * Limits to 5 attempts per 15 minutes per email
 */
export const loginRateLimit = createMiddleware<{ Bindings: Env }>(
  async (c, next) => {
    const body = await c.req.json();
    const email = body.email?.toLowerCase() || "unknown";
    const now = Date.now();

    const attempt = loginAttempts.get(email);

    if (attempt && attempt.resetAt > now) {
      if (attempt.count >= LOGIN_RATE_LIMIT) {
        throw new CustomError(
          "Too many login attempts. Please try again in 15 minutes.",
          ErrorCode.VALIDATION_ERROR,
        );
      }
      attempt.count++;
    } else {
      loginAttempts.set(email, {
        count: 1,
        resetAt: now + LOGIN_WINDOW,
      });
    }

    await next();
  },
);
