import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  and,
  desc,
  eq,
  getTableColumns,
  inArray,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import type { Env } from "../bindings";
import { createDatabase } from "../drizzle/db";
import * as schema from "../drizzle/schema";
import { CustomError } from "../error/CustomError";
import { ErrorCode } from "../error/ErrorCodes";
import { requireAuth } from "../middleware/auth";
import { errorHandler } from "../middleware/errorHandler";
import { conservativeRating } from "../utils/rating-display";
import { getProfileImageUrl } from "../utils/r2";
import { excludeAdminPlayers } from "../utils/playerFilters";
import {
  calculateDiversityScore,
  DEFAULT_DIVERSITY_CONFIG,
} from "../utils/diversity-calculator";
import { getCachedJson, setCachedJson } from "../utils/cache";
import {
  computeGlobalMvpScore,
  getOrComputeLeaderboard,
} from "../utils/leaderboard";

export const playerRoutes = new Hono<{ Bindings: Env }>();

// Schemas
const listPlayersSchema = z.object({
  filter: z
    .enum([
      "standard",
      "defense_leaders",
      "attack_leaders",
      "king_of_hill",
      "mvp",
      "biggest_losers",
      "conqueror",
      "ball_and_chain",
      "swiss_army_knife",
    ])
    .default("standard"),
  minGames: z.coerce.number().int().min(0).default(10).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50).optional(),
  offset: z.coerce.number().int().min(0).default(0).optional(),
});

const headToHeadSchema = z.object({
  player1Id: z.string(),
  player2Id: z.string(),
});

const monthlyMVPSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
});

const teamRankingsSchema = z.object({
  minGames: z.coerce.number().int().min(0).default(0),
});

const updateDisplayNameSchema = z.object({
  displayName: z.string().min(1).max(100),
});

