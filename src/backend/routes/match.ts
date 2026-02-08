import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import type { Env } from "../bindings";
import { createDatabase } from "../drizzle/db";
import * as schema from "../drizzle/schema";
import { CustomError } from "../error/CustomError";
import { ErrorCode } from "../error/ErrorCodes";
import { calculateRatingChanges } from "../utils/openskill-calculator";
import { validateMatch } from "../utils/match-validator";
import { PlayerPosition } from "@/api-models/position";
import { requireAuth } from "../middleware/auth";
import { errorHandler } from "../middleware/errorHandler";
import { deleteCacheKeys } from "../utils/cache";
import { computeAffectedLeaderboardKeys } from "../utils/leaderboard";
import { notifyStatsHub } from "../utils/realtime";

export const matchRoutes = new Hono<{ Bindings: Env }>();

// Use centralized error handler
matchRoutes.onError(errorHandler);

// Schemas
const createMatchSchema = z.object({
  team1Player1Id: z.string(),
  team1Player2Id: z.string().nullable(),
  team2Player1Id: z.string(),
  team2Player2Id: z.string().nullable(),
  team1Score: z.number().int().min(0),
  team2Score: z.number().int().min(0),
  tableId: z.string().optional(),
  team1Player1Position: z
    .enum([
      PlayerPosition.DEFENSE,
      PlayerPosition.ATTACK,
      PlayerPosition.SOLO,
      PlayerPosition.MIXED,
    ])
    .optional(),
  team1Player2Position: z
    .enum([
      PlayerPosition.DEFENSE,
      PlayerPosition.ATTACK,
      PlayerPosition.SOLO,
      PlayerPosition.MIXED,
    ])
    .optional(),
  team2Player1Position: z
    .enum([
      PlayerPosition.DEFENSE,
      PlayerPosition.ATTACK,
      PlayerPosition.SOLO,
      PlayerPosition.MIXED,
    ])
    .optional(),
  team2Player2Position: z
    .enum([
      PlayerPosition.DEFENSE,
      PlayerPosition.ATTACK,
      PlayerPosition.SOLO,
      PlayerPosition.MIXED,
    ])
    .optional(),
  isFriendly: z.boolean().default(false).optional(),
});

const listMatchesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  playerId: z.string().optional(),
  includeDeleted: z.coerce.boolean().default(false),
});

