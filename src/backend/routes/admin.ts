import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod";
import type { Env } from "../bindings";
import { createDatabase } from "../drizzle/db";
import * as schema from "../drizzle/schema";
import { CustomError } from "../error/CustomError";
import { ErrorCode } from "../error/ErrorCodes";
import { calculateRatingChanges } from "../utils/openskill-calculator";
import { PlayerPosition } from "@/api-models/position";
import { requireAdmin } from "../middleware/auth";
import { errorHandler } from "../middleware/errorHandler";
import { validateMatchScores } from "../utils/match-validator";
import { deleteCacheKeys } from "../utils/cache";
import { computeAffectedLeaderboardKeys } from "../utils/leaderboard";

export const adminRoutes = new Hono<{ Bindings: Env }>();

// Use centralized error handler
adminRoutes.onError(errorHandler);

// Schemas
const createSeasonSchema = z.object({
  name: z.string().min(1).max(100),
  startDate: z.preprocess(
    (val) => (val === "" || val === null ? undefined : val),
    z
      .string()
      .optional()
      .refine(
        (val) => val === undefined || !isNaN(Date.parse(val)),
        "Invalid start date format",
      ),
  ),
  icon: z.string().optional(),
});

const updateSeasonSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  startDate: z.preprocess(
    (val) => (val === "" || val === null ? undefined : val),
    z
      .string()
      .optional()
      .refine(
        (val) => val === undefined || !isNaN(Date.parse(val)),
        "Invalid start date format",
      ),
  ),
  endDate: z.preprocess(
    (val) => (val === "" || val === null ? null : val),
    z
      .union([z.string(), z.null()])
      .optional()
      .refine(
        (val) => val === null || val === undefined || !isNaN(Date.parse(val)),
        "Invalid end date format",
      ),
  ),
  icon: z.string().nullable().optional(),
});

const seasonIdParamsSchema = z.object({
  seasonId: z.string(),
});

const matchIdParamsSchema = z.object({
  id: z.string(),
});

const updateMatchSchema = z.object({
  team1Score: z.number().int().min(0),
  team2Score: z.number().int().min(0),
});

const assignMatchesToSeasonSchema = z.object({
  matchIds: z
    .array(z.string())
    .min(1, "Must provide at least one match ID")
    .max(100, "Cannot assign more than 100 matches at once"),
  seasonId: z.string().nullable(),
});

// Helper function to process a single match and update ratings
type PlayerType = typeof schema.player.$inferSelect;
type PlayerMapType = Map<string, PlayerType>;
type TransactionType = Parameters<
  Parameters<ReturnType<typeof createDatabase>["transaction"]>[0]
>[0];

async function processMatch(
  match: typeof schema.match.$inferSelect,
  playerMap: PlayerMapType,
  tx: TransactionType,
  activeSeason: typeof schema.season.$inferSelect | null,
): Promise<void> {
  if (match.isFriendly) {
    return;
  }

  const playerIds = [
    match.team1Player1Id,
    match.team1Player2Id,
    match.team2Player1Id,
    match.team2Player2Id,
  ].filter((id): id is string => id !== null);

  // Ensure all players are in the map
  const players = await tx.query.player.findMany({
    where: inArray(schema.player.id, playerIds),
  });

  for (const player of players) {
    if (!playerMap.has(player.id)) {
      playerMap.set(player.id, player);
    }
  }

  const isHumiliatingDefeat =
    Math.abs(match.team1Score - match.team2Score) === 11 &&
    (match.team1Score === 0 || match.team2Score === 0);

  const ratingChanges = calculateRatingChanges({
    team1: {
      player1: {
        ...playerMap.get(match.team1Player1Id)!,
        position: match.team1Player1Position as PlayerPosition,
      },
      player2: match.team1Player2Id
        ? {
            ...playerMap.get(match.team1Player2Id)!,
            position: match.team1Player2Position! as PlayerPosition,
          }
        : null,
    },
    team2: {
      player1: {
        ...playerMap.get(match.team2Player1Id)!,
        position: match.team2Player1Position as PlayerPosition,
      },
      player2: match.team2Player2Id
        ? {
            ...playerMap.get(match.team2Player2Id)!,
            position: match.team2Player2Position! as PlayerPosition,
          }
        : null,
    },
    winningTeam: match.winningTeam as 1 | 2,
    matchType: match.matchType,
  });

  for (const change of ratingChanges) {
    const player = playerMap.get(change.playerId)!;
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
    if (change.newRoleMu !== undefined && change.newRoleSigma !== undefined) {
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
      matchId: match.id,
      muBefore: change.oldGeneralMu,
      sigmaBefore: change.oldGeneralSigma,
      muAfter: change.newGeneralMu,
      sigmaAfter: change.newGeneralSigma,
      muChange: change.generalMuChange,
      algorithmVersion: 2,
      position: change.position,
      createdAt: match.createdAt,
    });

    // Update season stats if applicable
    if (activeSeason && match.seasonId === activeSeason.id) {
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
              ? Math.max(seasonStats.bestWinStreak, seasonStats.winStreak + 1)
              : seasonStats.bestWinStreak,
            humiliatingDefeats:
              seasonStats.humiliatingDefeats + (playerWasHumiliated ? 1 : 0),
            currentMu: change.newGeneralMu,
            currentSigma: change.newGeneralSigma,
            muDelta: change.newGeneralMu - seasonStats.startMu,
            updatedAt: new Date(),
          })
          .where(eq(schema.playerSeasonStats.id, seasonStats.id));
      }
    }

    // Update in-memory player map for next iteration
    const updatedPlayer = {
      ...player,
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
    };

    // Update role-specific fields in memory
    if (change.newRoleMu !== undefined && change.newRoleSigma !== undefined) {
      if (change.position === PlayerPosition.DEFENSE) {
        updatedPlayer.defenseMu = change.newRoleMu;
        updatedPlayer.defenseSigma = change.newRoleSigma;
        updatedPlayer.defenseGames = player.defenseGames + 1;
      } else if (change.position === PlayerPosition.ATTACK) {
        updatedPlayer.attackMu = change.newRoleMu;
        updatedPlayer.attackSigma = change.newRoleSigma;
        updatedPlayer.attackGames = player.attackGames + 1;
      } else if (change.position === PlayerPosition.SOLO) {
        updatedPlayer.soloMu = change.newRoleMu;
        updatedPlayer.soloSigma = change.newRoleSigma;
      }
    }

    playerMap.set(change.playerId, updatedPlayer);
  }
}

