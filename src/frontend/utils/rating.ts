/**
 * Frontend rating calculation and formatting utilities
 *
 * These functions calculate conservative ratings (μ - k*σ) for display,
 * matching the backend logic but allowing decimal precision.
 */

/**
 * Number of decimal places to display for ratings
 */
export const RATING_DECIMAL_PLACES = 2;

/**
 * Conservative factor for rating calculation (matches backend)
 * Display rating = μ - CONSERVATIVE_FACTOR * σ
 *
 * Higher k = more conservative (new players rank lower)
 * Lower k = less conservative (new players rank higher)
 *
 * k=3 is standard for TrueSkill-style systems
 */
export const CONSERVATIVE_FACTOR = 3;

/**
 * Calculate conservative rating for display: μ - k*σ
 *
 * This is the standard TrueSkill/OpenSkill approach for ranking players.
 * It rewards consistency over lucky streaks.
 *
 * @param mu - Skill estimate
 * @param sigma - Uncertainty about skill
 * @param k - Conservative factor (default 3)
 * @returns Conservative rating without rounding
 *
 * @example
 * // New player with high uncertainty
 * calculateConservativeRating(30, 10) // = 30 - 3*10 = 0.00
 *
 * // Experienced player with low uncertainty
 * calculateConservativeRating(27.3, 2.1) // = 27.3 - 3*2.1 = 21.00
 */
export function calculateConservativeRating(
  mu: number,
  sigma: number,
  k: number = CONSERVATIVE_FACTOR,
): number {
  return mu - k * sigma;
}

/**
 * Format rating with specified decimal places
 *
 * @param rating - Rating value to format
 * @param decimals - Number of decimal places (default: RATING_DECIMAL_PLACES)
 * @returns Formatted rating string
 *
 * @example
 * formatRating(24.567) // "24.57"
 * formatRating(24.567, 1) // "24.6"
 */
export function formatRating(
  rating: number,
  decimals: number = RATING_DECIMAL_PLACES,
): string {
  return rating.toFixed(decimals);
}
