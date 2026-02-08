import { eq, gte } from "drizzle-orm";
import type { Database } from "../drizzle/db";
import * as schema from "../drizzle/schema";
import { conservativeRating } from "./rating-display";
import {
  calculateDiversityScore,
  type DiversityConfig,
} from "./diversity-calculator";

export interface ScoringConfig {
  bayesianPrior: number;
  bayesianPriorWinRate: number;
  netWinsMultiplier: number;
  ratingGainMultiplier: number;
  diversityPenaltyMultiplier: number;
  positionDiversityWeight: number;
  teamDiversityWeight: number;
  gamesWeightMin: number;
  gamesWeightMax: number;
  teammateQualityBonusMultiplier: number;
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  bayesianPrior: 10,
  bayesianPriorWinRate: 0.5,
  netWinsMultiplier: 0.1,
  ratingGainMultiplier: 0.15,
  diversityPenaltyMultiplier: 0.2,
  positionDiversityWeight: 0.5,
  teamDiversityWeight: 0.5,
  gamesWeightMin: 0.6,
  gamesWeightMax: 0.4,
  teammateQualityBonusMultiplier: 0.05,
};

export interface DiversityPenaltyResult {
  positionPenalty: number;
  teamPenalty: number;
  combinedPenalty: number;
}

export interface MVPScoreBreakdown {
  bayesianWinRate: number;
  gamesWeight: number;
  netWins: number;
  netWinsContribution: number;
  ratingGain: number;
  ratingGainContribution: number;
  diversityPenalty: number;
  diversityPenaltyContribution: number;
  teammateQualityBonus: number;
  teammateQualityBonusContribution: number;
  finalScore: number;
}

type MatchType = typeof schema.match.$inferSelect;

/**
 * Calculate diversity penalty for a player based on position and team composition
 * This function converts diversity score to penalty for MVP calculations
 */
export async function calculateDiversityPenalty(
  playerId: string,
  seasonId: string,
  matches: MatchType[],
  config: ScoringConfig,
): Promise<DiversityPenaltyResult> {
  // Filter matches for this player in this season
  const seasonMatches = matches.filter(
    (m) =>
      !m.isFriendly &&
      !m.isDeleted &&
      m.seasonId === seasonId &&
      (m.team1Player1Id === playerId ||
        m.team1Player2Id === playerId ||
        m.team2Player1Id === playerId ||
        m.team2Player2Id === playerId),
  );

  if (seasonMatches.length === 0) {
    return {
      positionPenalty: 0,
      teamPenalty: 0,
      combinedPenalty: 0,
    };
  }

  // Use the extracted diversity calculator
  const diversityConfig: DiversityConfig = {
    positionDiversityWeight: config.positionDiversityWeight,
    teamDiversityWeight: config.teamDiversityWeight,
  };

  const diversityScore = calculateDiversityScore(
    playerId,
    seasonMatches,
    diversityConfig,
  );

  // Convert score to penalty: penalty = (1 - score) * weight
  const positionPenalty =
    (1 - diversityScore.positionScore) * config.positionDiversityWeight;
  const teamPenalty =
    (1 - diversityScore.teamScore) * config.teamDiversityWeight;
  const combinedPenalty = positionPenalty + teamPenalty;

  return {
    positionPenalty,
    teamPenalty,
    combinedPenalty,
  };
}

/**
 * Calculate teammate quality bonus - rewards playing with lower-rated players
 */
export async function calculateTeammateQualityBonus(
  playerId: string,
  seasonId: string,
  matches: MatchType[],
  playerRatings: Map<string, { mu: number; sigma: number }>,
): Promise<number> {
  // Filter matches for this player in this season
  const playerMatches = matches.filter(
    (m) =>
      !m.isFriendly &&
      !m.isDeleted &&
      m.seasonId === seasonId &&
      (m.team1Player1Id === playerId ||
        m.team1Player2Id === playerId ||
        m.team2Player1Id === playerId ||
        m.team2Player2Id === playerId),
  );

  if (playerMatches.length === 0) {
    return 0;
  }

  // Calculate average rating across all players in the season
  const allRatings = Array.from(playerRatings.values()).map((r) =>
    conservativeRating(r.mu, r.sigma),
  );
  const averageRating =
    allRatings.length > 0
      ? allRatings.reduce((sum, r) => sum + r, 0) / allRatings.length
      : 25; // Default to 25 if no players

  // Collect all teammates and their ratings
  const teammateRatings: number[] = [];
  for (const match of playerMatches) {
    // For 2v2 matches, find teammate
    if (match.matchType === "2v2") {
      let teammateId: string | null = null;
      if (match.team1Player1Id === playerId && match.team1Player2Id) {
        teammateId = match.team1Player2Id;
      } else if (match.team1Player2Id === playerId && match.team1Player1Id) {
        teammateId = match.team1Player1Id;
      } else if (match.team2Player1Id === playerId && match.team2Player2Id) {
        teammateId = match.team2Player2Id;
      } else if (match.team2Player2Id === playerId && match.team2Player1Id) {
        teammateId = match.team2Player1Id;
      }

      if (teammateId) {
        const teammateRating = playerRatings.get(teammateId);
        if (teammateRating) {
          const rating = conservativeRating(
            teammateRating.mu,
            teammateRating.sigma,
          );
          teammateRatings.push(rating);
        }
      }
    }
    // For 1v1 or 1v2, we don't have teammates, so skip
  }

  if (teammateRatings.length === 0) {
    return 0;
  }

  // Calculate bonus: reward for each teammate below average
  // Bonus is proportional to how much below average they are
  let totalBonus = 0;
  for (const rating of teammateRatings) {
    if (rating < averageRating) {
      // Bonus increases the more below average the teammate is
      const belowAverage = averageRating - rating;
      totalBonus += belowAverage;
    }
    // If rating >= averageRating, bonus is 0 (neutral)
  }

  // Normalize by number of teammates (average bonus per teammate)
  const avgBonus = totalBonus / teammateRatings.length;

  return avgBonus;
}

