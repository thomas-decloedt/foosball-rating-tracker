import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Env } from "../bindings";
import { createDatabase } from "../drizzle/db";
import * as schema from "../drizzle/schema";
import { hashPassword } from "../auth/password";
import { CustomError } from "../error/CustomError";
import { ErrorCode } from "../error/ErrorCodes";
import { sendInviteEmail } from "../utils/email";
import { generateSecureToken } from "../utils/token";
import { requireAdmin, publicRoute } from "../middleware/auth";
import { errorHandler } from "../middleware/errorHandler";

export const inviteRoutes = new Hono<{ Bindings: Env }>();

// Use centralized error handler
inviteRoutes.onError(errorHandler);

// Schemas
const sendInviteSchema = z.object({
  email: z.string().email(),
});

const acceptInviteSchema = z.object({
  token: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1).max(100),
  displayName: z.string().min(1).max(50),
  password: z.string().min(8),
});

const inviteIdParamsSchema = z.object({
  id: z.string(),
});

const tokenParamsSchema = z.object({
  token: z.string(),
});

const userIdParamsSchema = z.object({
  id: z.string(),
});

// GET /admin/invites - List all invitations
inviteRoutes.get("/admin/invites", requireAdmin, async (c) => {
  const db = createDatabase(c.env);

  const invitations = await db.query.userInvitation.findMany({
    orderBy: desc(schema.userInvitation.createdAt),
  });

  // Fetch invited by users
  const invitedByIds = [...new Set(invitations.map((inv) => inv.invitedById))];
  const invitedByUsers = await db.query.user.findMany({
    where: (users, { inArray }) => inArray(users.id, invitedByIds),
    columns: {
      id: true,
      name: true,
      email: true,
    },
  });

  const userMap = new Map(invitedByUsers.map((u) => [u.id, u]));

  return c.json(
    {
      invitations: invitations.map((inv) => {
        const invitedBy = userMap.get(inv.invitedById);
        return {
          id: inv.id,
          email: inv.email,
          status: inv.status,
          invitedBy: invitedBy
            ? {
                id: invitedBy.id,
                name: invitedBy.name,
              }
            : null,
          createdAt: inv.createdAt,
          expiresAt: inv.expiresAt,
          acceptedAt: inv.acceptedAt,
        };
      }),
    },
    200,
  );
});