// Helper function to recalculate ratings from a specific match forward
async function recalculateRatingsFromMatch(
  matchId: string,
  tx: TransactionType,
): Promise<{ matchesReplayed: number; playersUpdated: number }> {
  // Find the edited match
  const editedMatch = await tx.query.match.findFirst({
    where: eq(schema.match.id, matchId),
  });

  if (!editedMatch) {
    throw new CustomError("Match not found", ErrorCode.NOT_FOUND);
  }

  // Find all matches from the edited match forward (chronologically)
  const subsequentMatches = await tx.query.match.findMany({
    where: and(
      eq(schema.match.isDeleted, false),
      gte(schema.match.createdAt, editedMatch.createdAt),
    ),
    orderBy: asc(schema.match.createdAt),
  });

  // Hard guard to prevent excessively large replays via the HTTP API
  if (subsequentMatches.length > 2000) {
    throw new CustomError(
      "Too many matches to replay from this edit via API. Please use the offline/script-based recalculation instead.",
      ErrorCode.VALIDATION_ERROR,
    );
  }

  // Identify all affected players
  const affectedPlayerIds = new Set<string>();
  for (const match of subsequentMatches) {
    if (match.team1Player1Id) affectedPlayerIds.add(match.team1Player1Id);
    if (match.team1Player2Id) affectedPlayerIds.add(match.team1Player2Id);
    if (match.team2Player1Id) affectedPlayerIds.add(match.team2Player1Id);
    if (match.team2Player2Id) affectedPlayerIds.add(match.team2Player2Id);
  }

  // Get all affected players
  const affectedPlayers = await tx.query.player.findMany({
    where: inArray(schema.player.id, Array.from(affectedPlayerIds)),
  });

  // Find all matches before the edited match (using SQL for better performance)
  const matchesBeforeEdited = await tx.query.match.findMany({
    where: and(
      eq(schema.match.isDeleted, false),
      lte(schema.match.createdAt, editedMatch.createdAt),
    ),
    orderBy: asc(schema.match.createdAt),
  });

  // Filter to exclude the edited match itself
  const matchesBefore = matchesBeforeEdited.filter((m) => m.id !== matchId);
  const matchIdsBefore = new Set(matchesBefore.map((m) => m.id));

  // Restore player ratings to pre-edit state
  for (const player of affectedPlayers) {
    // Get all rating history entries for this player
    const allHistory = await tx.query.ratingHistory.findMany({
      where: eq(schema.ratingHistory.playerId, player.id),
      orderBy: asc(schema.ratingHistory.createdAt),
    });

    // Find the last history entry that's from a match before the edited match
    let lastValidHistory: typeof schema.ratingHistory.$inferSelect | null =
      null;
    for (const history of allHistory) {
      if (matchIdsBefore.has(history.matchId)) {
        lastValidHistory = history;
      }
    }

    // Restore ratings from history or use initial values
    const restoreData: any = {
      updatedAt: new Date(),
    };

    if (lastValidHistory) {
      // Restore from the last valid history entry
      restoreData.generalMu = lastValidHistory.muAfter;
      restoreData.generalSigma = lastValidHistory.sigmaAfter;

      // For role-specific ratings, we need to find the last entry for each position
      // For simplicity, we'll restore general ratings and let the replay handle role-specific
      // This is a simplification - in a perfect world we'd track role-specific history separately
      restoreData.defenseMu = 25;
      restoreData.defenseSigma = 8.333;
      restoreData.attackMu = 25;
      restoreData.attackSigma = 8.333;
      restoreData.soloMu = 25;
      restoreData.soloSigma = 8.333;
    } else {
      // No history - restore to initial values
      restoreData.generalMu = 25;
      restoreData.generalSigma = 8.333;
      restoreData.defenseMu = 25;
      restoreData.defenseSigma = 8.333;
      restoreData.attackMu = 25;
      restoreData.attackSigma = 8.333;
      restoreData.soloMu = 25;
      restoreData.soloSigma = 8.333;
    }

    // Count matches before the edited match to reset stats
    const playerMatchesBefore = matchesBefore.filter(
      (m) =>
        m.team1Player1Id === player.id ||
        m.team1Player2Id === player.id ||
        m.team2Player1Id === player.id ||
        m.team2Player2Id === player.id,
    );

    let wins = 0;
    let losses = 0;
    let gamesPlayed = 0;
    let defenseGames = 0;
    let attackGames = 0;
    let humiliatingDefeats = 0;
    let currentWinStreak = 0;
    let bestWinStreak = 0;

    for (const match of playerMatchesBefore) {
      if (match.isFriendly) continue;

      const wasTeam1 =
        match.team1Player1Id === player.id ||
        match.team1Player2Id === player.id;
      const won = wasTeam1 ? match.winningTeam === 1 : match.winningTeam === 2;

      gamesPlayed++;
      if (won) {
        wins++;
        currentWinStreak++;
        bestWinStreak = Math.max(bestWinStreak, currentWinStreak);
      } else {
        losses++;
        currentWinStreak = 0;
      }

      const isHumiliating =
        Math.abs(match.team1Score - match.team2Score) === 11 &&
        (match.team1Score === 0 || match.team2Score === 0) &&
        !won;
      if (isHumiliating) {
        humiliatingDefeats++;
      }

      // Count role-specific games
      const position =
        match.team1Player1Id === player.id
          ? match.team1Player1Position
          : match.team1Player2Id === player.id
            ? match.team1Player2Position
            : match.team2Player1Id === player.id
              ? match.team2Player1Position
              : match.team2Player2Position;

      if (position === PlayerPosition.DEFENSE) {
        defenseGames++;
      } else if (position === PlayerPosition.ATTACK) {
        attackGames++;
      }
    }

    restoreData.gamesPlayed = gamesPlayed;
    restoreData.wins = wins;
    restoreData.losses = losses;
    restoreData.winStreak = currentWinStreak;
    restoreData.bestWinStreak = bestWinStreak;
    restoreData.humiliatingDefeats = humiliatingDefeats;
    restoreData.defenseGames = defenseGames;
    restoreData.attackGames = attackGames;

    await tx
      .update(schema.player)
      .set(restoreData)
      .where(eq(schema.player.id, player.id));
  }

  // Reset season stats for affected players
  const activeSeason = await tx.query.season.findFirst({
    where: eq(schema.season.isActive, true),
  });

  if (activeSeason) {
    for (const player of affectedPlayers) {
      const seasonStats = await tx.query.playerSeasonStats.findFirst({
        where: and(
          eq(schema.playerSeasonStats.playerId, player.id),
          eq(schema.playerSeasonStats.seasonId, activeSeason.id),
        ),
      });

      if (seasonStats) {
        // Count matches in this season before the edited match
        const seasonMatchesBefore = matchesBefore.filter(
          (m) =>
            m.seasonId === activeSeason.id &&
            (m.team1Player1Id === player.id ||
              m.team1Player2Id === player.id ||
              m.team2Player1Id === player.id ||
              m.team2Player2Id === player.id),
        );

        let seasonWins = 0;
        const seasonLosses = 0;
        let seasonGames = 0;
        let seasonWinStreak = 0;
        let seasonBestWinStreak = 0;
        let seasonHumiliatingDefeats = 0;

        for (const match of seasonMatchesBefore) {
          if (match.isFriendly) continue;

          const wasTeam1 =
            match.team1Player1Id === player.id ||
            match.team1Player2Id === player.id;
          const won = wasTeam1
            ? match.winningTeam === 1
            : match.winningTeam === 2;

          seasonGames++;
          if (won) {
            seasonWins++;
            seasonWinStreak++;
            seasonBestWinStreak = Math.max(
              seasonBestWinStreak,
              seasonWinStreak,
            );
          } else {
            seasonWinStreak = 0;
          }

          const isHumiliating =
            Math.abs(match.team1Score - match.team2Score) === 11 &&
            (match.team1Score === 0 || match.team2Score === 0) &&
            !won;
          if (isHumiliating) {
            seasonHumiliatingDefeats++;
          }
        }

        // Get the player's current state (after restore above)
        const restoredPlayer = await tx.query.player.findFirst({
          where: eq(schema.player.id, player.id),
        });

        await tx
          .update(schema.playerSeasonStats)
          .set({
            gamesPlayed: seasonGames,
            wins: seasonWins,
            losses: seasonLosses,
            winStreak: seasonWinStreak,
            bestWinStreak: seasonBestWinStreak,
            humiliatingDefeats: seasonHumiliatingDefeats,
            currentMu: restoredPlayer!.generalMu,
            currentSigma: restoredPlayer!.generalSigma,
            muDelta: restoredPlayer!.generalMu - seasonStats.startMu,
            updatedAt: new Date(),
          })
          .where(eq(schema.playerSeasonStats.id, seasonStats.id));
      }
    }
  }

  // Find all matches before the edited match that involve affected players
  // We need to replay these to restore role-specific ratings
  const preEditMatchesForAffectedPlayers = matchesBefore.filter((match) => {
    const playerIds = [
      match.team1Player1Id,
      match.team1Player2Id,
      match.team2Player1Id,
      match.team2Player2Id,
    ].filter((id): id is string => id !== null);
    return playerIds.some((id) => affectedPlayerIds.has(id));
  });

  // Delete rating history for all matches involving affected players
  // This includes both pre-edit matches (which we'll replay) and subsequent matches
  // We need to delete pre-edit history because we'll recreate it when replaying
  const allMatchesToReplay = [
    ...preEditMatchesForAffectedPlayers,
    ...subsequentMatches,
  ];
  const matchIdsToDelete = allMatchesToReplay.map((m) => m.id);
  if (matchIdsToDelete.length > 0) {
    await tx
      .delete(schema.ratingHistory)
      .where(inArray(schema.ratingHistory.matchId, matchIdsToDelete));
  }

  // Initialize player map with current state (after restore)
  // Start with affected players (whose ratings we just restored)
  const playerMap: PlayerMapType = new Map();
  for (const player of affectedPlayers) {
    const currentPlayer = await tx.query.player.findFirst({
      where: eq(schema.player.id, player.id),
    });
    if (currentPlayer) {
      playerMap.set(player.id, currentPlayer);
    }
  }

  // Also load any other players who appear in pre-edit matches
  // (they might have played with affected players)
  // Note: processMatch will also load missing players, but pre-loading is more efficient
  const allPlayerIdsInPreEditMatches = new Set<string>();
  for (const match of preEditMatchesForAffectedPlayers) {
    if (match.team1Player1Id)
      allPlayerIdsInPreEditMatches.add(match.team1Player1Id);
    if (match.team1Player2Id)
      allPlayerIdsInPreEditMatches.add(match.team1Player2Id);
    if (match.team2Player1Id)
      allPlayerIdsInPreEditMatches.add(match.team2Player1Id);
    if (match.team2Player2Id)
      allPlayerIdsInPreEditMatches.add(match.team2Player2Id);
  }

  // Filter to only players not already in the map
  const playerIdsToLoad = Array.from(allPlayerIdsInPreEditMatches).filter(
    (id) => !playerMap.has(id),
  );

  if (playerIdsToLoad.length > 0) {
    const otherPlayers = await tx.query.player.findMany({
      where: inArray(schema.player.id, playerIdsToLoad),
    });

    for (const player of otherPlayers) {
      playerMap.set(player.id, player);
    }
  }

  // Replay pre-edit matches chronologically to build up role-specific ratings
  // This is necessary because role-specific ratings need to be built up from scratch
  // to their pre-edit state
  for (const match of preEditMatchesForAffectedPlayers) {
    const matchSeason =
      match.seasonId && activeSeason && match.seasonId === activeSeason.id
        ? activeSeason
        : null;
    await processMatch(match, playerMap, tx, matchSeason);
  }

  // Now replay the edited match and all subsequent matches
  // These will use the correct role-specific ratings from the pre-edit replay
  for (const match of subsequentMatches) {
    const matchSeason =
      match.seasonId && activeSeason && match.seasonId === activeSeason.id
        ? activeSeason
        : null;
    await processMatch(match, playerMap, tx, matchSeason);
  }

  return {
    matchesReplayed:
      preEditMatchesForAffectedPlayers.length + subsequentMatches.length,
    playersUpdated: affectedPlayers.length,
  };
}

