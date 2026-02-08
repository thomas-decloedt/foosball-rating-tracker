import type { MatchTeamSizeType } from "@/backend/drizzle/schema";

interface MatchInput {
  team1Player1Id: string;
  team1Player2Id: string | null;
  team2Player1Id: string;
  team2Player2Id: string | null;
  team1Score: number;
  team2Score: number;
}

interface ValidationResult {
  valid: boolean;
  error?: string;
  matchType?: MatchTeamSizeType;
}

export function validateMatch(match: MatchInput): ValidationResult {
  const {
    team1Player1Id,
    team1Player2Id,
    team2Player1Id,
    team2Player2Id,
    team1Score,
    team2Score,
  } = match;

  const playerIds = [
    team1Player1Id,
    team1Player2Id,
    team2Player1Id,
    team2Player2Id,
  ].filter((id): id is string => id !== null);

  const uniqueIds = new Set(playerIds);
  if (uniqueIds.size !== playerIds.length) {
    return { valid: false, error: "Players must be unique" };
  }

  if (playerIds.length < 2 || playerIds.length > 4) {
    return { valid: false, error: "Match must have 2-4 players" };
  }

  const team1Size = team1Player2Id ? 2 : 1;
  const team2Size = team2Player2Id ? 2 : 1;
  let matchType: MatchTeamSizeType;

  if (team1Size === 1 && team2Size === 1) {
    matchType = "1v1";
  } else if (
    (team1Size === 1 && team2Size === 2) ||
    (team1Size === 2 && team2Size === 1)
  ) {
    matchType = "1v2";
  } else if (team1Size === 2 && team2Size === 2) {
    matchType = "2v2";
  } else {
    return { valid: false, error: "Invalid team composition" };
  }

  if (team1Score < 0 || team2Score < 0) {
    return { valid: false, error: "Scores must be non-negative" };
  }

  if (team1Score === team2Score) {
    return { valid: false, error: "Match cannot end in a tie" };
  }

  const scoreDiff = Math.abs(team1Score - team2Score);
  const maxScore = Math.max(team1Score, team2Score);

  if (maxScore >= 11 && scoreDiff < 2) {
    return {
      valid: false,
      error: "Must win by at least 2 points when score is 11+",
    };
  }

  return { valid: true, matchType };
}

/**
 * Validate match scores only (for updating existing matches)
 * Does not validate player uniqueness or team composition
 */
export function validateMatchScores(
  team1Score: number,
  team2Score: number,
): ValidationResult {
  if (team1Score < 0 || team2Score < 0) {
    return { valid: false, error: "Scores must be non-negative" };
  }

  if (team1Score === team2Score) {
    return { valid: false, error: "Match cannot end in a tie" };
  }

  const scoreDiff = Math.abs(team1Score - team2Score);
  const maxScore = Math.max(team1Score, team2Score);

  if (maxScore >= 11 && scoreDiff < 2) {
    return {
      valid: false,
      error: "Must win by at least 2 points when score is 11+",
    };
  }

  return { valid: true };
}
