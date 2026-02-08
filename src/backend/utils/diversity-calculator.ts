import * as schema from "../drizzle/schema";
import type { PlayerPositionType } from "@/api-models/position";
import { PlayerPosition } from "@/api-models/position";

export interface DiversityScoreResult {
  positionScore: number; // 0-1, where 1 = full diversity across DEFENSE and ATTACK
  teamScore: number; // 0-1, where 1 = maximum team diversity (evenly distributed teammates)
  combinedScore: number; // Weighted combination of both scores
}

type MatchType = typeof schema.match.$inferSelect;

export interface DiversityConfig {
  positionDiversityWeight: number;
  teamDiversityWeight: number;
}

export const DEFAULT_DIVERSITY_CONFIG: DiversityConfig = {
  positionDiversityWeight: 0.5,
  teamDiversityWeight: 0.5,
};

/**
 * Calculate diversity score for a player based on position and team composition
 * Position diversity: Shannon entropy across DEFENSE and ATTACK positions only
 * Team diversity: Shannon entropy across teammate/opponent distribution
 * This is the inverse of the penalty - higher score = more diverse
 */
export function calculateDiversityScore(
  playerId: string,
  matches: MatchType[],
  config: DiversityConfig = DEFAULT_DIVERSITY_CONFIG,
): DiversityScoreResult {
  // Filter matches for this player (all-time, excluding deleted and friendly)
  const playerMatches = matches.filter(
    (m) =>
      !m.isFriendly &&
      !m.isDeleted &&
      (m.team1Player1Id === playerId ||
        m.team1Player2Id === playerId ||
        m.team2Player1Id === playerId ||
        m.team2Player2Id === playerId),
  );

  if (playerMatches.length === 0) {
    return {
      positionScore: 0,
      teamScore: 0,
      combinedScore: 0,
    };
  }

  // 1. Position Diversity: Calculate entropy of position distribution (DEFENSE and ATTACK only)
  const positionCounts = new Map<PlayerPositionType, number>();
  for (const match of playerMatches) {
    let position: PlayerPositionType | null = null;

    if (match.team1Player1Id === playerId) {
      position = match.team1Player1Position as PlayerPositionType;
    } else if (match.team1Player2Id === playerId) {
      position = match.team1Player2Position as PlayerPositionType;
    } else if (match.team2Player1Id === playerId) {
      position = match.team2Player1Position as PlayerPositionType;
    } else if (match.team2Player2Id === playerId) {
      position = match.team2Player2Position as PlayerPositionType;
    }

    // Only count DEFENSE and ATTACK positions (ignore SOLO and MIXED)
    if (
      position &&
      (position === PlayerPosition.DEFENSE ||
        position === PlayerPosition.ATTACK)
    ) {
      positionCounts.set(position, (positionCounts.get(position) || 0) + 1);
    }
  }

  // Calculate Shannon entropy for positions
  let positionEntropy = 0;
  const totalPositionGames = Array.from(positionCounts.values()).reduce(
    (sum, count) => sum + count,
    0,
  );
  const maxPositionEntropy = Math.log2(2); // 2 possible positions: DEFENSE and ATTACK

  if (totalPositionGames > 0 && positionCounts.size > 0) {
    for (const count of positionCounts.values()) {
      const probability = count / totalPositionGames;
      if (probability > 0) {
        positionEntropy -= probability * Math.log2(probability);
      }
    }
  }

  // Normalize entropy (0 = no diversity, 1 = full diversity)
  const positionScore =
    maxPositionEntropy > 0 ? positionEntropy / maxPositionEntropy : 0;

  // 2. Team Composition Diversity: Calculate Shannon entropy of teammate/opponent distribution
  const teammateCounts = new Map<string, number>();
  for (const match of playerMatches) {
    // For 2v2 matches, find teammate
    if (match.matchType === "2v2") {
      if (match.team1Player1Id === playerId && match.team1Player2Id) {
        teammateCounts.set(
          match.team1Player2Id,
          (teammateCounts.get(match.team1Player2Id) || 0) + 1,
        );
      } else if (match.team1Player2Id === playerId && match.team1Player1Id) {
        teammateCounts.set(
          match.team1Player1Id,
          (teammateCounts.get(match.team1Player1Id) || 0) + 1,
        );
      } else if (match.team2Player1Id === playerId && match.team2Player2Id) {
        teammateCounts.set(
          match.team2Player2Id,
          (teammateCounts.get(match.team2Player2Id) || 0) + 1,
        );
      } else if (match.team2Player2Id === playerId && match.team2Player1Id) {
        teammateCounts.set(
          match.team2Player1Id,
          (teammateCounts.get(match.team2Player1Id) || 0) + 1,
        );
      }
    } else {
      // For 1v1 or 1v2, count unique opponents
      if (match.team1Player1Id === playerId) {
        if (match.team2Player1Id) {
          teammateCounts.set(
            match.team2Player1Id,
            (teammateCounts.get(match.team2Player1Id) || 0) + 1,
          );
        }
        if (match.team2Player2Id) {
          teammateCounts.set(
            match.team2Player2Id,
            (teammateCounts.get(match.team2Player2Id) || 0) + 1,
          );
        }
      } else if (match.team1Player2Id === playerId) {
        if (match.team2Player1Id) {
          teammateCounts.set(
            match.team2Player1Id,
            (teammateCounts.get(match.team2Player1Id) || 0) + 1,
          );
        }
        if (match.team2Player2Id) {
          teammateCounts.set(
            match.team2Player2Id,
            (teammateCounts.get(match.team2Player2Id) || 0) + 1,
          );
        }
      } else if (match.team2Player1Id === playerId) {
        if (match.team1Player1Id) {
          teammateCounts.set(
            match.team1Player1Id,
            (teammateCounts.get(match.team1Player1Id) || 0) + 1,
          );
        }
        if (match.team1Player2Id) {
          teammateCounts.set(
            match.team1Player2Id,
            (teammateCounts.get(match.team1Player2Id) || 0) + 1,
          );
        }
      } else if (match.team2Player2Id === playerId) {
        if (match.team1Player1Id) {
          teammateCounts.set(
            match.team1Player1Id,
            (teammateCounts.get(match.team1Player1Id) || 0) + 1,
          );
        }
        if (match.team1Player2Id) {
          teammateCounts.set(
            match.team1Player2Id,
            (teammateCounts.get(match.team1Player2Id) || 0) + 1,
          );
        }
      }
    }
  }

  // Calculate Shannon entropy for teammates
  let teamEntropy = 0;
  const totalTeamGames = Array.from(teammateCounts.values()).reduce(
    (sum, count) => sum + count,
    0,
  );
  const uniqueTeammateCount = teammateCounts.size;
  const maxTeamEntropy =
    uniqueTeammateCount > 0 ? Math.log2(uniqueTeammateCount) : 0;

  if (totalTeamGames > 0 && uniqueTeammateCount > 0) {
    for (const count of teammateCounts.values()) {
      const probability = count / totalTeamGames;
      if (probability > 0) {
        teamEntropy -= probability * Math.log2(probability);
      }
    }
  }

  // Normalize entropy (0 = no diversity, 1 = full diversity)
  const teamScore = maxTeamEntropy > 0 ? teamEntropy / maxTeamEntropy : 0;

  // Combined score: weighted average
  const combinedScore =
    positionScore * config.positionDiversityWeight +
    teamScore * config.teamDiversityWeight;

  return {
    positionScore,
    teamScore,
    combinedScore,
  };
}