// POST /admin/seasons
adminRoutes.post(
  "/admin/seasons",
  requireAdmin,
  zValidator("json", createSeasonSchema),
  async (c) => {
    const user = c.get("user")!;
    const { name, startDate, icon } = c.req.valid("json");
    const db = createDatabase(c.env);

    const result = await db.transaction(async (tx) => {
      // Get the most recently ended season to get its winner
      const previousSeason = await tx.query.season.findFirst({
        where: and(
          eq(schema.season.isActive, false),
          // endDate is not null means it was properly ended
        ),
        orderBy: (seasons, { desc }) => [desc(seasons.endDate)],
      });

      // End previous active season (if any)
      await tx
        .update(schema.season)
        .set({
          isActive: false,
          endDate: new Date(),
        })
        .where(eq(schema.season.isActive, true));

      // Create new season with previous winner
      const [newSeason] = await tx
        .insert(schema.season)
        .values({
          name,
          startDate: startDate ? new Date(startDate) : new Date(),
          isActive: true,
          createdById: user.id,
          previousWinnerId: previousSeason?.winnerId || null,
          icon: null, // Will update after upload if icon provided
        })
        .returning();

      // Upload icon if provided (after season is created so we have the ID)
      if (icon && newSeason) {
        const { uploadSeasonIconToR2 } = await import("../utils/r2");
        const iconUrl = await uploadSeasonIconToR2(
          c.env.SEASON_ICONS_R2,
          newSeason.id,
          icon,
        );
        // Update season with icon URL
        await tx
          .update(schema.season)
          .set({ icon: iconUrl })
          .where(eq(schema.season.id, newSeason.id));
        newSeason.icon = iconUrl;
      }

      const allPlayers = await tx.query.player.findMany();

      if (!newSeason) {
        throw new Error("Failed to create season");
      }

      for (const player of allPlayers) {
        await tx.insert(schema.playerSeasonStats).values({
          playerId: player.id,
          seasonId: newSeason.id,
          startMu: player.generalMu,
          startSigma: player.generalSigma,
          currentMu: player.generalMu,
          currentSigma: player.generalSigma,
        });
      }

      return { season: newSeason, playersInitialized: allPlayers.length };
    });

    if (!result.season) {
      throw new Error("Failed to create season");
    }

    const cacheKeys = computeAffectedLeaderboardKeys({
      globalChanged: true,
      seasonIds: [result.season.id],
    });
    await deleteCacheKeys(c.env, cacheKeys);

    return c.json(
      {
        season: {
          id: result.season.id,
          name: result.season.name,
          startDate: result.season.startDate,
          isActive: result.season.isActive,
          icon: result.season.icon,
        },
        playersInitialized: result.playersInitialized,
      },
      201,
    );
  },
);