// POST /admin/invites - Send invitation
inviteRoutes.post(
  "/admin/invites",
  requireAdmin,
  zValidator("json", sendInviteSchema),
  async (c) => {
    try {
      const adminUser = c.get("user")!;
      const { email } = c.req.valid("json");
      const db = createDatabase(c.env);

      // Check if user already exists
      let existingUser;
      try {
        existingUser = await db.query.user.findFirst({
          where: eq(schema.user.email, email),
        });
      } catch (dbErr) {
        console.error("Database error checking existing user:", dbErr);
        throw new CustomError(
          `Database error: ${dbErr instanceof Error ? dbErr.message : "Unknown error"}`,
          ErrorCode.UNEXPECTED_ERROR,
        );
      }

      if (existingUser) {
        throw new CustomError("Email already registered", ErrorCode.CONFLICT);
      }

      // Check for duplicate pending invitation
      let existingInvite;
      try {
        existingInvite = await db.query.userInvitation.findFirst({
          where: and(
            eq(schema.userInvitation.email, email),
            eq(schema.userInvitation.status, "pending"),
            gt(schema.userInvitation.expiresAt, new Date()),
          ),
        });
      } catch (dbErr) {
        console.error("Database error checking existing invitation:", dbErr);
        throw new CustomError(
          `Database error: ${dbErr instanceof Error ? dbErr.message : "Unknown error"}`,
          ErrorCode.UNEXPECTED_ERROR,
        );
      }

      if (existingInvite) {
        throw new CustomError(
          "A pending invitation already exists for this email",
          ErrorCode.CONFLICT,
        );
      }

      // Generate token and expiration (7 days)
      const token = generateSecureToken();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      // Create invitation in transaction
      let result;
      try {
        result = await db.transaction(async (tx) => {
          const [invitation] = await tx
            .insert(schema.userInvitation)
            .values({
              email,
              token,
              invitedById: adminUser.id,
              expiresAt,
            })
            .returning();

          if (!invitation) {
            throw new CustomError(
              "Failed to create invitation",
              ErrorCode.UNEXPECTED_ERROR,
            );
          }

          // Try to send email, but don't fail if it doesn't work
          let emailSent = false;
          let inviteUrl = "";

          if (c.env.INVITE_BASE_URL) {
            inviteUrl = `${c.env.INVITE_BASE_URL}/invite/accept?token=${token}`;

            if (c.env.RESEND_API_KEY) {
              try {
                await sendInviteEmail(c.env.RESEND_API_KEY, {
                  email,
                  token,
                  inviterName: adminUser.name,
                  inviteUrl,
                });
                emailSent = true;
              } catch (err) {
                // Log the error but don't fail the invitation
                console.warn("Failed to send invitation email:", err);
              }
            }
          }

          return { invitation, inviteUrl, emailSent };
        });
      } catch (txErr) {
        // Re-throw CustomError as-is
        if (txErr instanceof CustomError) {
          throw txErr;
        }
        // Wrap transaction errors
        console.error("Transaction error creating invitation:", txErr);
        throw new CustomError(
          `Failed to create invitation: ${txErr instanceof Error ? txErr.message : "Unknown error"}`,
          ErrorCode.UNEXPECTED_ERROR,
        );
      }

      return c.json(
        {
          invitation: {
            id: result.invitation.id,
            email: result.invitation.email,
            status: result.invitation.status,
            expiresAt: result.invitation.expiresAt,
            createdAt: result.invitation.createdAt,
          },
          inviteUrl: result.inviteUrl,
          emailSent: result.emailSent,
        },
        201,
      );
    } catch (err) {
      // Re-throw CustomError to be handled by error handler
      if (err instanceof CustomError) {
        throw err;
      }
      // Wrap any other unexpected errors
      console.error("Unexpected error in POST /admin/invites:", err);
      throw new CustomError(
        `Failed to send invitation: ${err instanceof Error ? err.message : "Unknown error"}`,
        ErrorCode.UNEXPECTED_ERROR,
      );
    }
  },
);

// DELETE /admin/invites/:id - Revoke pending invitation
inviteRoutes.delete(
  "/admin/invites/:id",
  requireAdmin,
  zValidator("param", inviteIdParamsSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const db = createDatabase(c.env);

    const invitation = await db.query.userInvitation.findFirst({
      where: eq(schema.userInvitation.id, id),
    });

    if (!invitation) {
      throw new CustomError("Invitation not found", ErrorCode.NOT_FOUND);
    }

    if (invitation.status !== "pending") {
      throw new CustomError(
        "Only pending invitations can be revoked",
        ErrorCode.VALIDATION_ERROR,
      );
    }

    // Mark as expired instead of deleting (for audit trail)
    await db
      .update(schema.userInvitation)
      .set({
        status: "expired",
      })
      .where(eq(schema.userInvitation.id, id));

    return c.json({ success: true }, 200);
  },
);

// GET /invite/verify/:token - Verify token is valid (PUBLIC)
inviteRoutes.get(
  "/invite/verify/:token",
  publicRoute,
  zValidator("param", tokenParamsSchema),
  async (c) => {
    const { token } = c.req.valid("param");
    const db = createDatabase(c.env);

    const invitation = await db.query.userInvitation.findFirst({
      where: eq(schema.userInvitation.token, token),
    });

    if (!invitation) {
      throw new CustomError("Invalid invitation token", ErrorCode.NOT_FOUND);
    }

    // Check if expired
    if (new Date() > invitation.expiresAt) {
      // Mark as expired
      await db
        .update(schema.userInvitation)
        .set({
          status: "expired",
        })
        .where(eq(schema.userInvitation.id, invitation.id));

      throw new CustomError(
        "Invitation has expired",
        ErrorCode.VALIDATION_ERROR,
      );
    }

    // Check if already accepted
    if (invitation.status === "accepted") {
      throw new CustomError(
        "Invitation has already been accepted",
        ErrorCode.VALIDATION_ERROR,
      );
    }

    // Check if expired status
    if (invitation.status === "expired") {
      throw new CustomError(
        "Invitation has expired",
        ErrorCode.VALIDATION_ERROR,
      );
    }

    return c.json(
      {
        valid: true,
        email: invitation.email,
        expiresAt: invitation.expiresAt,
      },
      200,
    );
  },
);

