import type { Env } from "../bindings";
import { getCachedJson, setCachedJson } from "./cache";

export type LeaderboardScope = "players" | "season" | "team";

export type PlayerLeaderboardFilter =
  | "standard"
  | "defense_leaders"
  | "attack_leaders"
  | "king_of_hill"
  | "mvp"
  | "biggest_losers"
  | "conqueror"
  | "ball_and_chain"
  | "swiss_army_knife";

export type SeasonLeaderboardFilter =
  | "standard"
  | "mvp"
  | "biggest_losers"
  | "weekly_current";

export type LeaderboardFilter =
  | PlayerLeaderboardFilter
  | SeasonLeaderboardFilter
  | "team_rankings";

export interface LeaderboardKeyContext {
  scope: LeaderboardScope;
  filter: LeaderboardFilter;
  seasonId?: string;
  version?: string;
}

const LEADERBOARD_CACHE_VERSION = "v2";

export function buildLeaderboardCacheKey(ctx: LeaderboardKeyContext): string {
  const version = ctx.version ?? LEADERBOARD_CACHE_VERSION;

  if (ctx.scope === "season") {
    if (ctx.filter === "weekly_current") {
      return `leaderboard:season:weekly_current:${version}`;
    }

    if (!ctx.seasonId) {
      throw new Error(
        `Season leaderboard cache key requires seasonId for filter "${ctx.filter}"`,
      );
    }

    return `leaderboard:season:${ctx.seasonId}:${ctx.filter}:${version}`;
  }

  if (ctx.scope === "players") {
    return `leaderboard:players:${ctx.filter}:${version}`;
  }

  if (ctx.scope === "team") {
    return `leaderboard:team:${ctx.filter}:${version}`;
  }

  throw new Error(`Unsupported leaderboard scope "${ctx.scope}"`);
}

export async function getOrComputeLeaderboard<T>(
  env: Env,
  keyCtx: LeaderboardKeyContext,
  computeFn: () => Promise<T>,
  ttlSeconds?: number,
): Promise<T> {
  const key = buildLeaderboardCacheKey(keyCtx);
  const cached = await getCachedJson<T>(env, key);
  if (cached) {
    return cached;
  }

  const value = await computeFn();
  await setCachedJson(env, key, value, ttlSeconds);
  return value;
}

export function computeAffectedLeaderboardKeys(options: {
  globalChanged?: boolean;
  seasonIds?: string[];
}): string[] {
  const keys: string[] = [];

  if (options.globalChanged) {
    const playerFilters: PlayerLeaderboardFilter[] = [
      "standard",
      "defense_leaders",
      "attack_leaders",
      "king_of_hill",
      "mvp",
      "biggest_losers",
      "conqueror",
      "ball_and_chain",
      "swiss_army_knife",
    ];

    for (const filter of playerFilters) {
      keys.push(
        buildLeaderboardCacheKey({
          scope: "players",
          filter,
        }),
      );
    }

    keys.push(
      buildLeaderboardCacheKey({
        scope: "team",
        filter: "team_rankings",
      }),
    );

    keys.push(
      buildLeaderboardCacheKey({
        scope: "season",
        filter: "weekly_current",
      }),
    );
  }

  for (const seasonId of options.seasonIds ?? []) {
    const seasonFilters: SeasonLeaderboardFilter[] = [
      "standard",
      "mvp",
      "biggest_losers",
    ];

    for (const filter of seasonFilters) {
      keys.push(
        buildLeaderboardCacheKey({
          scope: "season",
          filter,
          seasonId,
        }),
      );
    }
  }

  return keys;
}

export type PlayerStatsRow =
  typeof import("../drizzle/schema").player.$inferSelect;

export interface GlobalMvpBreakdown {
  bayesianWinRate: number;
  gamesWeight: number;
  netWins: number;
  score: number;
}

export function computeGlobalMvpScore(player: PlayerStatsRow): {
  score: number;
  breakdown: GlobalMvpBreakdown;
} {
  const bayesianWinRate = (player.wins + 10 * 0.5) / (player.gamesPlayed + 10);

  const gamesWeight =
    0.6 + 0.4 * (Math.log(player.gamesPlayed + 1) / Math.log(101));

  const netWins = player.wins - player.losses;

  const score = bayesianWinRate * gamesWeight + netWins * 0.1;

  return {
    score,
    breakdown: {
      bayesianWinRate,
      gamesWeight,
      netWins,
      score,
    },
  };
}