// POST /admin/seasons/:seasonId/end
adminRoutes.post(
  "/admin/seasons/:seasonId/end",
  requireAdmin,
  zValidator("param", seasonIdParamsSchema),
  async (c) => {
    const { seasonId } = c.req.valid("param");
    const db = createDatabase(c.env);

    const season = await db.query.season.findFirst({
      where: eq(schema.season.id, seasonId),
    });

    if (!season) {
      throw new CustomError("Season not found", ErrorCode.NOT_FOUND);
    }

    if (!season.isActive) {
      throw new CustomError(
        "Season is already ended",
        ErrorCode.VALIDATION_ERROR,
      );
    }

    // Import MVP calculator functions
    const {
      calculateDiversityPenalty,
      calculateExpectedMaxGames,
      calculateTeammateQualityBonus,
      calculateWeeklyMVPScore,
      getActiveScoringConfig,
    } = await import("../utils/weekly-mvp-calculator");

    // Get active scoring config to snapshot
    const scoringConfig = await getActiveScoringConfig(db);

    // Get all matches for this season
    const seasonMatches = await db.query.match.findMany({
      where: and(
        eq(schema.match.seasonId, seasonId),
        eq(schema.match.isDeleted, false),
      ),
    });

    // Calculate expected max games
    const expectedMaxGames = await calculateExpectedMaxGames(db);

    // Get season stats
    const seasonStats = await db.query.playerSeasonStats.findMany({
      where: eq(schema.playerSeasonStats.seasonId, seasonId),
    });

    // Get all players with ratings for teammate quality bonus calculation
    const allPlayerIds = new Set<string>();
    for (const match of seasonMatches) {
      if (match.team1Player1Id) allPlayerIds.add(match.team1Player1Id);
      if (match.team1Player2Id) allPlayerIds.add(match.team1Player2Id);
      if (match.team2Player1Id) allPlayerIds.add(match.team2Player1Id);
      if (match.team2Player2Id) allPlayerIds.add(match.team2Player2Id);
    }

    const allPlayers = await db.query.player.findMany({
      where: inArray(schema.player.id, Array.from(allPlayerIds)),
      columns: {
        id: true,
        generalMu: true,
        generalSigma: true,
      },
    });

    const playerRatingsMap = new Map(
      allPlayers.map((p) => [p.id, { mu: p.generalMu, sigma: p.generalSigma }]),
    );

    // Calculate MVP scores for all players
    const mvpScores = await Promise.all(
      seasonStats.map(async (stat) => {
        const diversityPenalty = await calculateDiversityPenalty(
          stat.playerId,
          seasonId,
          seasonMatches,
          scoringConfig,
        );

        const teammateQualityBonus = await calculateTeammateQualityBonus(
          stat.playerId,
          seasonId,
          seasonMatches,
          playerRatingsMap,
        );

        const { score } = calculateWeeklyMVPScore(
          stat.wins,
          stat.losses,
          stat.gamesPlayed,
          stat.muDelta,
          diversityPenalty.combinedPenalty,
          teammateQualityBonus,
          expectedMaxGames,
          scoringConfig,
        );

        return { playerId: stat.playerId, score, muDelta: stat.muDelta };
      }),
    );

    // Find winner (highest MVP score, with fallback to muDelta for ties)
    mvpScores.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Tie-breaker: use muDelta (rating gain)
      return b.muDelta - a.muDelta;
    });
    const winner = mvpScores.length > 0 ? mvpScores[0] : null;

    // Calculate weekly stats
    const totalGames = seasonMatches.length;
    const uniquePlayers = new Set(
      seasonMatches.flatMap((m) =>
        [
          m.team1Player1Id,
          m.team1Player2Id,
          m.team2Player1Id,
          m.team2Player2Id,
        ].filter((id): id is string => id !== null),
      ),
    );
    const avgGamesPerPlayer =
      uniquePlayers.size > 0 ? totalGames / uniquePlayers.size : 0;
    const maxGames = Math.max(...seasonStats.map((s) => s.gamesPlayed), 0);

    await db.transaction(async (tx) => {
      const endDate = new Date();

      // Update season with winner and snapshot
      await tx
        .update(schema.season)
        .set({
          isActive: false,
          endDate,
          winnerId: winner?.playerId || null,
          winnerMvpScore: winner?.score || null,
          scoringConfigSnapshot: scoringConfig as any,
        })
        .where(eq(schema.season.id, seasonId));

      // Update season stats muDelta
      for (const stats of seasonStats) {
        await tx
          .update(schema.playerSeasonStats)
          .set({
            muDelta: stats.currentMu - stats.startMu,
          })
          .where(eq(schema.playerSeasonStats.id, stats.id));
      }

      // Store weekly stats
      await tx.insert(schema.weeklyStats).values({
        weekStartDate: season.startDate,
        seasonId: season.id,
        avgGamesPerPlayer,
        maxGames,
      });
    });

    const cacheKeys = computeAffectedLeaderboardKeys({
      globalChanged: true,
      seasonIds: [seasonId],
    });
    await deleteCacheKeys(c.env, cacheKeys);

    return c.json(
      {
        success: true,
        season: {
          id: season.id,
          name: season.name,
          endDate: new Date(),
          winnerId: winner?.playerId || null,
          winnerMvpScore: winner?.score || null,
        },
      },
      200,
    );
  },
);