// POST /invite/accept - Accept invite and create user (PUBLIC)
inviteRoutes.post(
  "/invite/accept",
  publicRoute,
  zValidator("json", acceptInviteSchema),
  async (c) => {
    const { token, email, name, displayName, password } = c.req.valid("json");
    const db = createDatabase(c.env);
    const session = c.get("session");

    // Verify token
    const invitation = await db.query.userInvitation.findFirst({
      where: eq(schema.userInvitation.token, token),
    });

    if (!invitation) {
      throw new CustomError("Invalid invitation token", ErrorCode.NOT_FOUND);
    }

    // Validate email matches
    if (invitation.email !== email) {
      throw new CustomError(
        "Email does not match invitation",
        ErrorCode.VALIDATION_ERROR,
      );
    }

    // Check if expired
    if (new Date() > invitation.expiresAt) {
      await db
        .update(schema.userInvitation)
        .set({
          status: "expired",
        })
        .where(eq(schema.userInvitation.id, invitation.id));

      throw new CustomError(
        "Invitation has expired",
        ErrorCode.VALIDATION_ERROR,
      );
    }

    // Check if already accepted
    if (invitation.status === "accepted") {
      throw new CustomError(
        "Invitation has already been accepted",
        ErrorCode.CONFLICT,
      );
    }

    // Check if expired status
    if (invitation.status === "expired") {
      throw new CustomError(
        "Invitation has expired",
        ErrorCode.VALIDATION_ERROR,
      );
    }

    // Check if user already exists (race condition protection)
    const existingUser = await db.query.user.findFirst({
      where: eq(schema.user.email, email),
    });

    if (existingUser) {
      throw new CustomError("Email already registered", ErrorCode.CONFLICT);
    }

    // Create user and player in transaction
    const result = await db.transaction(async (tx) => {
      const passwordHash = await hashPassword(password);

      // Create user
      const [newUser] = await tx
        .insert(schema.user)
        .values({
          email,
          passwordHash,
          name,
        })
        .returning();

      if (!newUser) {
        throw new Error("Failed to create user");
      }

      // Create player
      const [newPlayer] = await tx
        .insert(schema.player)
        .values({
          userId: newUser.id,
          displayName,
        })
        .returning();

      if (!newPlayer) {
        throw new Error("Failed to create player");
      }

      // Mark invitation as accepted
      await tx
        .update(schema.userInvitation)
        .set({
          status: "accepted",
          acceptedAt: new Date(),
        })
        .where(eq(schema.userInvitation.id, invitation.id));

      return { user: newUser, player: newPlayer };
    });

    // Auto-login user
    await session.set("uid", result.user!.id);

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

// GET /admin/users - List all users
inviteRoutes.get("/admin/users", requireAdmin, async (c) => {
  const db = createDatabase(c.env);

  const users = await db.query.user.findMany({
    orderBy: desc(schema.user.createdAt),
  });

  // Fetch player info for each user
  const userIds = users.map((u) => u.id);
  const players = await db.query.player.findMany({
    where: (players, { inArray }) => inArray(players.userId, userIds),
  });

  const playerMap = new Map(players.map((p) => [p.userId, p]));

  // Check constraints for each user - use simpler approach: query and count
  const [matches, seasons, memes, invitations] = await Promise.all([
    db.query.match.findMany({
      where: and(
        eq(schema.match.isDeleted, false),
        inArray(schema.match.recordedById, userIds),
      ),
      columns: { recordedById: true },
    }),
    db.query.season.findMany({
      where: inArray(schema.season.createdById, userIds),
      columns: { createdById: true },
    }),
    db.query.meme.findMany({
      where: inArray(schema.meme.uploadedById, userIds),
      columns: { uploadedById: true },
    }),
    userIds.length > 0
      ? db.query.userInvitation.findMany({
          where: (invitations, { inArray }) =>
            inArray(invitations.invitedById, userIds),
        })
      : Promise.resolve([]),
  ]);

  // Build count maps
  const matchCountMap = new Map<string, number>();
  for (const match of matches) {
    matchCountMap.set(
      match.recordedById,
      (matchCountMap.get(match.recordedById) || 0) + 1,
    );
  }

  const seasonCountMap = new Map<string, number>();
  for (const season of seasons) {
    seasonCountMap.set(
      season.createdById,
      (seasonCountMap.get(season.createdById) || 0) + 1,
    );
  }

  const memeCountMap = new Map<string, number>();
  for (const meme of memes) {
    memeCountMap.set(
      meme.uploadedById,
      (memeCountMap.get(meme.uploadedById) || 0) + 1,
    );
  }

  const invitationCountMap = new Map<string, number>();
  for (const invitation of invitations) {
    invitationCountMap.set(
      invitation.invitedById,
      (invitationCountMap.get(invitation.invitedById) || 0) + 1,
    );
  }

  return c.json(
    {
      users: users.map((user) => {
        const player = playerMap.get(user.id);
        const canDelete =
          (matchCountMap.get(user.id) || 0) === 0 &&
          (seasonCountMap.get(user.id) || 0) === 0 &&
          (memeCountMap.get(user.id) || 0) === 0 &&
          (invitationCountMap.get(user.id) || 0) === 0;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          isAdmin: user.isAdmin,
          createdAt: user.createdAt,
          player: player
            ? {
                id: player.id,
                displayName: player.displayName,
                displayRating: Math.round(
                  player.generalMu - 3 * player.generalSigma,
                ),
                gamesPlayed: player.gamesPlayed,
              }
            : null,
          canDelete,
          constraintCounts: {
            matches: matchCountMap.get(user.id) || 0,
            seasons: seasonCountMap.get(user.id) || 0,
            memes: memeCountMap.get(user.id) || 0,
            invitations: invitationCountMap.get(user.id) || 0,
          },
        };
      }),
    },
    200,
  );
});

// DELETE /admin/users/:id - Delete user
inviteRoutes.delete(
  "/admin/users/:id",
  requireAdmin,
  zValidator("param", userIdParamsSchema),
  async (c) => {
    const adminUser = c.get("user")!;
    const { id } = c.req.valid("param");
    const db = createDatabase(c.env);

    // Prevent self-deletion
    if (id === adminUser.id) {
      throw new CustomError(
        "You cannot delete your own account",
        ErrorCode.VALIDATION_ERROR,
      );
    }

    const userToDelete = await db.query.user.findFirst({
      where: eq(schema.user.id, id),
    });

    if (!userToDelete) {
      throw new CustomError("User not found", ErrorCode.NOT_FOUND);
    }

    // Check constraints
    const [matches, seasons, memes, invitations] = await Promise.all([
      db.query.match.findMany({
        where: and(
          eq(schema.match.recordedById, id),
          eq(schema.match.isDeleted, false),
        ),
      }),
      db.query.season.findMany({
        where: eq(schema.season.createdById, id),
      }),
      db.query.meme.findMany({
        where: eq(schema.meme.uploadedById, id),
      }),
      db.query.userInvitation.findMany({
        where: eq(schema.userInvitation.invitedById, id),
      }),
    ]);

    const constraints = [];
    if (matches.length > 0) {
      constraints.push(`${matches.length} recorded match(es)`);
    }
    if (seasons.length > 0) {
      constraints.push(`${seasons.length} created season(s)`);
    }
    if (memes.length > 0) {
      constraints.push(`${memes.length} uploaded meme(s)`);
    }
    if (invitations.length > 0) {
      constraints.push(`${invitations.length} sent invitation(s)`);
    }

    if (constraints.length > 0) {
      throw new CustomError(
        `Cannot delete user: they have ${constraints.join(", ")}. Please remove or reassign these items first.`,
        ErrorCode.VALIDATION_ERROR,
      );
    }

    // Delete user (cascades to player and comments)
    await db.delete(schema.user).where(eq(schema.user.id, id));

    return c.json(
      {
        success: true,
        message: "User deleted successfully",
      },
      200,
    );
  },
);