// GET /players (list players) - Requires authentication (colleagues only)
playerRoutes.get(
  "/players",
  requireAuth,
  zValidator("query", listPlayersSchema),
  async (c) => {
    const {
      filter = "standard",
      limit = 50,
      offset = 0,
    } = c.req.valid("query");
    const db = createDatabase(c.env);

    type PlayerType = typeof schema.player.$inferSelect;

    // Note: Profile images excluded from list endpoint to reduce response size
    // Profile images are available in detail endpoints (GET /players/:id)

    let players: PlayerType[];
    let orderByClause: any;

    // Get total count for pagination (before filtering, excluding admin players)
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.player)
      .innerJoin(schema.user, eq(schema.player.userId, schema.user.id))
      .where(excludeAdminPlayers());
    const totalCount = Number(countResult[0]?.count || 0);

    // Build ORDER BY clause based on filter
    switch (filter) {
      case "defense_leaders":
        // Sort by conservative rating: mu - 3*sigma
        orderByClause = desc(
          sql`${schema.player.defenseMu} - 3 * ${schema.player.defenseSigma}`,
        );
        break;

      case "attack_leaders":
        orderByClause = desc(
          sql`${schema.player.attackMu} - 3 * ${schema.player.attackSigma}`,
        );
        break;

      case "king_of_hill": {
        // Filter and sort by winStreak
        const kingOfHillResult = await db
          .select(getTableColumns(schema.player))
          .from(schema.player)
          .innerJoin(schema.user, eq(schema.player.userId, schema.user.id))
          .where(
            and(sql`${schema.player.winStreak} > 0`, excludeAdminPlayers()),
          )
          .orderBy(desc(schema.player.winStreak))
          .limit(limit)
          .offset(offset);
        players = kingOfHillResult;
        return c.json({
          players: players.map((p: PlayerType, idx: number) => ({
            rank: offset + idx + 1,
            id: p.id,
            displayName: p.displayName,
            displayRating: conservativeRating(p.generalMu, p.generalSigma),
            defenseRating: conservativeRating(p.defenseMu, p.defenseSigma),
            attackRating: conservativeRating(p.attackMu, p.attackSigma),
            soloRating: conservativeRating(p.soloMu, p.soloSigma),
            generalMu: p.generalMu,
            generalSigma: p.generalSigma,
            defenseMu: p.defenseMu,
            defenseSigma: p.defenseSigma,
            attackMu: p.attackMu,
            attackSigma: p.attackSigma,
            soloMu: p.soloMu,
            soloSigma: p.soloSigma,
            gamesPlayed: p.gamesPlayed,
            defenseGames: p.defenseGames,
            attackGames: p.attackGames,
            wins: p.wins,
            losses: p.losses,
            winRate: p.gamesPlayed > 0 ? (p.wins / p.gamesPlayed) * 100 : 0,
            winStreak: p.winStreak,
            bestWinStreak: p.bestWinStreak,
            humiliatingDefeats: p.humiliatingDefeats,
          })),
          pagination: {
            total: totalCount,
            limit,
            offset,
            hasMore: offset + limit < totalCount,
          },
        });
        break;
      }

      case "mvp":
        orderByClause = null;
        break;

      case "biggest_losers": {
        // Filter and sort by humiliatingDefeats
        const biggestLosersResult = await db
          .select(getTableColumns(schema.player))
          .from(schema.player)
          .innerJoin(schema.user, eq(schema.player.userId, schema.user.id))
          .where(
            and(
              sql`${schema.player.humiliatingDefeats} > 0`,
              excludeAdminPlayers(),
            ),
          )
          .orderBy(desc(schema.player.humiliatingDefeats))
          .limit(limit)
          .offset(offset);
        players = biggestLosersResult;
        return c.json({
          players: players.map((p: PlayerType, idx: number) => ({
            rank: offset + idx + 1,
            id: p.id,
            displayName: p.displayName,
            displayRating: conservativeRating(p.generalMu, p.generalSigma),
            defenseRating: conservativeRating(p.defenseMu, p.defenseSigma),
            attackRating: conservativeRating(p.attackMu, p.attackSigma),
            soloRating: conservativeRating(p.soloMu, p.soloSigma),
            generalMu: p.generalMu,
            generalSigma: p.generalSigma,
            defenseMu: p.defenseMu,
            defenseSigma: p.defenseSigma,
            attackMu: p.attackMu,
            attackSigma: p.attackSigma,
            soloMu: p.soloMu,
            soloSigma: p.soloSigma,
            gamesPlayed: p.gamesPlayed,
            defenseGames: p.defenseGames,
            attackGames: p.attackGames,
            wins: p.wins,
            losses: p.losses,
            winRate: p.gamesPlayed > 0 ? (p.wins / p.gamesPlayed) * 100 : 0,
            winStreak: p.winStreak,
            bestWinStreak: p.bestWinStreak,
            humiliatingDefeats: p.humiliatingDefeats,
          })),
          pagination: {
            total: totalCount,
            limit,
            offset,
            hasMore: offset + limit < totalCount,
          },
        });
        break;
      }

      case "conqueror": {
        // Optimized SQL query for solo wins using aggregations
        // For now, use a simpler approach: fetch matches and aggregate in SQL
        // This is still more efficient than fetching all matches into memory
        const soloStatsQuery = sql`
          WITH solo_player_stats AS (
            SELECT 
              CASE 
                WHEN m.match_type = '1v1' THEN m.team1_player1_id
                WHEN m.match_type = '1v2' AND m.team1_player2_id IS NULL THEN m.team1_player1_id
                WHEN m.match_type = '1v2' AND m.team2_player2_id IS NULL THEN m.team2_player1_id
              END as player_id,
              CASE 
                WHEN m.match_type = '1v1' AND m.winning_team = 1 THEN m.team1_player1_id
                WHEN m.match_type = '1v1' AND m.winning_team = 2 THEN m.team2_player1_id
                WHEN m.match_type = '1v2' AND m.team1_player2_id IS NULL AND m.winning_team = 1 THEN m.team1_player1_id
                WHEN m.match_type = '1v2' AND m.team2_player2_id IS NULL AND m.winning_team = 2 THEN m.team2_player1_id
              END as winner_id
            FROM match m
            WHERE m.is_deleted = false 
              AND m.is_friendly = false
              AND (m.match_type = '1v1' OR m.match_type = '1v2')
          ),
          solo_aggregated AS (
            SELECT 
              player_id,
              COUNT(*) as solo_games,
              COUNT(*) FILTER (WHERE player_id = winner_id) as solo_wins
            FROM solo_player_stats
            WHERE player_id IS NOT NULL
            GROUP BY player_id
            HAVING COUNT(*) > 0
          )
          SELECT 
            p.*,
            COALESCE(sa.solo_wins, 0)::int as solo_wins,
            COALESCE(sa.solo_games, 0)::int as solo_games
          FROM player p
          INNER JOIN solo_aggregated sa ON p.id = sa.player_id
          INNER JOIN "user" u ON p.user_id = u.id
          WHERE u.is_admin = false
          ORDER BY sa.solo_wins DESC
          LIMIT ${limit} OFFSET ${offset}
        `;

        // Execute raw SQL for conqueror (complex aggregation)
        // db.execute() returns an array directly with postgres-js
        const conquerorPlayers = (await db.execute(soloStatsQuery)) as any[];

        return c.json({
          players: conquerorPlayers.map((p: any, idx: number) => ({
            rank: offset + idx + 1,
            id: p.id,
            displayName: p.display_name,
            displayRating: conservativeRating(p.general_mu, p.general_sigma),
            defenseRating: conservativeRating(p.defense_mu, p.defense_sigma),
            attackRating: conservativeRating(p.attack_mu, p.attack_sigma),
            soloRating: conservativeRating(p.solo_mu, p.solo_sigma),
            generalMu: p.general_mu,
            generalSigma: p.general_sigma,
            defenseMu: p.defense_mu,
            defenseSigma: p.defense_sigma,
            attackMu: p.attack_mu,
            attackSigma: p.attack_sigma,
            soloMu: p.solo_mu,
            soloSigma: p.solo_sigma,
            gamesPlayed: p.games_played,
            defenseGames: p.defense_games,
            attackGames: p.attack_games,
            wins: p.wins,
            losses: p.losses,
            winRate: p.games_played > 0 ? (p.wins / p.games_played) * 100 : 0,
            winStreak: p.win_streak,
            bestWinStreak: p.best_win_streak,
            humiliatingDefeats: p.humiliating_defeats,
            soloWins: Number(p.solo_wins || 0),
            soloGames: Number(p.solo_games || 0),
          })),
          pagination: {
            total: totalCount,
            limit,
            offset,
            hasMore: offset + limit < totalCount,
          },
        });
      }

      case "ball_and_chain": {
        // Calculate teammate impact: average rating change teammates experience
        // when playing with this player (only players with negative impact)
        const ballAndChainQuery = sql`
          WITH teammate_pairs AS (
            -- Team 1: player1 and player2 are teammates
            SELECT 
              m.id as match_id,
              m.team1_player1_id as player_id,
              m.team1_player2_id as teammate_id
            FROM match m
            WHERE m.is_deleted = false 
              AND m.is_friendly = false
              AND (m.match_type = '2v2' OR m.match_type = '1v2')
              AND m.team1_player2_id IS NOT NULL
            UNION ALL
            -- Team 1: player2 and player1 are teammates (reverse)
            SELECT 
              m.id as match_id,
              m.team1_player2_id as player_id,
              m.team1_player1_id as teammate_id
            FROM match m
            WHERE m.is_deleted = false 
              AND m.is_friendly = false
              AND (m.match_type = '2v2' OR m.match_type = '1v2')
              AND m.team1_player2_id IS NOT NULL
            UNION ALL
            -- Team 2: player1 and player2 are teammates
            SELECT 
              m.id as match_id,
              m.team2_player1_id as player_id,
              m.team2_player2_id as teammate_id
            FROM match m
            WHERE m.is_deleted = false 
              AND m.is_friendly = false
              AND (m.match_type = '2v2' OR m.match_type = '1v2')
              AND m.team2_player2_id IS NOT NULL
            UNION ALL
            -- Team 2: player2 and player1 are teammates (reverse)
            SELECT 
              m.id as match_id,
              m.team2_player2_id as player_id,
              m.team2_player1_id as teammate_id
            FROM match m
            WHERE m.is_deleted = false 
              AND m.is_friendly = false
              AND (m.match_type = '2v2' OR m.match_type = '1v2')
              AND m.team2_player2_id IS NOT NULL
          ),
          teammate_rating_changes AS (
            -- Get teammate's rating change for each match (ALL impacts)
            SELECT 
              tp.player_id,
              tp.match_id,
              tp.teammate_id,
              rh.mu_change as teammate_mu_change
            FROM teammate_pairs tp
            INNER JOIN rating_history rh ON (
              rh.match_id = tp.match_id 
              AND rh.player_id = tp.teammate_id
            )
          ),
          player_impact AS (
            -- Aggregate teammate impacts per player
            -- Calculate overall average impact (includes both positive and negative)
            SELECT 
              trc.player_id,
              COUNT(*) as total_teammate_matches,
              COUNT(*) FILTER (WHERE trc.teammate_mu_change < 0) as teammate_losses,
              AVG(trc.teammate_mu_change) as avg_teammate_impact,  -- Overall average (negative = drags down)
              AVG(trc.teammate_mu_change) FILTER (WHERE trc.teammate_mu_change < 0) as avg_teammate_loss,  -- Average when teammates lose
              SUM(trc.teammate_mu_change) FILTER (WHERE trc.teammate_mu_change < 0) as total_teammate_loss
            FROM teammate_rating_changes trc
            GROUP BY trc.player_id
            HAVING AVG(trc.teammate_mu_change) < 0  -- Only players with negative overall impact
          )
          SELECT 
            p.*,
            COALESCE(pi.avg_teammate_impact, 0)::float as avg_teammate_impact,
            COALESCE(pi.avg_teammate_loss, 0)::float as avg_teammate_loss,
            COALESCE(pi.total_teammate_loss, 0)::float as total_teammate_loss,
            COALESCE(pi.teammate_losses, 0)::int as teammate_losses,
            COALESCE(pi.total_teammate_matches, 0)::int as total_teammate_matches
          FROM player p
          INNER JOIN player_impact pi ON p.id = pi.player_id
          INNER JOIN "user" u ON p.user_id = u.id
          WHERE u.is_admin = false
          ORDER BY pi.avg_teammate_impact ASC  -- Most negative first (worst impact)
          LIMIT ${limit} OFFSET ${offset}
        `;

        const ballAndChainPlayers = (await db.execute(
          ballAndChainQuery,
        )) as any[];

        return c.json({
          players: ballAndChainPlayers.map((p: any, idx: number) => ({
            rank: offset + idx + 1,
            id: p.id,
            displayName: p.display_name,
            displayRating: conservativeRating(p.general_mu, p.general_sigma),
            defenseRating: conservativeRating(p.defense_mu, p.defense_sigma),
            attackRating: conservativeRating(p.attack_mu, p.attack_sigma),
            soloRating: conservativeRating(p.solo_mu, p.solo_sigma),
            generalMu: p.general_mu,
            generalSigma: p.general_sigma,
            defenseMu: p.defense_mu,
            defenseSigma: p.defense_sigma,
            attackMu: p.attack_mu,
            attackSigma: p.attack_sigma,
            soloMu: p.solo_mu,
            soloSigma: p.solo_sigma,
            gamesPlayed: p.games_played,
            defenseGames: p.defense_games,
            attackGames: p.attack_games,
            wins: p.wins,
            losses: p.losses,
            winRate: p.games_played > 0 ? (p.wins / p.games_played) * 100 : 0,
            winStreak: p.win_streak,
            bestWinStreak: p.best_win_streak,
            humiliatingDefeats: p.humiliating_defeats,
            avgTeammateLoss: Number(p.avg_teammate_loss || 0),
            avgTeammateImpact: Number(p.avg_teammate_impact || 0),
            totalTeammateLoss: Number(p.total_teammate_loss || 0),
            teammateLosses: Number(p.teammate_losses || 0),
            totalTeammateMatches: Number(p.total_teammate_matches || 0),
          })),
          pagination: {
            total: totalCount,
            limit,
            offset,
            hasMore: offset + limit < totalCount,
          },
        });
      }

      case "swiss_army_knife": {
        // Cache key is independent of pagination; we cache the full leaderboard
        const cacheKey = "leaderboard:players:swiss_army_knife:v1";

        type SwissPlayerEntry = {
          id: string;
          displayName: string;
          generalMu: number;
          generalSigma: number;
          defenseMu: number;
          defenseSigma: number;
          attackMu: number;
          attackSigma: number;
          soloMu: number;
          soloSigma: number;
          gamesPlayed: number;
          defenseGames: number;
          attackGames: number;
          wins: number;
          losses: number;
          winStreak: number;
          bestWinStreak: number;
          humiliatingDefeats: number;
          diversityScore: number;
          positionDiversityScore: number;
          teamDiversityScore: number;
        };

        const cached = await getCachedJson<SwissPlayerEntry[]>(c.env, cacheKey);

        if (cached) {
          const total = cached.length;
          const slice = cached.slice(offset, offset + limit);

          return c.json({
            players: slice.map((item, idx) => ({
              rank: offset + idx + 1,
              id: item.id,
              displayName: item.displayName,
              displayRating: conservativeRating(
                item.generalMu,
                item.generalSigma,
              ),
              defenseRating: conservativeRating(
                item.defenseMu,
                item.defenseSigma,
              ),
              attackRating: conservativeRating(item.attackMu, item.attackSigma),
              soloRating: conservativeRating(item.soloMu, item.soloSigma),
              generalMu: item.generalMu,
              generalSigma: item.generalSigma,
              defenseMu: item.defenseMu,
              defenseSigma: item.defenseSigma,
              attackMu: item.attackMu,
              attackSigma: item.attackSigma,
              soloMu: item.soloMu,
              soloSigma: item.soloSigma,
              gamesPlayed: item.gamesPlayed,
              defenseGames: item.defenseGames,
              attackGames: item.attackGames,
              wins: item.wins,
              losses: item.losses,
              winRate:
                item.gamesPlayed > 0 ? (item.wins / item.gamesPlayed) * 100 : 0,
              winStreak: item.winStreak,
              bestWinStreak: item.bestWinStreak,
              humiliatingDefeats: item.humiliatingDefeats,
              diversityScore: item.diversityScore,
              positionDiversityScore: item.positionDiversityScore,
              teamDiversityScore: item.teamDiversityScore,
            })),
            pagination: {
              total,
              limit,
              offset,
              hasMore: offset + limit < total,
            },
          });
        }

        // Cache miss: compute leaderboard once, then cache full result
        const allMatches = await db.query.match.findMany({
          where: and(
            eq(schema.match.isDeleted, false),
            eq(schema.match.isFriendly, false),
          ),
        });

        const allPlayers = await db
          .select(getTableColumns(schema.player))
          .from(schema.player)
          .innerJoin(schema.user, eq(schema.player.userId, schema.user.id))
          .where(excludeAdminPlayers());

        const playerDiversityScores = allPlayers.map((p) => {
          const diversityScore = calculateDiversityScore(
            p.id,
            allMatches,
            DEFAULT_DIVERSITY_CONFIG,
          );
          return {
            player: p,
            diversityScore,
          };
        });

        playerDiversityScores.sort(
          (a, b) =>
            b.diversityScore.combinedScore - a.diversityScore.combinedScore,
        );

        const fullLeaderboard: SwissPlayerEntry[] = playerDiversityScores.map(
          (item) => ({
            id: item.player.id,
            displayName: item.player.displayName,
            generalMu: item.player.generalMu,
            generalSigma: item.player.generalSigma,
            defenseMu: item.player.defenseMu,
            defenseSigma: item.player.defenseSigma,
            attackMu: item.player.attackMu,
            attackSigma: item.player.attackSigma,
            soloMu: item.player.soloMu,
            soloSigma: item.player.soloSigma,
            gamesPlayed: item.player.gamesPlayed,
            defenseGames: item.player.defenseGames,
            attackGames: item.player.attackGames,
            wins: item.player.wins,
            losses: item.player.losses,
            winStreak: item.player.winStreak,
            bestWinStreak: item.player.bestWinStreak,
            humiliatingDefeats: item.player.humiliatingDefeats,
            diversityScore: item.diversityScore.combinedScore,
            positionDiversityScore: item.diversityScore.positionScore,
            teamDiversityScore: item.diversityScore.teamScore,
          }),
        );

        await setCachedJson(c.env, cacheKey, fullLeaderboard);

        const total = fullLeaderboard.length;
        const slice = fullLeaderboard.slice(offset, offset + limit);

        return c.json({
          players: slice.map((item, idx) => ({
            rank: offset + idx + 1,
            id: item.id,
            displayName: item.displayName,
            displayRating: conservativeRating(
              item.generalMu,
              item.generalSigma,
            ),
            defenseRating: conservativeRating(
              item.defenseMu,
              item.defenseSigma,
            ),
            attackRating: conservativeRating(item.attackMu, item.attackSigma),
            soloRating: conservativeRating(item.soloMu, item.soloSigma),
            generalMu: item.generalMu,
            generalSigma: item.generalSigma,
            defenseMu: item.defenseMu,
            defenseSigma: item.defenseSigma,
            attackMu: item.attackMu,
            attackSigma: item.attackSigma,
            soloMu: item.soloMu,
            soloSigma: item.soloSigma,
            gamesPlayed: item.gamesPlayed,
            defenseGames: item.defenseGames,
            attackGames: item.attackGames,
            wins: item.wins,
            losses: item.losses,
            winRate:
              item.gamesPlayed > 0 ? (item.wins / item.gamesPlayed) * 100 : 0,
            winStreak: item.winStreak,
            bestWinStreak: item.bestWinStreak,
            humiliatingDefeats: item.humiliatingDefeats,
            diversityScore: item.diversityScore,
            positionDiversityScore: item.positionDiversityScore,
            teamDiversityScore: item.teamDiversityScore,
          })),
          pagination: {
            total,
            limit,
            offset,
            hasMore: offset + limit < total,
          },
        });
      }

      case "standard":
      default:
        // Sort by conservative rating: mu - 3*sigma
        orderByClause = desc(
          sql`${schema.player.generalMu} - 3 * ${schema.player.generalSigma}`,
        );
        break;
    }

    if (filter === "mvp") {
      type MvpPlayerEntry = PlayerType & {
        mvpScore: number;
        mvpBreakdown: {
          bayesianWinRate: number;
          gamesWeight: number;
          netWins: number;
          score: number;
        };
      };

      const leaderboard = await getOrComputeLeaderboard<MvpPlayerEntry[]>(
        c.env,
        { scope: "players", filter: "mvp" },
        async () => {
          const basePlayers = await db
            .select(getTableColumns(schema.player))
            .from(schema.player)
            .innerJoin(schema.user, eq(schema.player.userId, schema.user.id))
            .where(excludeAdminPlayers());

          const withScores = basePlayers.map((p: PlayerType) => {
            const { score, breakdown } = computeGlobalMvpScore(p);
            return {
              ...p,
              mvpScore: score,
              mvpBreakdown: breakdown,
            };
          });

          withScores.sort((a, b) => b.mvpScore - a.mvpScore);
          return withScores;
        },
      );

      const total = leaderboard.length;
      const slice = leaderboard.slice(offset, offset + limit);

      return c.json({
        players: slice.map((p, idx) => ({
          rank: offset + idx + 1,
          id: p.id,
          displayName: p.displayName,
          displayRating: conservativeRating(p.generalMu, p.generalSigma),
          defenseRating: conservativeRating(p.defenseMu, p.defenseSigma),
          attackRating: conservativeRating(p.attackMu, p.attackSigma),
          soloRating: conservativeRating(p.soloMu, p.soloSigma),
          generalMu: p.generalMu,
          generalSigma: p.generalSigma,
          defenseMu: p.defenseMu,
          defenseSigma: p.defenseSigma,
          attackMu: p.attackMu,
          attackSigma: p.attackSigma,
          soloMu: p.soloMu,
          soloSigma: p.soloSigma,
          gamesPlayed: p.gamesPlayed,
          defenseGames: p.defenseGames,
          attackGames: p.attackGames,
          wins: p.wins,
          losses: p.losses,
          winRate: p.gamesPlayed > 0 ? (p.wins / p.gamesPlayed) * 100 : 0,
          winStreak: p.winStreak,
          bestWinStreak: p.bestWinStreak,
          humiliatingDefeats: p.humiliatingDefeats,
          mvpScore: p.mvpScore,
          mvpBreakdown: p.mvpBreakdown,
        })),
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      });
    }

    if (Array.isArray(orderByClause)) {
      players = await db
        .select(getTableColumns(schema.player))
        .from(schema.player)
        .innerJoin(schema.user, eq(schema.player.userId, schema.user.id))
        .where(excludeAdminPlayers())
        .orderBy(...orderByClause)
        .limit(limit)
        .offset(offset);
    } else {
      players = await db
        .select(getTableColumns(schema.player))
        .from(schema.player)
        .innerJoin(schema.user, eq(schema.player.userId, schema.user.id))
        .where(excludeAdminPlayers())
        .orderBy(orderByClause)
        .limit(limit)
        .offset(offset);
    }

    return c.json({
      players: players.map((p: PlayerType, idx: number) => ({
        rank: offset + idx + 1,
        id: p.id,
        displayName: p.displayName,
        displayRating: conservativeRating(p.generalMu, p.generalSigma),
        defenseRating: conservativeRating(p.defenseMu, p.defenseSigma),
        attackRating: conservativeRating(p.attackMu, p.attackSigma),
        soloRating: conservativeRating(p.soloMu, p.soloSigma),
        generalMu: p.generalMu,
        generalSigma: p.generalSigma,
        defenseMu: p.defenseMu,
        defenseSigma: p.defenseSigma,
        attackMu: p.attackMu,
        attackSigma: p.attackSigma,
        soloMu: p.soloMu,
        soloSigma: p.soloSigma,
        gamesPlayed: p.gamesPlayed,
        defenseGames: p.defenseGames,
        attackGames: p.attackGames,
        wins: p.wins,
        losses: p.losses,
        winRate: p.gamesPlayed > 0 ? (p.wins / p.gamesPlayed) * 100 : 0,
        winStreak: p.winStreak,
        bestWinStreak: p.bestWinStreak,
        humiliatingDefeats: p.humiliatingDefeats,
      })),
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + limit < totalCount,
      },
    });
  },
);