// PATCH /admin/seasons/:seasonId
adminRoutes.patch(
  "/admin/seasons/:seasonId",
  requireAdmin,
  zValidator("param", seasonIdParamsSchema),
  zValidator("json", updateSeasonSchema),
  async (c) => {
    const { seasonId } = c.req.valid("param");
    const { name, startDate, endDate, icon } = c.req.valid("json");
    const db = createDatabase(c.env);

    const season = await db.query.season.findFirst({
      where: eq(schema.season.id, seasonId),
    });

    if (!season) {
      throw new CustomError("Season not found", ErrorCode.NOT_FOUND);
    }

    // Prevent editing ended seasons
    if (!season.isActive && season.endDate) {
      throw new CustomError(
        "Cannot edit ended seasons",
        ErrorCode.VALIDATION_ERROR,
      );
    }

    // Prevent setting endDate for active seasons (use End Season button instead)
    if (season.isActive && endDate !== undefined) {
      throw new CustomError(
        "Cannot set end date for active season. Use 'End Season' button instead.",
        ErrorCode.VALIDATION_ERROR,
      );
    }

    let iconUrl: string | null | undefined = undefined;

    // Handle icon upload/removal
    if (icon !== undefined) {
      const { uploadSeasonIconToR2, deleteSeasonIconFromR2 } =
        await import("../utils/r2");
      if (icon === null) {
        // Delete existing icon
        await deleteSeasonIconFromR2(c.env.SEASON_ICONS_R2, seasonId);
        iconUrl = null;
      } else if (icon) {
        // Upload new icon
        iconUrl = await uploadSeasonIconToR2(
          c.env.SEASON_ICONS_R2,
          seasonId,
          icon,
        );
      }
    }

    const updateData: {
      name?: string;
      startDate?: Date;
      endDate?: Date | null;
      isActive?: boolean;
      icon?: string | null;
    } = {};

    if (name !== undefined) {
      updateData.name = name;
    }
    if (startDate !== undefined) {
      updateData.startDate = new Date(startDate);
    }
    if (endDate !== undefined) {
      updateData.endDate = endDate ? new Date(endDate) : null;
      // If setting endDate, also set isActive to false
      if (endDate) {
        updateData.isActive = false;
      }
    }
    if (iconUrl !== undefined) {
      updateData.icon = iconUrl;
    }

    const [updatedSeason] = await db
      .update(schema.season)
      .set(updateData)
      .where(eq(schema.season.id, seasonId))
      .returning();

    if (!updatedSeason) {
      throw new CustomError(
        "Failed to update season",
        ErrorCode.UNEXPECTED_ERROR,
      );
    }

    const cacheKeys = computeAffectedLeaderboardKeys({
      globalChanged: true,
      seasonIds: [seasonId],
    });
    await deleteCacheKeys(c.env, cacheKeys);

    return c.json(
      {
        success: true,
        season: {
          id: updatedSeason.id,
          name: updatedSeason.name,
          startDate: updatedSeason.startDate,
          endDate: updatedSeason.endDate,
          isActive: updatedSeason.isActive,
          icon: updatedSeason.icon,
        },
      },
      200,
    );
  },
);