/**
 * Calculate expected max games from historical weekly data
 */
export async function calculateExpectedMaxGames(
  db: Database,
  lookbackWeeks: number = 8,
): Promise<number> {
  // Get recent completed seasons (last N weeks)
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - lookbackWeeks * 7);

  const recentStats = await db.query.weeklyStats.findMany({
    where: gte(schema.weeklyStats.weekStartDate, cutoffDate),
    orderBy: (stats, { desc }) => [desc(stats.weekStartDate)],
    limit: lookbackWeeks,
  });

  if (recentStats.length === 0) {
    // Default to 15 if no historical data
    return 15;
  }

  // Use 75th percentile of max games
  const maxGames = recentStats.map((s) => s.maxGames).sort((a, b) => b - a);
  const percentile75Index = Math.floor(maxGames.length * 0.25);
  return Math.max(maxGames[percentile75Index] || 15, 15);
}

/**
 * Calculate weekly MVP score using enhanced formula
 */
export function calculateWeeklyMVPScore(
  wins: number,
  losses: number,
  gamesPlayed: number,
  muDelta: number,
  diversityPenalty: number,
  teammateQualityBonus: number,
  expectedMaxGames: number,
  config: ScoringConfig,
): { score: number; breakdown: MVPScoreBreakdown } {
  // Bayesian-adjusted win rate
  const bayesianWinRate =
    (wins + config.bayesianPrior * config.bayesianPriorWinRate) /
    (gamesPlayed + config.bayesianPrior);

  // Games weight
  const gamesWeight =
    config.gamesWeightMin +
    config.gamesWeightMax *
      (Math.log(gamesPlayed + 1) / Math.log(expectedMaxGames + 1));

  // Net wins
  const netWins = wins - losses;
  const netWinsContribution = netWins * config.netWinsMultiplier;

  // Rating gain (normalized by dividing by 10)
  const ratingGain = muDelta / 10;
  const ratingGainContribution = ratingGain * config.ratingGainMultiplier;

  // Diversity penalty contribution
  const diversityPenaltyContribution =
    diversityPenalty * config.diversityPenaltyMultiplier;

  // Teammate quality bonus contribution (rewards playing with lower-rated players)
  const teammateQualityBonusContribution =
    teammateQualityBonus * config.teammateQualityBonusMultiplier;

  // Final score
  const finalScore =
    bayesianWinRate * gamesWeight +
    netWinsContribution +
    ratingGainContribution -
    diversityPenaltyContribution +
    teammateQualityBonusContribution;

  return {
    score: finalScore,
    breakdown: {
      bayesianWinRate,
      gamesWeight,
      netWins,
      netWinsContribution,
      ratingGain,
      ratingGainContribution,
      diversityPenalty,
      diversityPenaltyContribution,
      teammateQualityBonus,
      teammateQualityBonusContribution,
      finalScore,
    },
  };
}

/**
 * Get active scoring config from database
 */
export async function getActiveScoringConfig(
  db: Database,
): Promise<ScoringConfig> {
  const activeConfig = await db.query.scoringConfig.findFirst({
    where: eq(schema.scoringConfig.isActive, true),
  });

  if (!activeConfig) {
    return DEFAULT_SCORING_CONFIG;
  }

  return activeConfig.config as ScoringConfig;
}

/**
 * Get scoring config for a season (from snapshot if historical, active if current)
 */
export async function getSeasonScoringConfig(
  db: Database,
  season: typeof schema.season.$inferSelect,
): Promise<ScoringConfig> {
  // If season has a snapshot (historical), use it
  if (season.scoringConfigSnapshot) {
    return season.scoringConfigSnapshot as ScoringConfig;
  }

  // Otherwise use active config (for active seasons)
  return getActiveScoringConfig(db);
}
