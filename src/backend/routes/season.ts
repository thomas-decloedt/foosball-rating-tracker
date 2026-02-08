import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { desc, eq, inArray, and } from "drizzle-orm";
import { z } from "zod";
import type { Env } from "../bindings";
import { createDatabase } from "../drizzle/db";
import * as schema from "../drizzle/schema";
import { CustomError } from "../error/CustomError";
import { ErrorCode } from "../error/ErrorCodes";
import { requireAuth } from "../middleware/auth";
import { errorHandler } from "../middleware/errorHandler";
import { conservativeRating } from "../utils/rating-display";
import {
  calculateDiversityPenalty,
  calculateExpectedMaxGames,
  calculateTeammateQualityBonus,
  calculateWeeklyMVPScore,
  getSeasonScoringConfig,
  type MVPScoreBreakdown,
} from "../utils/weekly-mvp-calculator";
import { getCachedJson, setCachedJson } from "../utils/cache";
import { buildLeaderboardCacheKey } from "../utils/leaderboard";

export const seasonRoutes = new Hono<{ Bindings: Env }>();

// Use centralized error handler
seasonRoutes.onError(errorHandler);

// Schemas
const listSeasonsQuerySchema = z.object({
  includeInactive: z.coerce.boolean().default(true),
});

const getSeasonLeaderboardParamsSchema = z.object({
  seasonId: z.string(),
});

const getSeasonLeaderboardQuerySchema = z.object({
  filter: z.enum(["standard", "mvp", "biggest_losers"]).default("standard"),
  minGames: z.coerce.number().int().min(0).default(0).optional(),
});

// GET /seasons
seasonRoutes.get(
  "/seasons",
  requireAuth,
  zValidator("query", listSeasonsQuerySchema),
  async (c) => {
    const { includeInactive } = c.req.valid("query");
    const db = createDatabase(c.env);

    const seasons = await db.query.season.findMany({
      where: includeInactive ? undefined : eq(schema.season.isActive, true),
      orderBy: desc(schema.season.startDate),
    });

    return c.json(
      {
        seasons: seasons.map((s) => ({
          id: s.id,
          name: s.name,
          startDate: s.startDate,
          endDate: s.endDate,
          isActive: s.isActive,
          createdAt: s.createdAt,
          icon: s.icon,
        })),
      },
      200,
    );
  },
);