// DELETE /admin/match/:id
adminRoutes.delete(
  "/admin/match/:id",
  requireAdmin,
  zValidator("param", matchIdParamsSchema),
  async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");
    const db = createDatabase(c.env);

    const match = await db.query.match.findFirst({
      where: eq(schema.match.id, id),
    });

    if (!match) {
      throw new CustomError("Match not found", ErrorCode.NOT_FOUND);
    }

    if (match.isDeleted) {
      throw new CustomError(
        "Match is already deleted",
        ErrorCode.VALIDATION_ERROR,
      );
    }

    await db
      .update(schema.match)
      .set({
        isDeleted: true,
        deletedAt: new Date(),
        deletedById: user.id,
      })
      .where(eq(schema.match.id, id));

    const cacheKeys = computeAffectedLeaderboardKeys({
      globalChanged: true,
      seasonIds: match.seasonId ? [match.seasonId] : [],
    });
    await deleteCacheKeys(c.env, cacheKeys);

    return c.json(
      {
        success: true,
        message: "Match deleted successfully",
      },
      200,
    );
  },
);

// GET /admin/match/:id
adminRoutes.get(
  "/admin/match/:id",
  requireAdmin,
  zValidator("param", matchIdParamsSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const db = createDatabase(c.env);

    const match = await db.query.match.findFirst({
      where: eq(schema.match.id, id),
    });

    if (!match) {
      throw new CustomError("Match not found", ErrorCode.NOT_FOUND);
    }

    const playerIds = [
      match.team1Player1Id,
      match.team1Player2Id,
      match.team2Player1Id,
      match.team2Player2Id,
    ].filter((id): id is string => id !== null);

    const [players, recordedByUser, deletedByUser] = await Promise.all([
      db.query.player.findMany({
        where: inArray(schema.player.id, playerIds),
        columns: { id: true, displayName: true },
      }),
      db.query.user.findFirst({
        where: eq(schema.user.id, match.recordedById),
        columns: { id: true, name: true },
      }),
      match.deletedById
        ? db.query.user.findFirst({
            where: eq(schema.user.id, match.deletedById),
            columns: { id: true, name: true },
          })
        : null,
    ]);

    const playerMap = new Map(players.map((p) => [p.id, p]));

    return c.json(
      {
        match: {
          id: match.id,
          team1Player1: {
            id: match.team1Player1Id,
            displayName:
              playerMap.get(match.team1Player1Id)?.displayName ?? "Unknown",
          },
          team1Player2: match.team1Player2Id
            ? {
                id: match.team1Player2Id,
                displayName:
                  playerMap.get(match.team1Player2Id)?.displayName ?? "Unknown",
              }
            : null,
          team2Player1: {
            id: match.team2Player1Id,
            displayName:
              playerMap.get(match.team2Player1Id)?.displayName ?? "Unknown",
          },
          team2Player2: match.team2Player2Id
            ? {
                id: match.team2Player2Id,
                displayName:
                  playerMap.get(match.team2Player2Id)?.displayName ?? "Unknown",
              }
            : null,
          team1Score: match.team1Score,
          team2Score: match.team2Score,
          matchType: match.matchType,
          winningTeam: match.winningTeam,
          recordedBy: {
            id: recordedByUser!.id,
            name: recordedByUser!.name,
          },
          isDeleted: match.isDeleted,
          deletedAt: match.deletedAt,
          deletedBy: deletedByUser
            ? {
                id: deletedByUser.id,
                name: deletedByUser.name,
              }
            : null,
          createdAt: match.createdAt,
        },
      },
      200,
    );
  },
);

