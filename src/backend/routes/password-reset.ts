import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Env } from "../bindings";
import { createDatabase } from "../drizzle/db";
import * as schema from "../drizzle/schema";
import { hashPassword } from "../auth/password";
import { CustomError } from "../error/CustomError";
import { ErrorCode } from "../error/ErrorCodes";
import { requireAdmin, publicRoute } from "../middleware/auth";
import { errorHandler } from "../middleware/errorHandler";
import { generateSecureToken } from "../utils/token";

export const passwordResetRoutes = new Hono<{ Bindings: Env }>();

passwordResetRoutes.onError(errorHandler);

const KV_KEY_PREFIX = "pw_reset:";
const KV_TTL = 604800; // 7 days

const createResetSchema = z.object({
  userId: z.string().min(1),
});

const tokenParamSchema = z.object({
  token: z.string().min(1),
});

const acceptResetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

// POST /admin/password-reset - Create reset token (admin only)
passwordResetRoutes.post(
  "/admin/password-reset",
  requireAdmin,
  zValidator("json", createResetSchema),
  async (c) => {
    const { userId } = c.req.valid("json");
    const db = createDatabase(c.env);

    const user = await db.query.user.findFirst({
      where: eq(schema.user.id, userId),
      columns: { id: true, email: true },
    });

    if (!user) {
      throw new CustomError("User not found", ErrorCode.NOT_FOUND);
    }

    const token = generateSecureToken();
    const expiresAt = new Date(Date.now() + KV_TTL * 1000).toISOString();
    const value = JSON.stringify({
      userId: user.id,
      email: user.email,
      expiresAt,
    });

    await c.env.SESSIONS_KV.put(`${KV_KEY_PREFIX}${token}`, value, {
      expirationTtl: KV_TTL,
    });

    const resetUrl = `${c.env.INVITE_BASE_URL}/reset-password?token=${token}`;
    return c.json({ resetUrl }, 200);
  },
);

// GET /password-reset/verify/:token - Verify token (public)
passwordResetRoutes.get(
  "/password-reset/verify/:token",
  publicRoute,
  zValidator("param", tokenParamSchema),
  async (c) => {
    const { token } = c.req.valid("param");

    const raw = await c.env.SESSIONS_KV.get(`${KV_KEY_PREFIX}${token}`);
    if (!raw) {
      throw new CustomError(
        "Invalid or expired reset link",
        ErrorCode.VALIDATION_ERROR,
      );
    }

    const data = JSON.parse(raw) as {
      userId: string;
      email: string;
      expiresAt: string;
    };

    return c.json(
      {
        valid: true,
        email: data.email,
        expiresAt: data.expiresAt,
      },
      200,
    );
  },
);

// POST /password-reset/accept - Accept token and update password (public)
passwordResetRoutes.post(
  "/password-reset/accept",
  publicRoute,
  zValidator("json", acceptResetSchema),
  async (c) => {
    const { token, password } = c.req.valid("json");
    const db = createDatabase(c.env);

    const raw = await c.env.SESSIONS_KV.get(`${KV_KEY_PREFIX}${token}`);
    if (!raw) {
      throw new CustomError(
        "Invalid or expired reset link",
        ErrorCode.VALIDATION_ERROR,
      );
    }

    const data = JSON.parse(raw) as {
      userId: string;
      email: string;
      expiresAt: string;
    };

    const passwordHash = await hashPassword(password);

    await db
      .update(schema.user)
      .set({ passwordHash })
      .where(eq(schema.user.id, data.userId));

    await c.env.SESSIONS_KV.delete(`${KV_KEY_PREFIX}${token}`);

    return c.json({ success: true }, 200);
  },
);
