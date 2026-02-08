import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { asc, count, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Env } from "../bindings";
import { createDatabase } from "../drizzle/db";
import * as schema from "../drizzle/schema";
import { CustomError } from "../error/CustomError";
import { ErrorCode } from "../error/ErrorCodes";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { errorHandler } from "../middleware/errorHandler";

export const tableRoutes = new Hono<{ Bindings: Env }>();

// Use centralized error handler
tableRoutes.onError(errorHandler);

// Schemas
const createTableSchema = z.object({
  brand: z.string().min(1).max(100),
  model: z.string().min(1).max(100),
  notes: z.string().optional(),
});

const updateTableSchema = z.object({
  brand: z.string().min(1).max(100).optional(),
  model: z.string().min(1).max(100).optional(),
  notes: z.string().optional(),
});

const tableIdParamsSchema = z.object({
  id: z.string(),
});

// GET /tables (public, requires auth)
tableRoutes.get("/tables", requireAuth, async (c) => {
  const db = createDatabase(c.env);

  const tables = await db.query.foosballTable.findMany({
    orderBy: asc(schema.foosballTable.createdAt),
  });

  return c.json(
    {
      tables: tables.map((t) => ({
        id: t.id,
        brand: t.brand,
        model: t.model,
        notes: t.notes,
      })),
    },
    200,
  );
});

// GET /admin/tables (admin only)
tableRoutes.get("/admin/tables", requireAdmin, async (c) => {
  const db = createDatabase(c.env);

  const tables = await db.query.foosballTable.findMany({
    orderBy: asc(schema.foosballTable.createdAt),
  });

  // Get createdBy users
  const userIds = [...new Set(tables.map((t) => t.createdById))];
  const users =
    userIds.length > 0
      ? await db.query.user.findMany({
          where: inArray(schema.user.id, userIds),
          columns: {
            id: true,
            name: true,
          },
        })
      : [];

  const userMap = new Map(users.map((u) => [u.id, u]));

  // Get usage counts for each table
  const usageCounts = await Promise.all(
    tables.map(async (table) => {
      const [result] = await db
        .select({ count: count() })
        .from(schema.match)
        .where(eq(schema.match.tableId, table.id));
      return { tableId: table.id, count: result?.count ?? 0 };
    }),
  );

  const usageMap = new Map(usageCounts.map((u) => [u.tableId, u.count]));

  return c.json(
    {
      tables: tables.map((t) => {
        const createdBy = userMap.get(t.createdById);
        return {
          id: t.id,
          brand: t.brand,
          model: t.model,
          notes: t.notes,
          createdAt: t.createdAt,
          createdBy: createdBy
            ? {
                id: createdBy.id,
                name: createdBy.name,
              }
            : null,
          usageCount: usageMap.get(t.id) ?? 0,
        };
      }),
    },
    200,
  );
});

// POST /admin/tables (admin only)
tableRoutes.post(
  "/admin/tables",
  requireAdmin,
  zValidator("json", createTableSchema),
  async (c) => {
    const user = c.get("user")!;
    const { brand, model, notes } = c.req.valid("json");
    const db = createDatabase(c.env);

    const [newTable] = await db
      .insert(schema.foosballTable)
      .values({
        brand,
        model,
        notes: notes || null,
        createdById: user.id,
      })
      .returning();

    if (!newTable) {
      throw new CustomError(
        "Failed to create table",
        ErrorCode.UNEXPECTED_ERROR,
      );
    }

    return c.json(
      {
        table: {
          id: newTable.id,
          brand: newTable.brand,
          model: newTable.model,
          notes: newTable.notes,
          createdAt: newTable.createdAt,
        },
      },
      201,
    );
  },
);

// PUT /admin/tables/:id (admin only)
tableRoutes.put(
  "/admin/tables/:id",
  requireAdmin,
  zValidator("param", tableIdParamsSchema),
  zValidator("json", updateTableSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const db = createDatabase(c.env);

    const existingTable = await db.query.foosballTable.findFirst({
      where: eq(schema.foosballTable.id, id),
    });

    if (!existingTable) {
      throw new CustomError("Table not found", ErrorCode.NOT_FOUND);
    }

    const updateData: {
      brand?: string;
      model?: string;
      notes?: string | null;
      updatedAt: Date;
    } = {
      updatedAt: new Date(),
    };

    if (body.brand !== undefined) {
      updateData.brand = body.brand;
    }
    if (body.model !== undefined) {
      updateData.model = body.model;
    }
    if (body.notes !== undefined) {
      updateData.notes = body.notes || null;
    }

    const [updatedTable] = await db
      .update(schema.foosballTable)
      .set(updateData)
      .where(eq(schema.foosballTable.id, id))
      .returning();

    if (!updatedTable) {
      throw new CustomError(
        "Failed to update table",
        ErrorCode.UNEXPECTED_ERROR,
      );
    }

    return c.json(
      {
        table: {
          id: updatedTable.id,
          brand: updatedTable.brand,
          model: updatedTable.model,
          notes: updatedTable.notes,
          updatedAt: updatedTable.updatedAt,
        },
      },
      200,
    );
  },
);

// DELETE /admin/tables/:id (admin only)
tableRoutes.delete(
  "/admin/tables/:id",
  requireAdmin,
  zValidator("param", tableIdParamsSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const db = createDatabase(c.env);

    const existingTable = await db.query.foosballTable.findFirst({
      where: eq(schema.foosballTable.id, id),
    });

    if (!existingTable) {
      throw new CustomError("Table not found", ErrorCode.NOT_FOUND);
    }

    // Check if table is used in any matches
    const [usageResult] = await db
      .select({ count: count() })
      .from(schema.match)
      .where(eq(schema.match.tableId, id));

    const usageCount = usageResult?.count ?? 0;

    if (usageCount > 0) {
      // Set tableId to null for all matches using this table
      await db
        .update(schema.match)
        .set({ tableId: null })
        .where(eq(schema.match.tableId, id));
    }

    await db
      .delete(schema.foosballTable)
      .where(eq(schema.foosballTable.id, id));

    return c.json(
      {
        success: true,
        message: "Table deleted successfully",
        matchesUpdated: usageCount,
      },
      200,
    );
  },
);
