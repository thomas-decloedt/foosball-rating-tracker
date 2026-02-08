import { CONSERVATIVE_FACTOR } from "./openskill-config";

/**
 * Calculate conservative rating for display: μ - k*σ
 *
 * This is the standard TrueSkill/OpenSkill approach for ranking players.
 * It rewards consistency over lucky streaks.
 *
 * @param mu - Skill estimate
 * @param sigma - Uncertainty about skill
 * @param k - Conservative factor (default 3)
 * @returns Conservative rating rounded to nearest integer
 *
 * @example
 * // New player with high uncertainty
 * conservativeRating(30, 10) // = 30 - 3*10 = 0
 *
 * // Experienced player with low uncertainty
 * conservativeRating(27, 2) // = 27 - 3*2 = 21
 */
export function conservativeRating(
  mu: number,
  sigma: number,
  k: number = CONSERVATIVE_FACTOR,
): number {
  return Math.round(mu - k * sigma);
}

/**
 * Format rating as string with uncertainty range
 *
 * @param mu - Skill estimate
 * @param sigma - Uncertainty about skill
 * @returns Formatted string like "24 (±5)"
 *
 * @example
 * formatRating(27.5, 2.3) // "25 (±5)"
 */
export function formatRating(mu: number, sigma: number): string {
  const conservative = conservativeRating(mu, sigma);
  const uncertainty = Math.round(2 * sigma); // ±2σ covers ~95% confidence interval
  return `${conservative} (±${uncertainty})`;
}

/**
 * Add computed display ratings to a player object
 *
 * Adds displayRating, defenseRating, attackRating, soloRating fields
 * based on conservative rating calculation (μ - 3σ)
 *
 * @param player - Player object with mu/sigma fields
 * @returns Player object with added display rating fields
 */
export function addDisplayRatings<
  T extends {
    generalMu: number;
    generalSigma: number;
    defenseMu: number;
    defenseSigma: number;
    attackMu: number;
    attackSigma: number;
    soloMu: number;
    soloSigma: number;
  },
>(player: T) {
  return {
    ...player,
    displayRating: conservativeRating(player.generalMu, player.generalSigma),
    defenseRating: conservativeRating(player.defenseMu, player.defenseSigma),
    attackRating: conservativeRating(player.attackMu, player.attackSigma),
    soloRating: conservativeRating(player.soloMu, player.soloSigma),
  };
}

/**
 * Get ordinal rating (μ value) for sorting when σ is not relevant
 *
 * @param mu - Skill estimate
 * @returns Rounded mu value
 */
export function ordinalRating(mu: number): number {
  return Math.round(mu);
}