// GET /seasons/:seasonId/leaderboard
seasonRoutes.get(
  "/seasons/:seasonId/leaderboard",
  requireAuth,
  zValidator("param", getSeasonLeaderboardParamsSchema),
  zValidator("query", getSeasonLeaderboardQuerySchema),
  async (c) => {
    const { seasonId } = c.req.valid("param");
    const { filter = "standard" } = c.req.valid("query");
    const db = createDatabase(c.env);

    const season = await db.query.season.findFirst({
      where: eq(schema.season.id, seasonId),
    });

    if (!season) {
      throw new CustomError("Season not found", ErrorCode.NOT_FOUND);
    }

    let seasonStats = await db.query.playerSeasonStats.findMany({
      where: eq(schema.playerSeasonStats.seasonId, seasonId),
    });

    // Get scoring config (from snapshot if historical, active if current)
    const scoringConfig = await getSeasonScoringConfig(db, season);

    // Store MVP calculations for response
    let mvpCalculations: Map<
      string,
      { score: number; breakdown: MVPScoreBreakdown }
    > | null = null;

    // For MVP filter, use enhanced calculation (with caching)
    if (filter === "mvp") {
      const cacheKey = buildLeaderboardCacheKey({
        scope: "season",
        filter: "mvp",
        seasonId,
      });
      type SeasonMvpPlayer = {
        rank: number;
        playerId: string;
        displayName: string;
        displayRating: number;
        currentMu: number;
        currentSigma: number;
        gamesPlayed: number;
        wins: number;
        losses: number;
        winRate: number;
        winStreak: number;
        muDelta: number;
        mvpBreakdown: MVPScoreBreakdown | undefined;
      };

      const cached = await getCachedJson<{
        season: {
          id: string;
          name: string;
          isActive: boolean;
          winnerId: string | null;
          previousWinnerId: string | null;
          icon: string | null;
        };
        players: SeasonMvpPlayer[];
      }>(c.env, cacheKey);

      if (cached) {
        return c.json(cached, 200);
      }

      // Get all matches for this season to calculate diversity
      const seasonMatches = await db.query.match.findMany({
        where: and(
          eq(schema.match.seasonId, seasonId),
          eq(schema.match.isDeleted, false),
        ),
      });

      // Calculate expected max games
      const expectedMaxGames = await calculateExpectedMaxGames(db);

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
        allPlayers.map((p) => [
          p.id,
          { mu: p.generalMu, sigma: p.generalSigma },
        ]),
      );

      // Calculate MVP scores with diversity penalties and teammate quality bonus
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

          const { score, breakdown } = calculateWeeklyMVPScore(
            stat.wins,
            stat.losses,
            stat.gamesPlayed,
            stat.muDelta,
            diversityPenalty.combinedPenalty,
            teammateQualityBonus,
            expectedMaxGames,
            scoringConfig,
          );

          return {
            stat,
            score,
            breakdown,
          };
        }),
      );

      // Sort by MVP score, then by muDelta as tiebreaker
      mvpScores.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.stat.muDelta - a.stat.muDelta;
      });

      // Store calculations for response
      mvpCalculations = new Map(
        mvpScores.map((item) => [item.stat.playerId, item]),
      );

      seasonStats = mvpScores.map((item) => item.stat);
    } else {
      switch (filter) {
        case "biggest_losers":
          seasonStats = seasonStats
            .filter((s) => s.humiliatingDefeats > 0)
            .sort((a, b) => b.humiliatingDefeats - a.humiliatingDefeats);
          break;

        case "standard":
        default:
          seasonStats = seasonStats.sort((a, b) => b.muDelta - a.muDelta);
          break;
      }
    }

    const playerIds = seasonStats.map((s) => s.playerId);
    const players = await db.query.player.findMany({
      where: inArray(schema.player.id, playerIds),
      columns: {
        id: true,
        displayName: true,
        generalMu: true,
        generalSigma: true,
        userId: true,
      },
    });

    // Filter out admin players
    const userIds = players.map((p) => p.userId);
    const users = await db.query.user.findMany({
      where: inArray(schema.user.id, userIds),
      columns: { id: true, isAdmin: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));
    const nonAdminPlayers = players.filter(
      (p) => !userMap.get(p.userId)?.isAdmin,
    );
    const nonAdminPlayerIds = new Set(nonAdminPlayers.map((p) => p.id));
    const filteredSeasonStats = seasonStats.filter((s) =>
      nonAdminPlayerIds.has(s.playerId),
    );

    const playerMap = new Map(nonAdminPlayers.map((p) => [p.id, p]));

    const responsePayload = {
      season: {
        id: season.id,
        name: season.name,
        isActive: season.isActive,
        winnerId: season.winnerId,
        previousWinnerId: season.previousWinnerId,
        icon: season.icon,
      },
      players: filteredSeasonStats.map((s, idx) => ({
        rank: idx + 1,
        playerId: s.playerId,
        displayName: playerMap.get(s.playerId)?.displayName ?? "Unknown",
        displayRating: conservativeRating(
          playerMap.get(s.playerId)?.generalMu ?? 25,
          playerMap.get(s.playerId)?.generalSigma ?? 8.333,
        ),
        currentMu: s.currentMu,
        currentSigma: s.currentSigma,
        gamesPlayed: s.gamesPlayed,
        wins: s.wins,
        losses: s.losses,
        winRate: s.gamesPlayed > 0 ? (s.wins / s.gamesPlayed) * 100 : 0,
        winStreak: s.winStreak,
        muDelta: s.muDelta,
        mvpBreakdown:
          filter === "mvp"
            ? mvpCalculations?.get(s.playerId)?.breakdown
            : undefined,
      })),
    };

    if (filter === "mvp") {
      const cacheKey = buildLeaderboardCacheKey({
        scope: "season",
        filter: "mvp",
        seasonId,
      });
      await setCachedJson(c.env, cacheKey, responsePayload);
    }

    return c.json(responsePayload, 200);
  },
);