// PATCH /admin/match/:id
adminRoutes.patch(
  "/admin/match/:id",
  requireAdmin,
  zValidator("param", matchIdParamsSchema),
  zValidator("json", updateMatchSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const { team1Score, team2Score } = c.req.valid("json");
    const db = createDatabase(c.env);

    const startTime = Date.now();

    const result = await db.transaction(async (tx) => {
      // Fetch match first to check existence and get player IDs
      const match = await tx.query.match.findFirst({
        where: eq(schema.match.id, id),
      });

      if (!match) {
        throw new CustomError("Match not found", ErrorCode.NOT_FOUND);
      }

      if (match.isDeleted) {
        throw new CustomError(
          "Cannot edit a deleted match",
          ErrorCode.VALIDATION_ERROR,
        );
      }

      // Validate scores only (players don't change)
      const validation = validateMatchScores(team1Score, team2Score);

      if (!validation.valid) {
        throw new CustomError(validation.error!, ErrorCode.VALIDATION_ERROR);
      }

      // Calculate winning team from scores
      const winningTeam = team1Score > team2Score ? 1 : 2;

      // Update match scores
      await tx
        .update(schema.match)
        .set({
          team1Score,
          team2Score,
          winningTeam,
        })
        .where(eq(schema.match.id, id));

      // Recalculate ratings from this match forward
      const { matchesReplayed, playersUpdated } =
        await recalculateRatingsFromMatch(id, tx);

      const duration = Date.now() - startTime;

      return {
        success: true,
        summary: {
          matchesReplayed,
          playersUpdated,
          duration,
        },
      };
    });

    const cacheKeys = computeAffectedLeaderboardKeys({
      globalChanged: true,
      seasonIds: [],
    });
    await deleteCacheKeys(c.env, cacheKeys);

    return c.json(result, 200);
  },
);

// POST /admin/recalculate-ratings
// Recalculates all rating types (general, solo, attack, defense) from scratch
// by resetting all players to default ratings and replaying all matches chronologically
adminRoutes.post("/admin/recalculate-ratings", requireAdmin, async (c) => {
  const db = createDatabase(c.env);
  const startTime = Date.now();

  const result = await db.transaction(async (tx) => {
    // Reset all rating types to default values
    await tx.update(schema.player).set({
      generalMu: 25,
      generalSigma: 8.333,
      defenseMu: 25,
      defenseSigma: 8.333,
      attackMu: 25,
      attackSigma: 8.333,
      soloMu: 25,
      soloSigma: 8.333,
      gamesPlayed: 0,
      defenseGames: 0,
      attackGames: 0,
      wins: 0,
      losses: 0,
      winStreak: 0,
      bestWinStreak: 0,
      updatedAt: new Date(),
    });

    await tx.delete(schema.ratingHistory);

    const matches = await tx.query.match.findMany({
      where: eq(schema.match.isDeleted, false),
      orderBy: asc(schema.match.createdAt),
    });

    // Hard guard to prevent extremely large full-history replays via API
    if (matches.length > 5000) {
      throw new CustomError(
        "Too many matches to recalculate via API. Please use the CLI or a local script for full backfills.",
        ErrorCode.VALIDATION_ERROR,
      );
    }

    const activeSeason = await tx.query.season.findFirst({
      where: eq(schema.season.isActive, true),
    });

    const playerMap: PlayerMapType = new Map();
    for (const match of matches) {
      await processMatch(match, playerMap, tx, activeSeason ?? null);
    }

    const allPlayers = await tx.query.player.findMany();

    const duration = Date.now() - startTime;

    return {
      success: true,
      summary: {
        playersUpdated: allPlayers.length,
        matchesReplayed: matches.length,
        duration,
      },
    };
  });

  const cacheKeys = computeAffectedLeaderboardKeys({
    globalChanged: true,
    seasonIds: [],
  });
  await deleteCacheKeys(c.env, cacheKeys);

  return c.json(result, 200);
});