// GET /players/team-rankings - Must be before /players/:id to avoid matching as ID
playerRoutes.get(
  "/players/team-rankings",
  requireAuth,
  zValidator("query", teamRankingsSchema),
  async (c) => {
    const db = createDatabase(c.env);

    // Optimized SQL query using aggregations
    // Teams are identified by sorted player IDs to handle (A,B) = (B,A)
    const teamStatsQuery = sql`
      WITH team_matches AS (
        SELECT 
          LEAST(m.team1_player1_id, m.team1_player2_id) as p1_id,
          GREATEST(m.team1_player1_id, m.team1_player2_id) as p2_id,
          CASE WHEN m.winning_team = 1 THEN 1 ELSE 0 END as team1_won,
          CASE WHEN m.winning_team = 2 THEN 1 ELSE 0 END as team2_won
        FROM match m
        WHERE m.match_type = '2v2'
          AND m.is_deleted = false
          AND m.team1_player2_id IS NOT NULL
          AND m.team2_player2_id IS NOT NULL
        UNION ALL
        SELECT 
          LEAST(m.team2_player1_id, m.team2_player2_id) as p1_id,
          GREATEST(m.team2_player1_id, m.team2_player2_id) as p2_id,
          CASE WHEN m.winning_team = 2 THEN 1 ELSE 0 END as team2_won,
          CASE WHEN m.winning_team = 1 THEN 1 ELSE 0 END as team1_won
        FROM match m
        WHERE m.match_type = '2v2'
          AND m.is_deleted = false
          AND m.team1_player2_id IS NOT NULL
          AND m.team2_player2_id IS NOT NULL
      ),
      team_aggregated AS (
        SELECT 
          p1_id,
          p2_id,
          COUNT(*) as games_played,
          SUM(team1_won) as wins,
          SUM(team2_won) as losses
        FROM team_matches
        GROUP BY p1_id, p2_id
      )
      SELECT 
        ta.p1_id,
        ta.p2_id,
        ta.games_played,
        ta.wins,
        ta.losses,
        p1.display_name as p1_name,
        p2.display_name as p2_name
      FROM team_aggregated ta
      INNER JOIN player p1 ON ta.p1_id = p1.id
      INNER JOIN player p2 ON ta.p2_id = p2.id
      INNER JOIN "user" u1 ON p1.user_id = u1.id
      INNER JOIN "user" u2 ON p2.user_id = u2.id
      WHERE u1.is_admin = false AND u2.is_admin = false
      ORDER BY 
        CASE WHEN ta.games_played > 0 THEN ta.wins::float / ta.games_played ELSE 0 END DESC,
        ta.wins DESC
    `;

    // db.execute() returns an array directly with postgres-js
    const teamStats = (await db.execute(teamStatsQuery)) as any[];

    return c.json({
      teams: teamStats.map((team: any) => ({
        player1Id: team.p1_id,
        player1Name: team.p1_name || "Unknown",
        player2Id: team.p2_id,
        player2Name: team.p2_name || "Unknown",
        gamesPlayed: Number(team.games_played),
        wins: Number(team.wins),
        losses: Number(team.losses),
        winRate:
          team.games_played > 0
            ? (Number(team.wins) / Number(team.games_played)) * 100
            : 0,
      })),
    });
  },
);

