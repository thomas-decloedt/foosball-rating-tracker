import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Env } from "../bindings";
import { createDatabase } from "../drizzle/db";
import * as schema from "../drizzle/schema";
import { CustomError } from "../error/CustomError";
import { ErrorCode } from "../error/ErrorCodes";
import { requireAuth } from "../middleware/auth";
import { errorHandler } from "../middleware/errorHandler";

export const commentRoutes = new Hono<{ Bindings: Env }>();

// Use centralized error handler
commentRoutes.onError(errorHandler);

// Rate limiting
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 5;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const userTimestamps = rateLimitMap.get(userId) || [];

  const recentTimestamps = userTimestamps.filter(
    (t) => now - t < RATE_LIMIT_WINDOW,
  );

  if (recentTimestamps.length >= RATE_LIMIT_MAX) {
    return false;
  }

  recentTimestamps.push(now);
  rateLimitMap.set(userId, recentTimestamps);

  return true;
}

// Schemas
const createCommentParamsSchema = z.object({
  matchId: z.string(),
});

const createCommentBodySchema = z.object({
  content: z.string().min(1).max(1000),
});

const listCommentsParamsSchema = z.object({
  matchId: z.string(),
});

const listCommentsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const deleteCommentParamsSchema = z.object({
  matchId: z.string(),
  commentId: z.string(),
});

// POST /match/:matchId/comments
commentRoutes.post(
  "/match/:matchId/comments",
  requireAuth,
  zValidator("param", createCommentParamsSchema),
  zValidator("json", createCommentBodySchema),
  async (c) => {
    const user = c.get("user")!;
    const { matchId } = c.req.valid("param");
    const { content } = c.req.valid("json");
    const db = createDatabase(c.env);

    if (!checkRateLimit(user.id)) {
      throw new CustomError(
        "You are posting too quickly. Please wait a moment.",
        ErrorCode.VALIDATION_ERROR,
      );
    }

    const match = await db.query.match.findFirst({
      where: eq(schema.match.id, matchId),
    });

    if (!match || match.isDeleted) {
      throw new CustomError("Match not found", ErrorCode.NOT_FOUND);
    }

    const [comment] = await db
      .insert(schema.comment)
      .values({
        matchId,
        userId: user.id,
        content,
      })
      .returning();

    if (!comment) {
      throw new CustomError(
        "Failed to create comment",
        ErrorCode.VALIDATION_ERROR,
      );
    }

    return c.json(
      {
        comment: {
          id: comment.id,
          matchId: comment.matchId,
          content: comment.content,
          author: {
            id: user.id,
            name: user.name,
          },
          createdAt: comment.createdAt,
          updatedAt: comment.updatedAt,
        },
      },
      201,
    );
  },
);

// GET /match/:matchId/comments
commentRoutes.get(
  "/match/:matchId/comments",
  requireAuth,
  zValidator("param", listCommentsParamsSchema),
  zValidator("query", listCommentsQuerySchema),
  async (c) => {
    const user = c.get("user")!;
    const { matchId } = c.req.valid("param");
    const { limit, offset } = c.req.valid("query");
    const db = createDatabase(c.env);

    const [commentsData, totalData] = await Promise.all([
      db.query.comment.findMany({
        where: and(
          eq(schema.comment.matchId, matchId),
          eq(schema.comment.isDeleted, false),
        ),
        orderBy: desc(schema.comment.createdAt),
        limit,
        offset,
      }),
      db
        .select({ count: schema.comment.id })
        .from(schema.comment)
        .where(
          and(
            eq(schema.comment.matchId, matchId),
            eq(schema.comment.isDeleted, false),
          ),
        ),
    ]);

    const userIds = [...new Set(commentsData.map((c) => c.userId))];

    const users = await db.query.user.findMany({
      where: inArray(schema.user.id, userIds),
      columns: {
        id: true,
        name: true,
      },
    });

    const userMap = new Map(users.map((u) => [u.id, u]));

    const comments = commentsData.map((comment) => ({
      id: comment.id,
      content: comment.content,
      author: {
        id: comment.userId,
        name: userMap.get(comment.userId)?.name ?? "Unknown",
      },
      createdAt: comment.createdAt,
      canDelete: comment.userId === user.id || user.isAdmin,
    }));

    return c.json(
      {
        comments,
        total: totalData.length,
      },
      200,
    );
  },
);

// DELETE /match/:matchId/comments/:commentId
commentRoutes.delete(
  "/match/:matchId/comments/:commentId",
  requireAuth,
  zValidator("param", deleteCommentParamsSchema),
  async (c) => {
    const user = c.get("user")!;
    const { matchId, commentId } = c.req.valid("param");
    const db = createDatabase(c.env);

    const comment = await db.query.comment.findFirst({
      where: and(
        eq(schema.comment.id, commentId),
        eq(schema.comment.matchId, matchId),
      ),
    });

    if (!comment || comment.isDeleted) {
      throw new CustomError("Comment not found", ErrorCode.NOT_FOUND);
    }

    const canDelete = comment.userId === user.id || user.isAdmin;

    if (!canDelete) {
      throw new CustomError(
        "You do not have permission to delete this comment",
        ErrorCode.PERMISSION_DENIED,
      );
    }

    await db
      .update(schema.comment)
      .set({
        isDeleted: true,
        deletedAt: new Date(),
        deletedById: user.id,
        updatedAt: new Date(),
      })
      .where(eq(schema.comment.id, commentId));

    return c.json(
      {
        success: true,
        message: "Comment deleted successfully",
      },
      200,
    );
  },
);