// POST /admin/matches/assign-season
// Bulk assigns matches to a season (or unassigns if seasonId is null)
// Recalculates playerSeasonStats for all affected seasons
adminRoutes.post(
  "/admin/matches/assign-season",
  requireAdmin,
  zValidator("json", assignMatchesToSeasonSchema),
  async (c) => {
    const { matchIds, seasonId } = c.req.valid("json");
    const db = createDatabase(c.env);
    const startTime = Date.now();

    const result = await db.transaction(async (tx) => {
      // 1. Validate matches exist and not deleted
      const matches = await tx.query.match.findMany({
        where: inArray(schema.match.id, matchIds),
      });

      if (matches.length !== matchIds.length) {
        throw new CustomError(
          "One or more matches not found",
          ErrorCode.NOT_FOUND,
        );
      }

      const deletedMatch = matches.find((m) => m.isDeleted);
      if (deletedMatch) {
        throw new CustomError(
          "Cannot reassign deleted matches",
          ErrorCode.VALIDATION_ERROR,
        );
      }

      // 2. Validate target season if provided
      let targetSeason = null;
      if (seasonId) {
        targetSeason = await tx.query.season.findFirst({
          where: eq(schema.season.id, seasonId),
        });

        if (!targetSeason) {
          throw new CustomError("Season not found", ErrorCode.NOT_FOUND);
        }

        if (!targetSeason.isActive && targetSeason.endDate) {
          throw new CustomError(
            "Cannot assign matches to an ended season",
            ErrorCode.VALIDATION_ERROR,
          );
        }
      }

      // 3. Collect affected seasons (old and new)
      const affectedSeasonIds = new Set<string>();
      for (const match of matches) {
        if (match.seasonId) affectedSeasonIds.add(match.seasonId);
      }
      if (seasonId) affectedSeasonIds.add(seasonId);

      // 4. Update match seasonIds
      await tx
        .update(schema.match)
        .set({ seasonId: seasonId })
        .where(inArray(schema.match.id, matchIds));

      // 5. Recalculate playerSeasonStats for all affected seasons
      const affectedPlayerIds = new Set<string>();

      for (const affectedSeasonId of affectedSeasonIds) {
        // Get all non-deleted, non-friendly matches for this season
        const seasonMatches = await tx.query.match.findMany({
          where: and(
            eq(schema.match.seasonId, affectedSeasonId),
            eq(schema.match.isDeleted, false),
            eq(schema.match.isFriendly, false),
          ),
          orderBy: asc(schema.match.createdAt),
        });

        // Collect all player IDs in this season
        const seasonPlayerIds = new Set<string>();
        for (const match of seasonMatches) {
          if (match.team1Player1Id) seasonPlayerIds.add(match.team1Player1Id);
          if (match.team1Player2Id) seasonPlayerIds.add(match.team1Player2Id);
          if (match.team2Player1Id) seasonPlayerIds.add(match.team2Player1Id);
          if (match.team2Player2Id) seasonPlayerIds.add(match.team2Player2Id);
        }

        // Get all playerSeasonStats for this season
        const seasonStats = await tx.query.playerSeasonStats.findMany({
          where: eq(schema.playerSeasonStats.seasonId, affectedSeasonId),
        });

        // Calculate fresh stats for each player
        for (const playerId of seasonPlayerIds) {
          affectedPlayerIds.add(playerId);

          // Find player's season stats record
          let playerSeasonStat = seasonStats.find(
            (s) => s.playerId === playerId,
          );

          // If player didn't exist in season before, create record
          if (!playerSeasonStat) {
            const player = await tx.query.player.findFirst({
              where: eq(schema.player.id, playerId),
            });

            if (!player) continue;

            const newStats = await tx
              .insert(schema.playerSeasonStats)
              .values({
                playerId,
                seasonId: affectedSeasonId,
                startMu: player.generalMu,
                startSigma: player.generalSigma,
                currentMu: player.generalMu,
                currentSigma: player.generalSigma,
              })
              .returning();

            playerSeasonStat = newStats[0];
            if (!playerSeasonStat) continue;
          }

          // Recalculate stats from scratch
          let gamesPlayed = 0;
          let wins = 0;
          let losses = 0;
          let currentWinStreak = 0;
          let bestWinStreak = 0;
          let humiliatingDefeats = 0;

          for (const match of seasonMatches) {
            const isInMatch =
              match.team1Player1Id === playerId ||
              match.team1Player2Id === playerId ||
              match.team2Player1Id === playerId ||
              match.team2Player2Id === playerId;

            if (!isInMatch) continue;

            const wasTeam1 =
              match.team1Player1Id === playerId ||
              match.team1Player2Id === playerId;
            const won = wasTeam1
              ? match.winningTeam === 1
              : match.winningTeam === 2;

            gamesPlayed++;
            if (won) {
              wins++;
              currentWinStreak++;
              bestWinStreak = Math.max(bestWinStreak, currentWinStreak);
            } else {
              losses++;
              currentWinStreak = 0;
            }

            const isHumiliating =
              Math.abs(match.team1Score - match.team2Score) === 11 &&
              (match.team1Score === 0 || match.team2Score === 0) &&
              !won;
            if (isHumiliating) {
              humiliatingDefeats++;
            }
          }

          // Get player's current rating for muDelta calculation
          const player = await tx.query.player.findFirst({
            where: eq(schema.player.id, playerId),
          });

          if (!player) continue;

          // Update stats
          await tx
            .update(schema.playerSeasonStats)
            .set({
              gamesPlayed,
              wins,
              losses,
              winStreak: currentWinStreak,
              bestWinStreak,
              humiliatingDefeats,
              currentMu: player.generalMu,
              currentSigma: player.generalSigma,
              muDelta: player.generalMu - playerSeasonStat.startMu,
              updatedAt: new Date(),
            })
            .where(eq(schema.playerSeasonStats.id, playerSeasonStat.id));
        }

        // Remove players who no longer have matches in this season
        const playersToRemove = seasonStats
          .filter((stat) => !seasonPlayerIds.has(stat.playerId))
          .map((stat) => stat.id);

        if (playersToRemove.length > 0) {
          await tx
            .delete(schema.playerSeasonStats)
            .where(inArray(schema.playerSeasonStats.id, playersToRemove));
        }
      }

      return {
        matchesUpdated: matchIds.length,
        seasonsAffected: Array.from(affectedSeasonIds),
        playersAffected: affectedPlayerIds.size,
      };
    });

    const duration = Date.now() - startTime;

    const cacheKeys = computeAffectedLeaderboardKeys({
      globalChanged: true,
      seasonIds: result.seasonsAffected,
    });
    await deleteCacheKeys(c.env, cacheKeys);

    return c.json(
      {
        success: true,
        summary: {
          ...result,
          duration,
        },
      },
      200,
    );
  },
);