// GET /players/head-to-head - Must be before /players/:id to avoid matching as ID
playerRoutes.get(
  "/players/head-to-head",
  requireAuth,
  zValidator("query", headToHeadSchema),
  async (c) => {
    const { player1Id, player2Id } = c.req.valid("query");
    const db = createDatabase(c.env);

    if (player1Id === player2Id) {
      throw new CustomError(
        "Cannot compare player with themselves",
        ErrorCode.VALIDATION_ERROR,
      );
    }

    const [player1, player2] = await Promise.all([
      db.query.player.findFirst({
        where: eq(schema.player.id, player1Id),
        columns: { id: true, displayName: true, userId: true },
      }),
      db.query.player.findFirst({
        where: eq(schema.player.id, player2Id),
        columns: { id: true, displayName: true, userId: true },
      }),
    ]);

    if (!player1 || !player2) {
      throw new CustomError(
        "One or both players not found",
        ErrorCode.NOT_FOUND,
      );
    }

    // Check if either player is admin - admin players cannot be used in head-to-head
    const [user1, user2] = await Promise.all([
      db.query.user.findFirst({
        where: eq(schema.user.id, player1.userId),
        columns: { isAdmin: true },
      }),
      db.query.user.findFirst({
        where: eq(schema.user.id, player2.userId),
        columns: { isAdmin: true },
      }),
    ]);

    if (user1?.isAdmin || user2?.isAdmin) {
      throw new CustomError(
        "Admin players cannot be used in head-to-head comparisons",
        ErrorCode.VALIDATION_ERROR,
      );
    }

    const statsQuery = sql`
      WITH head_to_head_matches AS (
        SELECT
          m.id,
          m.team1_score,
          m.team2_score,
          m.winning_team,
          m.created_at,
          m.team1_player1_id,
          m.team1_player2_id,
          m.team2_player1_id,
          m.team2_player2_id,
          CASE
            WHEN m.team1_player1_id = ${player1Id} OR m.team1_player2_id = ${player1Id} THEN 1
            ELSE 2
          END AS player1_team,
          CASE
            WHEN m.team1_player1_id = ${player2Id} OR m.team1_player2_id = ${player2Id} THEN 1
            ELSE 2
          END AS player2_team
        FROM match m
        WHERE m.is_deleted = false
          AND (
            (m.team1_player1_id = ${player1Id} OR m.team1_player2_id = ${player1Id} OR m.team2_player1_id = ${player1Id} OR m.team2_player2_id = ${player1Id})
            AND
            (m.team1_player1_id = ${player2Id} OR m.team1_player2_id = ${player2Id} OR m.team2_player1_id = ${player2Id} OR m.team2_player2_id = ${player2Id})
          )
      ),
      valid_matches AS (
        SELECT *
        FROM head_to_head_matches
        WHERE player1_team <> player2_team
      ),
      aggregated AS (
        SELECT
          COUNT(*) AS total_matches,
          COUNT(*) FILTER (WHERE winning_team = player1_team) AS player1_wins,
          COUNT(*) FILTER (WHERE winning_team <> player1_team) AS player2_wins
        FROM valid_matches
      )
      SELECT
        a.total_matches,
        a.player1_wins,
        a.player2_wins
      FROM aggregated a;
    `;

    const matchesQuery = sql`
      SELECT
        id,
        team1_score,
        team2_score,
        winning_team,
        created_at,
        player1_team,
        player2_team
      FROM (
        SELECT
          m.id,
          m.team1_score,
          m.team2_score,
          m.winning_team,
          m.created_at,
          CASE
            WHEN m.team1_player1_id = ${player1Id} OR m.team1_player2_id = ${player1Id} THEN 1
            ELSE 2
          END AS player1_team,
          CASE
            WHEN m.team1_player1_id = ${player2Id} OR m.team1_player2_id = ${player2Id} THEN 1
            ELSE 2
          END AS player2_team
        FROM match m
        WHERE m.is_deleted = false
          AND (
            (m.team1_player1_id = ${player1Id} OR m.team1_player2_id = ${player1Id} OR m.team2_player1_id = ${player1Id} OR m.team2_player2_id = ${player1Id})
            AND
            (m.team1_player1_id = ${player2Id} OR m.team1_player2_id = ${player2Id} OR m.team2_player1_id = ${player2Id} OR m.team2_player2_id = ${player2Id})
          )
      ) AS m
      WHERE player1_team <> player2_team
      ORDER BY created_at DESC
      LIMIT 10;
    `;

    const [statsRows, recentMatchRows] = await Promise.all([
      db.execute(statsQuery) as Promise<any[]>,
      db.execute(matchesQuery) as Promise<any[]>,
    ]);

    const statsRow = statsRows[0] as {
      total_matches: number | null;
      player1_wins: number | null;
      player2_wins: number | null;
    };

    const totalMatches = Number(statsRow?.total_matches || 0);
    const player1Wins = Number(statsRow?.player1_wins || 0);
    const player2Wins = Number(statsRow?.player2_wins || 0);

    const opponentMatches = (recentMatchRows as any[]).map((row) => ({
      id: row.id as string,
      team1Score: Number(row.team1_score),
      team2Score: Number(row.team2_score),
      winningTeam: Number(row.winning_team),
      createdAt: row.created_at as Date,
      player1Team: Number(row.player1_team),
      player2Team: Number(row.player2_team),
    }));

    return c.json(
      {
        player1: {
          id: player1.id,
          displayName: player1.displayName,
        },
        player2: {
          id: player2.id,
          displayName: player2.displayName,
        },
        stats: {
          totalMatches,
          player1Wins,
          player2Wins,
          player1WinRate:
            totalMatches > 0 ? (player1Wins / totalMatches) * 100 : 0,
          player2WinRate:
            totalMatches > 0 ? (player2Wins / totalMatches) * 100 : 0,
        },
        recentMatches: opponentMatches,
      },
      200,
    );
  },
);