// POST /match/create
matchRoutes.post(
  "/match/create",
  requireAuth,
  zValidator("json", createMatchSchema),
  async (c) => {
    const user = c.get("user")!;
    const body = c.req.valid("json");
    const db = createDatabase(c.env);

    const validation = validateMatch(body);
    if (!validation.valid) {
      throw new CustomError(validation.error!, ErrorCode.VALIDATION_ERROR);
    }

    // Validate tableId if provided
    if (body.tableId) {
      const table = await db.query.foosballTable.findFirst({
        where: eq(schema.foosballTable.id, body.tableId),
      });
      if (!table) {
        throw new CustomError("Table not found", ErrorCode.NOT_FOUND);
      }
    }

    const {
      team1Player1Id,
      team1Player2Id,
      team2Player1Id,
      team2Player2Id,
      team1Score,
      team2Score,
    } = body;
    const isFriendly = body.isFriendly ?? false;

    const winningTeam = team1Score > team2Score ? 1 : 2;
    const matchType = validation.matchType!;

    const playerIds = [
      team1Player1Id,
      team1Player2Id,
      team2Player1Id,
      team2Player2Id,
    ].filter((id): id is string => id !== null);

    const players = await db.query.player.findMany({
      where: inArray(schema.player.id, playerIds),
    });

    if (players.length !== playerIds.length) {
      throw new CustomError(
        "One or more players not found",
        ErrorCode.NOT_FOUND,
      );
    }

    const team1Has2Players = !!(team1Player1Id && team1Player2Id);
    const team2Has2Players = !!(team2Player1Id && team2Player2Id);

    const positions = {
      team1Player1Position: team1Has2Players
        ? (body.team1Player1Position as schema.PlayerPositionType) ||
          schema.PlayerPosition.DEFENSE
        : schema.PlayerPosition.SOLO,
      team1Player2Position: team1Player2Id
        ? team1Has2Players
          ? (body.team1Player2Position as schema.PlayerPositionType) ||
            schema.PlayerPosition.ATTACK
          : schema.PlayerPosition.SOLO
        : undefined,
      team2Player1Position: team2Has2Players
        ? (body.team2Player1Position as schema.PlayerPositionType) ||
          schema.PlayerPosition.DEFENSE
        : schema.PlayerPosition.SOLO,
      team2Player2Position: team2Player2Id
        ? team2Has2Players
          ? (body.team2Player2Position as schema.PlayerPositionType) ||
            schema.PlayerPosition.ATTACK
          : schema.PlayerPosition.SOLO
        : undefined,
    };

    if (
      team1Has2Players &&
      positions.team1Player1Position !== schema.PlayerPosition.MIXED &&
      positions.team1Player2Position !== schema.PlayerPosition.MIXED &&
      positions.team1Player1Position === positions.team1Player2Position
    ) {
      throw new CustomError(
        "Team 1 players cannot have the same position",
        ErrorCode.VALIDATION_ERROR,
      );
    }

    if (
      team2Has2Players &&
      positions.team2Player1Position !== schema.PlayerPosition.MIXED &&
      positions.team2Player2Position !== schema.PlayerPosition.MIXED &&
      positions.team2Player1Position === positions.team2Player2Position
    ) {
      throw new CustomError(
        "Team 2 players cannot have the same position",
        ErrorCode.VALIDATION_ERROR,
      );
    }

    type PlayerType = typeof schema.player.$inferSelect;

    const ratingChanges = isFriendly
      ? []
      : calculateRatingChanges({
          team1: {
            player1: {
              ...players.find((p: PlayerType) => p.id === team1Player1Id)!,
              position: positions.team1Player1Position,
            },
            player2: team1Player2Id
              ? {
                  ...players.find((p: PlayerType) => p.id === team1Player2Id)!,
                  position: positions.team1Player2Position!,
                }
              : null,
          },
          team2: {
            player1: {
              ...players.find((p: PlayerType) => p.id === team2Player1Id)!,
              position: positions.team2Player1Position,
            },
            player2: team2Player2Id
              ? {
                  ...players.find((p: PlayerType) => p.id === team2Player2Id)!,
                  position: positions.team2Player2Position!,
                }
              : null,
          },
          winningTeam,
          matchType,
        });

    const activeSeason = await db.query.season.findFirst({
      where: eq(schema.season.isActive, true),
      columns: { id: true },
    });

    const result = await db.transaction(async (tx) => {
      const [match] = await tx
        .insert(schema.match)
        .values({
          team1Player1Id,
          team1Player2Id,
          team2Player1Id,
          team2Player2Id,
          team1Score,
          team2Score,
          matchType,
          winningTeam,
          tableId: body.tableId || null,
          team1Player1Position: positions.team1Player1Position,
          team1Player2Position: positions.team1Player2Position,
          team2Player1Position: positions.team2Player1Position,
          team2Player2Position: positions.team2Player2Position,
          seasonId: activeSeason?.id,
          recordedById: user.id,
          isFriendly,
        })
        .returning();

      // Skip rating updates for friendly matches
      if (isFriendly) {
        return match;
      }

      const isHumiliatingDefeat =
        Math.abs(team1Score - team2Score) === 11 &&
        (team1Score === 0 || team2Score === 0);

      for (const change of ratingChanges) {
        const player = players.find(
          (p: PlayerType) => p.id === change.playerId,
        )!;
        const playerWasHumiliated = isHumiliatingDefeat && !change.won;

        const updateData: any = {
          generalMu: change.newGeneralMu,
          generalSigma: change.newGeneralSigma,
          gamesPlayed: player.gamesPlayed + 1,
          wins: player.wins + (change.won ? 1 : 0),
          losses: player.losses + (change.won ? 0 : 1),
          winStreak: change.won ? player.winStreak + 1 : 0,
          bestWinStreak: change.won
            ? Math.max(player.bestWinStreak, player.winStreak + 1)
            : player.bestWinStreak,
          humiliatingDefeats:
            player.humiliatingDefeats + (playerWasHumiliated ? 1 : 0),
          updatedAt: new Date(),
        };

        // Update role-specific ratings if present
        if (
          change.newRoleMu !== undefined &&
          change.newRoleSigma !== undefined
        ) {
          if (change.position === PlayerPosition.DEFENSE) {
            updateData.defenseMu = change.newRoleMu;
            updateData.defenseSigma = change.newRoleSigma;
            updateData.defenseGames = player.defenseGames + 1;
          } else if (change.position === PlayerPosition.ATTACK) {
            updateData.attackMu = change.newRoleMu;
            updateData.attackSigma = change.newRoleSigma;
            updateData.attackGames = player.attackGames + 1;
          } else if (change.position === PlayerPosition.SOLO) {
            updateData.soloMu = change.newRoleMu;
            updateData.soloSigma = change.newRoleSigma;
          }
        }

        await tx
          .update(schema.player)
          .set(updateData)
          .where(eq(schema.player.id, change.playerId));

        await tx.insert(schema.ratingHistory).values({
          playerId: change.playerId,
          matchId: match!.id,
          muBefore: change.oldGeneralMu,
          sigmaBefore: change.oldGeneralSigma,
          muAfter: change.newGeneralMu,
          sigmaAfter: change.newGeneralSigma,
          muChange: change.generalMuChange,
          algorithmVersion: 2,
          position: change.position,
          createdAt: match!.createdAt,
        });

        if (activeSeason) {
          const seasonStats = await tx.query.playerSeasonStats.findFirst({
            where: and(
              eq(schema.playerSeasonStats.playerId, change.playerId),
              eq(schema.playerSeasonStats.seasonId, activeSeason.id),
            ),
          });

          if (seasonStats) {
            await tx
              .update(schema.playerSeasonStats)
              .set({
                gamesPlayed: seasonStats.gamesPlayed + 1,
                wins: seasonStats.wins + (change.won ? 1 : 0),
                losses: seasonStats.losses + (change.won ? 0 : 1),
                winStreak: change.won ? seasonStats.winStreak + 1 : 0,
                bestWinStreak: change.won
                  ? Math.max(
                      seasonStats.bestWinStreak,
                      seasonStats.winStreak + 1,
                    )
                  : seasonStats.bestWinStreak,
                humiliatingDefeats:
                  seasonStats.humiliatingDefeats +
                  (playerWasHumiliated ? 1 : 0),
                currentMu: change.newGeneralMu,
                currentSigma: change.newGeneralSigma,
                muDelta: change.newGeneralMu - seasonStats.startMu,
                updatedAt: new Date(),
              })
              .where(eq(schema.playerSeasonStats.id, seasonStats.id));
          }
        }
      }

      return match;
    });

    // Determine if the logged-in user won
    const loggedInPlayer = await db.query.player.findFirst({
      where: eq(schema.player.userId, user.id),
    });

    let userWon: boolean | undefined;
    if (loggedInPlayer && !isFriendly && ratingChanges.length > 0) {
      const playerChange = ratingChanges.find(
        (c) => c.playerId === loggedInPlayer.id,
      );
      userWon = playerChange?.won ?? false;
    }

    const cacheKeysToDelete = computeAffectedLeaderboardKeys({
      globalChanged: true,
      seasonIds: activeSeason?.id ? [activeSeason.id] : [],
    });
    await deleteCacheKeys(c.env, cacheKeysToDelete);

    const affectedPlayers = playerIds;
    const affectedSeasons = activeSeason?.id ? [activeSeason.id] : [];

    await notifyStatsHub(c.env, {
      type: "match-updated",
      players: affectedPlayers,
      seasons: affectedSeasons,
      leaderboards: [
        "players",
        "team",
        ...affectedSeasons.map((id) => `season:${id}`),
      ],
    });

    return c.json(
      {
        success: true,
        matchId: result!.id,
        ratingChanges: ratingChanges.map((change) => ({
          playerId: change.playerId,
          displayName: players.find(
            (p: PlayerType) => p.id === change.playerId,
          )!.displayName,
          oldRating: Math.round(change.oldGeneralMu),
          newRating: Math.round(change.newGeneralMu),
          ratingChange: Math.round(change.generalMuChange),
          displayRating: change.displayRating,
        })),
        userWon,
      },
      201,
    );
  },
);

