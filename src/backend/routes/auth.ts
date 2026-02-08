import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Env } from "../bindings";
import { createDatabase } from "../drizzle/db";
import * as schema from "../drizzle/schema";
import { hashPassword, verifyPassword } from "../auth/password";
import { CustomError } from "../error/CustomError";
import { ErrorCode } from "../error/ErrorCodes";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { errorHandler } from "../middleware/errorHandler";
import { loginRateLimit } from "../middleware/rateLimit";
import {
  uploadProfileImageToR2,
  deleteProfileImageFromR2,
  getProfileImageUrl,
} from "../utils/r2";

export const authRoutes = new Hono<{ Bindings: Env }>();

// Schemas
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(100),
  displayName: z.string().min(1).max(50),
});

const updateProfileSchema = z.object({
  profileImage: z.string().nullable(),
});

// POST /auth/login (with rate limiting)
authRoutes.post(
  "/auth/login",
  loginRateLimit,
  zValidator("json", loginSchema),
  async (c) => {
    try {
      const { email, password } = c.req.valid("json");
      const db = createDatabase(c.env);
      const session = c.get("session");

      let user;
      try {
        user = await db.query.user.findFirst({
          where: eq(schema.user.email, email),
        });
      } catch (dbError: any) {
        console.error("Database error fetching user:", dbError);
        throw new CustomError(
          `Database error: ${dbError.message}`,
          ErrorCode.UNEXPECTED_ERROR,
        );
      }

      if (!user || !user.passwordHash) {
        throw new CustomError(
          "Invalid email or password",
          ErrorCode.UNAUTHORIZED,
        );
      }

      const isValid = await verifyPassword(password, user.passwordHash);

      if (!isValid) {
        throw new CustomError(
          "Invalid email or password",
          ErrorCode.UNAUTHORIZED,
        );
      }

      let player;
      try {
        // Use Drizzle's select API instead of relational query API
        // This is more compatible with Hyperdrive connection pooling
        const result = await db
          .select()
          .from(schema.player)
          .where(eq(schema.player.userId, user.id))
          .limit(1);
        player = result[0] || null;
      } catch (dbError: any) {
        console.error("Database error fetching player:", dbError);
        console.error("User ID:", user.id);
        throw new CustomError(
          `Database error: ${dbError.message}`,
          ErrorCode.UNEXPECTED_ERROR,
        );
      }

      if (!player) {
        throw new CustomError("Player profile not found", ErrorCode.NOT_FOUND);
      }

      await session.set("uid", user.id);

      return c.json(
        {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            isAdmin: user.isAdmin,
          },
          player: {
            id: player.id,
            displayName: player.displayName,
            displayRating: Math.round(
              player.generalMu - 3 * player.generalSigma,
            ),
            generalMu: player.generalMu,
            generalSigma: player.generalSigma,
          },
        },
        200,
      );
    } catch (err) {
      // Re-throw CustomError as-is
      if (err instanceof CustomError) {
        throw err;
      }
      // Wrap other errors
      console.error("Unexpected error in login:", err);
      throw new CustomError(
        `Login failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        ErrorCode.UNEXPECTED_ERROR,
      );
    }
  },
);

// POST /auth/register (admin only)
authRoutes.post(
  "/auth/register",
  requireAdmin,
  zValidator("json", registerSchema),
  async (c) => {
    const { email, password, name, displayName } = c.req.valid("json");
    const db = createDatabase(c.env);

    const existing = await db.query.user.findFirst({
      where: eq(schema.user.email, email),
    });

    if (existing) {
      throw new CustomError("Email already registered", ErrorCode.CONFLICT);
    }

    const passwordHash = await hashPassword(password);

    const result = await db.transaction(async (tx) => {
      const [newUser] = await tx
        .insert(schema.user)
        .values({
          email,
          passwordHash,
          name,
        })
        .returning();

      const [newPlayer] = await tx
        .insert(schema.player)
        .values({
          userId: newUser!.id,
          displayName,
        })
        .returning();

      return { user: newUser, player: newPlayer };
    });

    // Do NOT auto-login admin after creating a user
    // This was causing confusion where admin would be logged in as the new user

    return c.json(
      {
        user: {
          id: result.user!.id,
          email: result.user!.email,
          name: result.user!.name,
          isAdmin: result.user!.isAdmin,
        },
        player: {
          id: result.player!.id,
          displayName: result.player!.displayName,
          displayRating: Math.round(
            result.player!.generalMu - 3 * result.player!.generalSigma,
          ),
          generalMu: result.player!.generalMu,
          generalSigma: result.player!.generalSigma,
        },
      },
      201,
    );
  },
);

// POST /auth/logout
authRoutes.post("/auth/logout", requireAuth, async (c) => {
  const session = c.get("session");
  await session.destroy();

  return c.json({ success: true }, 200);
});

// GET /auth/me
authRoutes.get("/auth/me", requireAuth, async (c) => {
  const user = c.get("user")!;
  const db = createDatabase(c.env);

  const player = await db.query.player.findFirst({
    where: eq(schema.player.userId, user.id),
  });

  if (!player) {
    throw new CustomError("Player profile not found", ErrorCode.NOT_FOUND);
  }

  // Set cache-control headers to prevent caching of API responses with profileImage
  c.header("Cache-Control", "no-cache, no-store, must-revalidate");
  c.header("Pragma", "no-cache");
  c.header("Expires", "0");

  return c.json(
    {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: user.isAdmin,
        profileImage: getProfileImageUrl(user.profileImage),
      },
      player: {
        id: player.id,
        displayName: player.displayName,
        displayRating: Math.round(player.generalMu - 3 * player.generalSigma),
        generalMu: player.generalMu,
        generalSigma: player.generalSigma,
        gamesPlayed: player.gamesPlayed,
        wins: player.wins,
        losses: player.losses,
      },
    },
    200,
  );
});

// POST /auth/update-profile
authRoutes.post(
  "/auth/update-profile",
  requireAuth,
  zValidator("json", updateProfileSchema),
  async (c) => {
    const user = c.get("user")!;
    const body = c.req.valid("json");
    const db = createDatabase(c.env);

    let profileImageUrl: string | null = null;

    if (body.profileImage) {
      // Upload to R2 and get URL
      profileImageUrl = await uploadProfileImageToR2(
        c.env.PROFILE_IMAGES_R2,
        user.id,
        body.profileImage,
      );
    } else {
      // If profileImage is null, delete existing image from R2
      await deleteProfileImageFromR2(c.env.PROFILE_IMAGES_R2, user.id);
    }

    // Store R2 URL in database (never base64)
    await db
      .update(schema.user)
      .set({
        profileImage: profileImageUrl,
      })
      .where(eq(schema.user.id, user.id));

    return c.json(
      {
        success: true,
        profileImage: profileImageUrl,
      },
      200,
    );
  },
);

// Use centralized error handler
authRoutes.onError(errorHandler);