// GET /players/:id - Requires authentication (colleagues only)
playerRoutes.get("/players/:id", requireAuth, async (c) => {
  const playerId = c.req.param("id");
  const db = createDatabase(c.env);
  const currentUser = c.get("user")!;

  const player = await db.query.player.findFirst({
    where: eq(schema.player.id, playerId),
  });

  if (!player) {
    throw new CustomError("Player not found", ErrorCode.NOT_FOUND);
  }

  // Get user to access profileImage and check if admin
  const user = await db.query.user.findFirst({
    where: eq(schema.user.id, player.userId),
  });

  // If player belongs to admin user, only allow access if current user is that admin
  if (user?.isAdmin && user.id !== currentUser.id) {
    throw new CustomError("Player not found", ErrorCode.NOT_FOUND);
  }

  type MatchType = typeof schema.match.$inferSelect;

  // Calculate solo games: 1v1 or 1v2 matches where player was solo
  const allMatches = await db.query.match.findMany({
    where: and(
      eq(schema.match.isDeleted, false),
      or(
        eq(schema.match.team1Player1Id, playerId),
        eq(schema.match.team1Player2Id, playerId),
        eq(schema.match.team2Player1Id, playerId),
        eq(schema.match.team2Player2Id, playerId),
      ),
    ),
  });

  const soloMatches = allMatches.filter((match: MatchType) => {
    // 1v1 matches count as solo
    if (match.matchType === "1v1") {
      return true;
    }
    // 1v2 matches where player was the solo player
    if (match.matchType === "1v2") {
      const team1HasPlayer =
        match.team1Player1Id === playerId || match.team1Player2Id === playerId;
      const team1IsSolo = match.team1Player2Id === null;
      const team2IsSolo = match.team2Player2Id === null;

      return (
        (team1HasPlayer && team1IsSolo) || (!team1HasPlayer && team2IsSolo)
      );
    }
    return false;
  });

  const soloGames = soloMatches.length;

  // Set cache-control headers to prevent caching of API responses with profileImage
  c.header("Cache-Control", "no-cache, no-store, must-revalidate");
  c.header("Pragma", "no-cache");
  c.header("Expires", "0");

  return c.json(
    {
      player: {
        id: player.id,
        displayName: player.displayName,
        displayRating: conservativeRating(
          player.generalMu,
          player.generalSigma,
        ),
        defenseRating: conservativeRating(
          player.defenseMu,
          player.defenseSigma,
        ),
        attackRating: conservativeRating(player.attackMu, player.attackSigma),
        soloRating: conservativeRating(player.soloMu, player.soloSigma),
        generalMu: player.generalMu,
        generalSigma: player.generalSigma,
        defenseMu: player.defenseMu,
        defenseSigma: player.defenseSigma,
        attackMu: player.attackMu,
        attackSigma: player.attackSigma,
        soloMu: player.soloMu,
        soloSigma: player.soloSigma,
        gamesPlayed: player.gamesPlayed,
        defenseGames: player.defenseGames,
        attackGames: player.attackGames,
        soloGames,
        wins: player.wins,
        losses: player.losses,
        winRate:
          player.gamesPlayed > 0 ? (player.wins / player.gamesPlayed) * 100 : 0,
        winStreak: player.winStreak,
        bestWinStreak: player.bestWinStreak,
        profileImage: getProfileImageUrl(user?.profileImage ?? null),
      },
    },
    200,
  );
});

