import { rating, rate } from "openskill";
import type { MatchTeamSizeType } from "@/backend/drizzle/schema";
import { PlayerPosition, type PlayerPositionType } from "@/api-models/position";
import {
  OPENSKILL_CONFIG,
  GENERAL_WEIGHT,
  ROLE_WEIGHT,
  CONSERVATIVE_FACTOR,
} from "./openskill-config";

interface Rating {
  mu: number;
  sigma: number;
}

interface Player {
  id: string;
  generalMu: number;
  generalSigma: number;
  defenseMu: number;
  defenseSigma: number;
  attackMu: number;
  attackSigma: number;
  soloMu: number;
  soloSigma: number;
  position?: PlayerPositionType;
}

interface Team {
  player1: Player;
  player2: Player | null;
}

interface CalculateRatingChangesInput {
  team1: Team;
  team2: Team;
  winningTeam: 1 | 2;
  matchType: MatchTeamSizeType;
}

export interface RatingChange {
  playerId: string;
  // General rating changes (always updated)
  oldGeneralMu: number;
  oldGeneralSigma: number;
  newGeneralMu: number;
  newGeneralSigma: number;
  generalMuChange: number;
  // Role-specific changes (optional - only when role is active)
  oldRoleMu?: number;
  oldRoleSigma?: number;
  newRoleMu?: number;
  newRoleSigma?: number;
  roleMuChange?: number;
  // Metadata
  won: boolean;
  position: PlayerPositionType;
  displayRating: number; // Conservative: μ - 3σ
}

/**
 * Calculate conservative rating for display: μ - k*σ
 * Higher k = more conservative (rewards consistency)
 */
export function conservativeRating(
  mu: number,
  sigma: number,
  k: number = CONSERVATIVE_FACTOR,
): number {
  return Math.round(mu - k * sigma);
}

/**
 * Get the role-specific rating for a player based on their position
 */
function getRoleRating(player: Player, position: PlayerPositionType): Rating {
  switch (position) {
    case PlayerPosition.DEFENSE:
      return { mu: player.defenseMu, sigma: player.defenseSigma };
    case PlayerPosition.ATTACK:
      return { mu: player.attackMu, sigma: player.attackSigma };
    case PlayerPosition.SOLO:
      return { mu: player.soloMu, sigma: player.soloSigma };
    case PlayerPosition.MIXED:
    default:
      // For MIXED position, use general rating as role rating
      return { mu: player.generalMu, sigma: player.generalSigma };
  }
}

/**
 * Calculate effective rating by combining general and role-specific ratings
 * μ_effective = w_g * μ_general + w_r * μ_role
 * σ_effective = sqrt(w_g² * σ_general² + w_r² * σ_role²)
 */
function calculateEffectiveRating(
  generalRating: Rating,
  roleRating: Rating,
): Rating {
  const mu = GENERAL_WEIGHT * generalRating.mu + ROLE_WEIGHT * roleRating.mu;

  // Combined uncertainty (weighted root sum of squares)
  const sigma = Math.sqrt(
    GENERAL_WEIGHT ** 2 * generalRating.sigma ** 2 +
      ROLE_WEIGHT ** 2 * roleRating.sigma ** 2,
  );

  return { mu, sigma };
}

/**
 * Main function to calculate rating changes for all players in a match
 * Uses OpenSkill's rate() function with Plackett-Luce model
 */
