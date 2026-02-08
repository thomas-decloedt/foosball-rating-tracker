import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Env } from "../bindings";
import { createDatabase } from "../drizzle/db";
import * as schema from "../drizzle/schema";
import { CustomError } from "../error/CustomError";
import { ErrorCode } from "../error/ErrorCodes";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { errorHandler } from "../middleware/errorHandler";

export const memeRoutes = new Hono<{ Bindings: Env }>();

// Use centralized error handler
memeRoutes.onError(errorHandler);

// Schemas
const createMemeBodySchema = z.object({
  type: z.enum(["gif", "image"]),
  url: z.string().url(),
});

const listMemesQuerySchema = z.object({
  activeOnly: z.coerce.boolean().default(true),
});

const updateMemeParamsSchema = z.object({
  id: z.string(),
});

const updateMemeBodySchema = z.object({
  isActive: z.boolean(),
});

const deleteMemeParamsSchema = z.object({
  id: z.string(),
});

// POST /admin/memes (admin only)
memeRoutes.post(
  "/admin/memes",
  requireAdmin,
  zValidator("json", createMemeBodySchema),
  async (c) => {
    const user = c.get("user")!;
    const { type, url } = c.req.valid("json");
    const db = createDatabase(c.env);

    const [meme] = await db
      .insert(schema.meme)
      .values({
        type,
        url,
        uploadedById: user.id,
      })
      .returning();

    if (!meme) {
      throw new CustomError(
        "Failed to create meme",
        ErrorCode.VALIDATION_ERROR,
      );
    }

    return c.json(
      {
        meme: {
          id: meme.id,
          type: meme.type,
          url: meme.url,
          isActive: meme.isActive,
          createdAt: meme.createdAt,
        },
      },
      201,
    );
  },
);

// GET /memes
memeRoutes.get(
  "/memes",
  requireAuth,
  zValidator("query", listMemesQuerySchema),
  async (c) => {
    const user = c.get("user")!;
    const { activeOnly } = c.req.valid("query");
    const db = createDatabase(c.env);

    const whereClause =
      activeOnly && !user.isAdmin
        ? eq(schema.meme.isActive, true)
        : activeOnly
          ? eq(schema.meme.isActive, true)
          : undefined;

    const memes = await db.query.meme.findMany({
      where: whereClause,
      orderBy: desc(schema.meme.createdAt),
    });

    return c.json(
      {
        memes: memes.map((m) => ({
          id: m.id,
          type: m.type,
          url: m.url,
          isActive: m.isActive,
          createdAt: m.createdAt,
        })),
      },
      200,
    );
  },
);

// GET /memes/random
memeRoutes.get("/memes/random", requireAuth, async (c) => {
  const db = createDatabase(c.env);

  const memes = await db.query.meme.findMany({
    where: eq(schema.meme.isActive, true),
  });

  // For now, we'll return any meme regardless of type
  // In the future, memes could have a category field for win/loss
  // For now, we'll just filter randomly - you can add a category field later
  if (memes.length === 0) {
    return c.json(
      {
        meme: null,
      },
      200,
    );
  }

  const randomMeme = memes[Math.floor(Math.random() * memes.length)];

  if (!randomMeme) {
    return c.json(
      {
        meme: null,
      },
      200,
    );
  }

  return c.json(
    {
      meme: {
        id: randomMeme.id,
        type: randomMeme.type,
        url: randomMeme.url,
      },
    },
    200,
  );
});

// PATCH /admin/memes/:id (admin only)
memeRoutes.patch(
  "/admin/memes/:id",
  requireAdmin,
  zValidator("param", updateMemeParamsSchema),
  zValidator("json", updateMemeBodySchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const { isActive } = c.req.valid("json");
    const db = createDatabase(c.env);

    const meme = await db.query.meme.findFirst({
      where: eq(schema.meme.id, id),
    });

    if (!meme) {
      throw new CustomError("Meme not found", ErrorCode.NOT_FOUND);
    }

    const [updated] = await db
      .update(schema.meme)
      .set({ isActive })
      .where(eq(schema.meme.id, id))
      .returning();

    if (!updated) {
      throw new CustomError(
        "Failed to update meme",
        ErrorCode.VALIDATION_ERROR,
      );
    }

    return c.json(
      {
        success: true,
        meme: {
          id: updated.id,
          type: updated.type,
          url: updated.url,
          isActive: updated.isActive,
        },
      },
      200,
    );
  },
);

// DELETE /admin/memes/:id (admin only)
memeRoutes.delete(
  "/admin/memes/:id",
  requireAdmin,
  zValidator("param", deleteMemeParamsSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const db = createDatabase(c.env);

    const meme = await db.query.meme.findFirst({
      where: eq(schema.meme.id, id),
    });

    if (!meme) {
      throw new CustomError("Meme not found", ErrorCode.NOT_FOUND);
    }

    await db.delete(schema.meme).where(eq(schema.meme.id, id));

    return c.json(
      {
        success: true,
        message: "Meme deleted successfully",
      },
      200,
    );
  },
);