// GET /matches (list matches) - Requires authentication
matchRoutes.get(
  "/matches",
  requireAuth,
  zValidator("query", listMatchesSchema),
  async (c) => {
    const { page, limit, playerId, includeDeleted } = c.req.valid("query");
    const db = createDatabase(c.env);
    const offset = (page - 1) * limit;

    // Check if user is admin
    const user = c.get("user")!;
    const isAdmin = user.isAdmin;

    const canIncludeDeleted = includeDeleted && isAdmin;

    const deletedClause = canIncludeDeleted
      ? undefined
      : eq(schema.match.isDeleted, false);

    const whereClause = playerId
      ? and(
          deletedClause,
          or(
            eq(schema.match.team1Player1Id, playerId),
            eq(schema.match.team1Player2Id, playerId),
            eq(schema.match.team2Player1Id, playerId),
            eq(schema.match.team2Player2Id, playerId),
          ),
        )
      : deletedClause;

    const [matchesData, totalData] = await Promise.all([
      db.query.match.findMany({
        where: whereClause,
        orderBy: desc(schema.match.createdAt),
        limit,
        offset,
      }),
      db
        .select({ count: schema.match.id })
        .from(schema.match)
        .where(whereClause),
    ]);

    const allPlayerIds = new Set<string>();
    const allTableIds = new Set<string>();
    for (const match of matchesData) {
      allPlayerIds.add(match.team1Player1Id);
      if (match.team1Player2Id) allPlayerIds.add(match.team1Player2Id);
      allPlayerIds.add(match.team2Player1Id);
      if (match.team2Player2Id) allPlayerIds.add(match.team2Player2Id);
      if (match.tableId) allTableIds.add(match.tableId);
    }

    type PlayerType = { id: string; displayName: string };
    type MatchType = typeof schema.match.$inferSelect;

    const [players, tables] = await Promise.all([
      db.query.player.findMany({
        where: inArray(schema.player.id, Array.from(allPlayerIds)),
        columns: {
          id: true,
          displayName: true,
        },
      }),
      allTableIds.size > 0
        ? db.query.foosballTable.findMany({
            where: inArray(schema.foosballTable.id, Array.from(allTableIds)),
            columns: {
              id: true,
              brand: true,
              model: true,
              notes: true,
            },
          })
        : [],
    ]);

    const playerMap = new Map(players.map((p: PlayerType) => [p.id, p]));
    const tableMap = new Map(
      tables.map((t) => [
        t.id,
        { id: t.id, brand: t.brand, model: t.model, notes: t.notes },
      ]),
    );

    const matches = matchesData.map((match: MatchType) => ({
      id: match.id,
      team1Player1: {
        id: match.team1Player1Id,
        displayName:
          playerMap.get(match.team1Player1Id)?.displayName ?? "Unknown",
        position: match.team1Player1Position,
      },
      team1Player2: match.team1Player2Id
        ? {
            id: match.team1Player2Id,
            displayName:
              playerMap.get(match.team1Player2Id)?.displayName ?? "Unknown",
            position: match.team1Player2Position,
          }
        : null,
      team2Player1: {
        id: match.team2Player1Id,
        displayName:
          playerMap.get(match.team2Player1Id)?.displayName ?? "Unknown",
        position: match.team2Player1Position,
      },
      team2Player2: match.team2Player2Id
        ? {
            id: match.team2Player2Id,
            displayName:
              playerMap.get(match.team2Player2Id)?.displayName ?? "Unknown",
            position: match.team2Player2Position,
          }
        : null,
      team1Score: match.team1Score,
      team2Score: match.team2Score,
      matchType: match.matchType,
      winningTeam: match.winningTeam,
      table: match.tableId ? tableMap.get(match.tableId) || null : null,
      isDeleted: match.isDeleted,
      deletedAt: match.deletedAt,
      createdAt: match.createdAt,
    }));

    return c.json(
      {
        matches,
        pagination: {
          page,
          limit,
          total: totalData.length,
        },
      },
      200,
    );
  },
);