// GET /players/:id/history - Requires authentication
playerRoutes.get("/players/:id/history", requireAuth, async (c) => {
  const playerId = c.req.param("id");
  const db = createDatabase(c.env);
  const currentUser = c.get("user")!;

  const player = await db.query.player.findFirst({
    where: eq(schema.player.id, playerId),
  });

  if (!player) {
    throw new CustomError("Player not found", ErrorCode.NOT_FOUND);
  }

  // Get user to check if admin
  const user = await db.query.user.findFirst({
    where: eq(schema.user.id, player.userId),
    columns: { id: true, isAdmin: true },
  });

  // If player belongs to admin user, only allow access if current user is that admin
  if (user?.isAdmin && user.id !== currentUser.id) {
    throw new CustomError("Player not found", ErrorCode.NOT_FOUND);
  }

  try {
    const history = await db
      .select()
      .from(schema.ratingHistory)
      .where(eq(schema.ratingHistory.playerId, playerId))
      .orderBy(desc(schema.ratingHistory.createdAt))
      .limit(100);

    return c.json(
      {
        history: history.map((h) => ({
          id: h.id,
          muBefore: h.muBefore,
          sigmaBefore: h.sigmaBefore,
          muAfter: h.muAfter,
          sigmaAfter: h.sigmaAfter,
          muChange: h.muChange,
          displayBefore: conservativeRating(h.muBefore, h.sigmaBefore),
          displayAfter: conservativeRating(h.muAfter, h.sigmaAfter),
          createdAt: h.createdAt,
          matchId: h.matchId,
        })),
      },
      200,
    );
  } catch (err) {
    console.error("Player history error:", err);
    // Return empty history on error to not break the page
    return c.json({ history: [] }, 200);
  }
});