// GET /seasons/weekly/current
seasonRoutes.get("/seasons/weekly/current", requireAuth, async (c) => {
  const db = createDatabase(c.env);

  const cacheKey = buildLeaderboardCacheKey({
    scope: "season",
    filter: "weekly_current",
  });

  const cached = await getCachedJson<{
    season: {
      id: string;
      name: string;
      startDate: Date;
      isActive: boolean;
      previousWinnerId: string | null;
      icon: string | null;
    };
    players: {
      rank: number;
      playerId: string;
      displayName: string;
      displayRating: number;
      gamesPlayed: number;
      wins: number;
      losses: number;
      winRate: number;
      muDelta: number;
      mvpScore: number;
      mvpBreakdown: MVPScoreBreakdown;
    }[];
  }>(c.env, cacheKey);

  if (cached) {
    return c.json(cached, 200);
  }

  const activeSeason = await db.query.season.findFirst({
    where: eq(schema.season.isActive, true),
    orderBy: desc(schema.season.startDate),
  });

  if (!activeSeason) {
    return c.json({ season: null }, 200);
  }

  // Get leaderboard for active season
  const seasonStats = await db.query.playerSeasonStats.findMany({
    where: eq(schema.playerSeasonStats.seasonId, activeSeason.id),
  });

  const scoringConfig = await getSeasonScoringConfig(db, activeSeason);
  const seasonMatches = await db.query.match.findMany({
    where: and(
      eq(schema.match.seasonId, activeSeason.id),
      eq(schema.match.isDeleted, false),
    ),
  });
  const expectedMaxGames = await calculateExpectedMaxGames(db);

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

  // Calculate MVP scores
  const mvpScores = await Promise.all(
    seasonStats.map(async (stat) => {
      const diversityPenalty = await calculateDiversityPenalty(
        stat.playerId,
        activeSeason.id,
        seasonMatches,
        scoringConfig,
      );

      const teammateQualityBonus = await calculateTeammateQualityBonus(
        stat.playerId,
        activeSeason.id,
        seasonMatches,
        playerRatingsMap,
      );

      const { score, breakdown } = calculateWeeklyMVPScore(
        stat.wins,
        stat.losses,
        stat.gamesPlayed,
        stat.muDelta,
        diversityPenalty.combinedPenalty,
        teammateQualityBonus,
        expectedMaxGames,
        scoringConfig,
      );

      return { stat, score, breakdown };
    }),
  );

  mvpScores.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.stat.muDelta - a.stat.muDelta;
  });

  const playerIds = mvpScores.map((item) => item.stat.playerId);
  const players = await db.query.player.findMany({
    where: inArray(schema.player.id, playerIds),
    columns: {
      id: true,
      displayName: true,
      generalMu: true,
      generalSigma: true,
      userId: true,
    },
  });

  // Filter out admin players
  const userIds = players.map((p) => p.userId);
  const users = await db.query.user.findMany({
    where: inArray(schema.user.id, userIds),
    columns: { id: true, isAdmin: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));
  const nonAdminPlayers = players.filter(
    (p) => !userMap.get(p.userId)?.isAdmin,
  );
  const nonAdminPlayerIds = new Set(nonAdminPlayers.map((p) => p.id));
  const filteredMvpScores = mvpScores.filter((item) =>
    nonAdminPlayerIds.has(item.stat.playerId),
  );

  const playerMap = new Map(nonAdminPlayers.map((p) => [p.id, p]));

  const responsePayload = {
    season: {
      id: activeSeason.id,
      name: activeSeason.name,
      startDate: activeSeason.startDate,
      isActive: activeSeason.isActive,
      previousWinnerId: activeSeason.previousWinnerId,
      icon: activeSeason.icon,
    },
    players: filteredMvpScores.map((item, idx) => ({
      rank: idx + 1,
      playerId: item.stat.playerId,
      displayName: playerMap.get(item.stat.playerId)?.displayName ?? "Unknown",
      displayRating: conservativeRating(
        playerMap.get(item.stat.playerId)?.generalMu ?? 25,
        playerMap.get(item.stat.playerId)?.generalSigma ?? 8.333,
      ),
      gamesPlayed: item.stat.gamesPlayed,
      wins: item.stat.wins,
      losses: item.stat.losses,
      winRate:
        item.stat.gamesPlayed > 0
          ? (item.stat.wins / item.stat.gamesPlayed) * 100
          : 0,
      muDelta: item.stat.muDelta,
      mvpScore: item.score,
      mvpBreakdown: item.breakdown,
    })),
  };

  await setCachedJson(c.env, cacheKey, responsePayload);

  return c.json(responsePayload, 200);
});

// GET /seasons/weekly/expected-games
seasonRoutes.get("/seasons/weekly/expected-games", requireAuth, async (c) => {
  const db = createDatabase(c.env);
  const expectedMaxGames = await calculateExpectedMaxGames(db);
  return c.json({ expectedMaxGames }, 200);
});

// GET /seasons/previous-winner
seasonRoutes.get("/seasons/previous-winner", requireAuth, async (c) => {
  const db = createDatabase(c.env);

  const activeSeason = await db.query.season.findFirst({
    where: eq(schema.season.isActive, true),
    orderBy: desc(schema.season.startDate),
  });

  let previousWinnerId: string | null = null;
  let hasGames = false;

  if (activeSeason) {
    // If there's an active season, use its previousWinnerId
    previousWinnerId = activeSeason.previousWinnerId || null;

    // Check if current season has any matches
    const seasonMatches = await db.query.match.findMany({
      where: and(
        eq(schema.match.seasonId, activeSeason.id),
        eq(schema.match.isDeleted, false),
      ),
      limit: 1,
    });
    hasGames = seasonMatches.length > 0;
  } else {
    // If there's no active season, find the most recently ended season and get its winner
    const lastEndedSeason = await db.query.season.findFirst({
      where: and(
        eq(schema.season.isActive, false),
        // endDate is not null means it was properly ended
      ),
      orderBy: desc(schema.season.endDate),
    });

    previousWinnerId = lastEndedSeason?.winnerId || null;
    // If we're between seasons, we don't need to check hasGames - just show the crown
    hasGames = true; // Always show crown for previous winner when between seasons
  }

  return c.json(
    {
      previousWinnerId,
      hasGames,
    },
    200,
  );
});