export function calculateRatingChanges(
  input: CalculateRatingChangesInput,
): RatingChange[] {
  const { team1, team2, winningTeam, matchType } = input;
  const changes: RatingChange[] = [];

  // Build arrays of players for each team
  const team1Players = [team1.player1, team1.player2].filter(
    (p): p is Player => p !== null,
  );
  const team2Players = [team2.player1, team2.player2].filter(
    (p): p is Player => p !== null,
  );

  // Calculate effective ratings for each player
  // Effective rating = weighted combination of general + role ratings
  const team1EffectiveRatings = team1Players.map((p) => {
    const generalRating = {
      mu: p.generalMu,
      sigma: p.generalSigma,
    };
    const roleRating = getRoleRating(p, p.position!);
    return calculateEffectiveRating(generalRating, roleRating);
  });

  const team2EffectiveRatings = team2Players.map((p) => {
    const generalRating = {
      mu: p.generalMu,
      sigma: p.generalSigma,
    };
    const roleRating = getRoleRating(p, p.position!);
    return calculateEffectiveRating(generalRating, roleRating);
  });

  // Call OpenSkill rate() function
  // rank: 1 for winner, 2 for loser (lower rank is better)
  const team1Rank = winningTeam === 1 ? 1 : 2;
  const team2Rank = winningTeam === 2 ? 1 : 2;

  const rateResult = rate(
    [
      team1EffectiveRatings.map((r) => rating({ mu: r.mu, sigma: r.sigma })),
      team2EffectiveRatings.map((r) => rating({ mu: r.mu, sigma: r.sigma })),
    ],
    {
      rank: [team1Rank, team2Rank],
      ...OPENSKILL_CONFIG,
    },
  );

  const [newTeam1Ratings, newTeam2Ratings] = rateResult;

  // Process team 1 changes
  for (let i = 0; i < team1Players.length; i++) {
    const player = team1Players[i]!;
    const oldEffective = team1EffectiveRatings[i]!;
    const newEffective = newTeam1Ratings![i]!;

    // Calculate the change in effective rating
    const effectiveMuChange = newEffective.mu - oldEffective.mu;
    const effectiveSigmaChange = newEffective.sigma - oldEffective.sigma;

    // Distribute the mu change proportionally back to general and role ratings
    // General gets GENERAL_WEIGHT portion, role gets ROLE_WEIGHT portion
    const generalMuChange =
      (effectiveMuChange * GENERAL_WEIGHT) / (GENERAL_WEIGHT + ROLE_WEIGHT);
    const roleMuChange =
      (effectiveMuChange * ROLE_WEIGHT) / (GENERAL_WEIGHT + ROLE_WEIGHT);

    // Update general rating
    const newGeneralMu = player.generalMu + generalMuChange;
    const newGeneralSigma =
      player.generalSigma + effectiveSigmaChange * GENERAL_WEIGHT;

    const change: RatingChange = {
      playerId: player.id,
      oldGeneralMu: player.generalMu,
      oldGeneralSigma: player.generalSigma,
      newGeneralMu,
      newGeneralSigma,
      generalMuChange,
      won: winningTeam === 1,
      position: player.position!,
      displayRating: conservativeRating(newGeneralMu, newGeneralSigma),
    };

    // Update role-specific rating if applicable
    const position = player.position!;

    // Solo rating updated in 1v1 or when playing solo in 1v2
    if (
      matchType === "1v1" ||
      (matchType === "1v2" && position === PlayerPosition.SOLO)
    ) {
      const newSoloMu = player.soloMu + roleMuChange;
      const newSoloSigma =
        player.soloSigma + effectiveSigmaChange * ROLE_WEIGHT;
      change.oldRoleMu = player.soloMu;
      change.oldRoleSigma = player.soloSigma;
      change.newRoleMu = newSoloMu;
      change.newRoleSigma = newSoloSigma;
      change.roleMuChange = roleMuChange;
    }
    // Defense rating updated when playing defense in team games
    else if (position === PlayerPosition.DEFENSE) {
      const newDefenseMu = player.defenseMu + roleMuChange;
      const newDefenseSigma =
        player.defenseSigma + effectiveSigmaChange * ROLE_WEIGHT;
      change.oldRoleMu = player.defenseMu;
      change.oldRoleSigma = player.defenseSigma;
      change.newRoleMu = newDefenseMu;
      change.newRoleSigma = newDefenseSigma;
      change.roleMuChange = roleMuChange;
    }
    // Attack rating updated when playing attack in team games
    else if (position === PlayerPosition.ATTACK) {
      const newAttackMu = player.attackMu + roleMuChange;
      const newAttackSigma =
        player.attackSigma + effectiveSigmaChange * ROLE_WEIGHT;
      change.oldRoleMu = player.attackMu;
      change.oldRoleSigma = player.attackSigma;
      change.newRoleMu = newAttackMu;
      change.newRoleSigma = newAttackSigma;
      change.roleMuChange = roleMuChange;
    }
    // MIXED position: no role-specific update (only general)

    changes.push(change);
  }

  // Process team 2 changes (same logic as team 1)
  for (let i = 0; i < team2Players.length; i++) {
    const player = team2Players[i]!;
    const oldEffective = team2EffectiveRatings[i]!;
    const newEffective = newTeam2Ratings![i]!;

    const effectiveMuChange = newEffective.mu - oldEffective.mu;
    const effectiveSigmaChange = newEffective.sigma - oldEffective.sigma;

    const generalMuChange =
      (effectiveMuChange * GENERAL_WEIGHT) / (GENERAL_WEIGHT + ROLE_WEIGHT);
    const roleMuChange =
      (effectiveMuChange * ROLE_WEIGHT) / (GENERAL_WEIGHT + ROLE_WEIGHT);

    const newGeneralMu = player.generalMu + generalMuChange;
    const newGeneralSigma =
      player.generalSigma + effectiveSigmaChange * GENERAL_WEIGHT;

    const change: RatingChange = {
      playerId: player.id,
      oldGeneralMu: player.generalMu,
      oldGeneralSigma: player.generalSigma,
      newGeneralMu,
      newGeneralSigma,
      generalMuChange,
      won: winningTeam === 2,
      position: player.position!,
      displayRating: conservativeRating(newGeneralMu, newGeneralSigma),
    };

    // Update role-specific rating if applicable
    const position = player.position!;

    if (
      matchType === "1v1" ||
      (matchType === "1v2" && position === PlayerPosition.SOLO)
    ) {
      const newSoloMu = player.soloMu + roleMuChange;
      const newSoloSigma =
        player.soloSigma + effectiveSigmaChange * ROLE_WEIGHT;
      change.oldRoleMu = player.soloMu;
      change.oldRoleSigma = player.soloSigma;
      change.newRoleMu = newSoloMu;
      change.newRoleSigma = newSoloSigma;
      change.roleMuChange = roleMuChange;
    } else if (position === PlayerPosition.DEFENSE) {
      const newDefenseMu = player.defenseMu + roleMuChange;
      const newDefenseSigma =
        player.defenseSigma + effectiveSigmaChange * ROLE_WEIGHT;
      change.oldRoleMu = player.defenseMu;
      change.oldRoleSigma = player.defenseSigma;
      change.newRoleMu = newDefenseMu;
      change.newRoleSigma = newDefenseSigma;
      change.roleMuChange = roleMuChange;
    } else if (position === PlayerPosition.ATTACK) {
      const newAttackMu = player.attackMu + roleMuChange;
      const newAttackSigma =
        player.attackSigma + effectiveSigmaChange * ROLE_WEIGHT;
      change.oldRoleMu = player.attackMu;
      change.oldRoleSigma = player.attackSigma;
      change.newRoleMu = newAttackMu;
      change.newRoleSigma = newAttackSigma;
      change.roleMuChange = roleMuChange;
    }

    changes.push(change);
  }

  return changes;
}