// GET /players/mvp/monthly
playerRoutes.get(
  "/players/mvp/monthly",
  requireAuth,
  zValidator("query", monthlyMVPSchema),
  async (c) => {
    const now = new Date();
    const { year = now.getFullYear(), month = now.getMonth() + 1 } =
      c.req.valid("query");
    const db = createDatabase(c.env);

    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

    const monthlyMvpQuery = sql`
      WITH player_changes AS (
        SELECT
          rh.player_id,
          rh.match_id,
          rh.mu_change,
          rh.mu_before,
          rh.mu_after
        FROM rating_history rh
        WHERE rh.created_at >= ${monthStart}
          AND rh.created_at <= ${monthEnd}
      ),
      aggregated AS (
        SELECT
          player_id,
          COUNT(DISTINCT match_id) AS games_played,
          SUM(mu_change) AS mu_gained,
          MIN(mu_before) AS first_mu,
          MAX(mu_after) AS last_mu
        FROM player_changes
        GROUP BY player_id
        HAVING COUNT(DISTINCT match_id) >= 5
      )
      SELECT
        player_id,
        games_played,
        mu_gained,
        first_mu,
        last_mu
      FROM aggregated
      ORDER BY mu_gained DESC;
    `;

    const aggregatedRows = (await db.execute(monthlyMvpQuery)) as any[];

    const qualifiedPlayers = aggregatedRows.map((row: any) => ({
      playerId: row.player_id as string,
      gamesPlayed: Number(row.games_played || 0),
      muGained: Number(row.mu_gained || 0),
      startMu: Number(row.first_mu || 0),
      endMu: Number(row.last_mu || 0),
    }));

    type PlayerType = { id: string; displayName: string };

    const playerIds = qualifiedPlayers.map((p) => p.playerId);
    const players = await db.query.player.findMany({
      where: inArray(schema.player.id, playerIds),
      columns: { id: true, displayName: true },
    });

    const playerMap = new Map(
      players.map((p: PlayerType) => [p.id, p.displayName]),
    );

    const topPerformers = qualifiedPlayers.slice(0, 5).map((p) => ({
      playerId: p.playerId,
      displayName: playerMap.get(p.playerId) || "Unknown",
      gamesPlayed: p.gamesPlayed,
      muGained: p.muGained,
      startMu: p.startMu,
      endMu: p.endMu,
    }));

    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];

    return c.json(
      {
        month: monthNames[month - 1]!,
        year,
        monthNumber: month,
        mvp: topPerformers.length > 0 ? topPerformers[0]! : null,
        topPerformers,
      },
      200,
    );
  },
);