// GET /match/:id
matchRoutes.get("/match/:id", requireAuth, async (c) => {
  const id = c.req.param("id");
  const db = createDatabase(c.env);

  const match = await db.query.match.findFirst({
    where: eq(schema.match.id, id),
  });

  if (!match || match.isDeleted) {
    throw new CustomError("Match not found", ErrorCode.NOT_FOUND);
  }

  const playerIds = [
    match.team1Player1Id,
    match.team1Player2Id,
    match.team2Player1Id,
    match.team2Player2Id,
  ].filter((id): id is string => id !== null);

  type PlayerType = { id: string; displayName: string };
  type RatingHistoryType = typeof schema.ratingHistory.$inferSelect;

  const [players, ratingHistoryData, table] = await Promise.all([
    db.query.player.findMany({
      where: inArray(schema.player.id, playerIds),
      columns: { id: true, displayName: true },
    }),
    db.query.ratingHistory.findMany({
      where: eq(schema.ratingHistory.matchId, id),
    }),
    match.tableId
      ? db.query.foosballTable.findFirst({
          where: eq(schema.foosballTable.id, match.tableId),
          columns: {
            id: true,
            brand: true,
            model: true,
            notes: true,
          },
        })
      : null,
  ]);

  const playerMap = new Map(players.map((p: PlayerType) => [p.id, p]));

  const team1PlayerIds = [match.team1Player1Id, match.team1Player2Id].filter(
    (id): id is string => id !== null,
  );
  const team2PlayerIds = [match.team2Player1Id, match.team2Player2Id].filter(
    (id): id is string => id !== null,
  );

  const ratingChanges = [
    ...ratingHistoryData
      .filter((h: RatingHistoryType) => team1PlayerIds.includes(h.playerId))
      .map((h: RatingHistoryType) => ({
        playerId: h.playerId,
        displayName: playerMap.get(h.playerId)?.displayName ?? "Unknown",
        muBefore: h.muBefore,
        muAfter: h.muAfter,
        muChange: h.muChange,
        sigmaBefore: h.sigmaBefore,
        sigmaAfter: h.sigmaAfter,
      })),
    ...ratingHistoryData
      .filter((h: RatingHistoryType) => team2PlayerIds.includes(h.playerId))
      .map((h: RatingHistoryType) => ({
        playerId: h.playerId,
        displayName: playerMap.get(h.playerId)?.displayName ?? "Unknown",
        muBefore: h.muBefore,
        muAfter: h.muAfter,
        muChange: h.muChange,
        sigmaBefore: h.sigmaBefore,
        sigmaAfter: h.sigmaAfter,
      })),
  ];

  return c.json(
    {
      match: {
        id: match.id,
        team1Player1: {
          id: match.team1Player1Id,
          displayName:
            playerMap.get(match.team1Player1Id)?.displayName ?? "Unknown",
          position: match.team1Player1Position,
        },
        team1Player2: match.team1Player2Id
          ? {
              id: match.team1Player2Id,
              displayName:
                playerMap.get(match.team1Player2Id)?.displayName ?? "Unknown",
              position: match.team1Player2Position,
            }
          : null,
        team2Player1: {
          id: match.team2Player1Id,
          displayName:
            playerMap.get(match.team2Player1Id)?.displayName ?? "Unknown",
          position: match.team2Player1Position,
        },
        team2Player2: match.team2Player2Id
          ? {
              id: match.team2Player2Id,
              displayName:
                playerMap.get(match.team2Player2Id)?.displayName ?? "Unknown",
              position: match.team2Player2Position,
            }
          : null,
        team1Score: match.team1Score,
        team2Score: match.team2Score,
        matchType: match.matchType,
        winningTeam: match.winningTeam,
        table: table
          ? {
              id: table.id,
              brand: table.brand,
              model: table.model,
              notes: table.notes,
            }
          : null,
        createdAt: match.createdAt,
      },
      ratingChanges,
    },
    200,
  );
});