// GET /players/:id/won-seasons
playerRoutes.get("/players/:id/won-seasons", requireAuth, async (c) => {
  const playerId = c.req.param("id");
  const db = createDatabase(c.env);

  const wonSeasons = await db.query.season.findMany({
    where: and(
      eq(schema.season.winnerId, playerId),
      eq(schema.season.isActive, false),
    ),
    orderBy: (seasons, { desc }) => [desc(seasons.endDate)],
  });

  return c.json(
    {
      seasons: wonSeasons.map((s) => ({
        id: s.id,
        name: s.name,
        startDate: s.startDate,
        endDate: s.endDate,
        icon: s.icon,
        winnerMvpScore: s.winnerMvpScore,
      })),
    },
    200,
  );
});

// GET /players/:id/opponents
playerRoutes.get("/players/:id/opponents", requireAuth, async (c) => {
  const playerId = c.req.param("id");
  const db = createDatabase(c.env);
  const currentUser = c.get("user")!;

  const player = await db.query.player.findFirst({
    where: eq(schema.player.id, playerId),
  });

  if (!player) {
    throw new CustomError("Player not found", ErrorCode.NOT_FOUND);
  }

  // Get user to check if admin
  const user = await db.query.user.findFirst({
    where: eq(schema.user.id, player.userId),
    columns: { id: true, isAdmin: true },
  });

  // If player belongs to admin user, only allow access if current user is that admin
  if (user?.isAdmin && user.id !== currentUser.id) {
    throw new CustomError("Player not found", ErrorCode.NOT_FOUND);
  }

  const opponentStatsQuery = sql`
    WITH player_matches AS (
      SELECT 
        m.id,
        m.winning_team,
        m.team1_player1_id,
        m.team1_player2_id,
        m.team2_player1_id,
        m.team2_player2_id,
        CASE
          WHEN m.team1_player1_id = ${playerId} OR m.team1_player2_id = ${playerId} THEN 1
          ELSE 2
        END AS player_team
      FROM match m
      WHERE m.is_deleted = false
        AND (
          m.team1_player1_id = ${playerId}
          OR m.team1_player2_id = ${playerId}
          OR m.team2_player1_id = ${playerId}
          OR m.team2_player2_id = ${playerId}
        )
    ),
    opponents_raw AS (
      -- Opponent slots from the opposite team
      SELECT
        CASE
          WHEN player_team = 1 THEN team2_player1_id
          ELSE team1_player1_id
        END AS opponent_id,
        CASE WHEN winning_team = player_team THEN 1 ELSE 0 END AS win,
        CASE WHEN winning_team <> player_team THEN 1 ELSE 0 END AS loss
      FROM player_matches
      WHERE (player_team = 1 AND team2_player1_id IS NOT NULL)
         OR (player_team = 2 AND team1_player1_id IS NOT NULL)
      UNION ALL
      SELECT
        CASE
          WHEN player_team = 1 THEN team2_player2_id
          ELSE team1_player2_id
        END AS opponent_id,
        CASE WHEN winning_team = player_team THEN 1 ELSE 0 END AS win,
        CASE WHEN winning_team <> player_team THEN 1 ELSE 0 END AS loss
      FROM player_matches
      WHERE (player_team = 1 AND team2_player2_id IS NOT NULL)
         OR (player_team = 2 AND team1_player2_id IS NOT NULL)
    ),
    opponent_stats AS (
      SELECT
        opponent_id,
        COUNT(*) AS match_count,
        SUM(win) AS wins,
        SUM(loss) AS losses
      FROM opponents_raw
      WHERE opponent_id IS NOT NULL
      GROUP BY opponent_id
      HAVING COUNT(*) >= 3
    )
    SELECT
      os.opponent_id,
      os.match_count,
      os.wins,
      os.losses,
      p.display_name
    FROM opponent_stats os
    JOIN player p ON p.id = os.opponent_id
    ORDER BY os.match_count DESC;
  `;

  const rows = (await db.execute(opponentStatsQuery)) as any[];

  return c.json(
    {
      opponents: rows.map((row: any) => {
        const matchesPlayed = Number(row.match_count || 0);
        const wins = Number(row.wins || 0);
        const losses = Number(row.losses || 0);

        return {
          opponentId: row.opponent_id as string,
          opponentName: (row.display_name as string) || "Unknown",
          matchesPlayed,
          wins,
          losses,
          winRate: matchesPlayed > 0 ? (wins / matchesPlayed) * 100 : 0,
        };
      }),
    },
    200,
  );
});

// PATCH /players/:id/displayName - Update player display name (only owner)
playerRoutes.patch(
  "/players/:id/displayName",
  requireAuth,
  zValidator("param", z.object({ id: z.string() })),
  zValidator("json", updateDisplayNameSchema),
  async (c) => {
    const playerId = c.req.param("id");
    const { displayName } = c.req.valid("json");
    const user = c.get("user")!;
    const db = createDatabase(c.env);

    // Find player and verify ownership
    const player = await db.query.player.findFirst({
      where: eq(schema.player.id, playerId),
    });

    if (!player) {
      throw new CustomError("Player not found", ErrorCode.NOT_FOUND);
    }

    // Get player's user to check if admin
    const playerUser = await db.query.user.findFirst({
      where: eq(schema.user.id, player.userId),
      columns: { id: true, isAdmin: true },
    });

    // If player belongs to admin user, only allow access if current user is that admin
    if (playerUser?.isAdmin && playerUser.id !== user.id) {
      throw new CustomError("Player not found", ErrorCode.NOT_FOUND);
    }

    if (player.userId !== user.id) {
      throw new CustomError(
        "Unauthorized: You can only edit your own player name",
        ErrorCode.PERMISSION_DENIED,
      );
    }

    // Update display name
    const [updatedPlayer] = await db
      .update(schema.player)
      .set({
        displayName,
        updatedAt: new Date(),
      })
      .where(eq(schema.player.id, playerId))
      .returning();

    if (!updatedPlayer) {
      throw new CustomError(
        "Failed to update player name",
        ErrorCode.UNEXPECTED_ERROR,
      );
    }

    return c.json(
      {
        success: true,
        player: {
          id: updatedPlayer.id,
          displayName: updatedPlayer.displayName,
        },
      },
      200,
    );
  },
);

// Use centralized error handler
playerRoutes.onError(errorHandler);
