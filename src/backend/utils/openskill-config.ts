/**
 * OpenSkill Rating System Configuration
 *
 * Based on recommendations from OpenSkill documentation and tuned for
 * a small foosball player pool (~8 players, 1-2 matches per player per day).
 *
 * Key parameters:
 * - mu (μ): Skill estimate, starts at 25
 * - sigma (σ): Uncertainty about skill, starts at 8.333 (μ/3)
 * - beta (β): Performance variance within a game, set to σ/2
 * - tau (τ): Dynamics factor for skill drift over time
 */

export const OPENSKILL_CONFIG = {
  /**
   * Initial skill mean (μ₀)
   * Default: 25
   * All players start here
   */
  mu: 25,

  /**
   * Initial uncertainty (σ₀)
   * Default: 8.333 (μ/3)
   * Higher values = faster learning, more volatile early ratings
   * Lower values = slower convergence, more stable early ratings
   *
   * Set relatively high for fast differentiation in small pool
   */
  sigma: 8.333,

  /**
   * Performance variance (β)
   * Default: 4.167 (σ/2)
   * Models randomness within a game
   */
  beta: 4.167,

  /**
   * Dynamics factor (τ)
   * Default: 0.083 (σ/100)
   * Small increase to σ after each game to model skill drift
   * Allows for player improvement over time
   */
  tau: 0.083,

  /**
   * Numerical stability constant
   * Default: 0.0001
   * Prevents division by zero in edge cases
   */
  kappa: 0.0001,
};

/**
 * Weighting for effective skill calculation
 *
 * Effective skill combines general and role-specific ratings:
 * μ_effective = GENERAL_WEIGHT * μ_general + ROLE_WEIGHT * μ_role
 *
 * 60/40 split means general skill dominates but roles still matter
 */
export const GENERAL_WEIGHT = 0.6;
export const ROLE_WEIGHT = 0.4;

/**
 * Algorithm version for history tracking
 * Version 1 = ELO system
 * Version 2 = OpenSkill system
 */
export const ALGORITHM_VERSION = 2;

/**
 * Conservative ranking factor
 * Display rating = μ - CONSERVATIVE_FACTOR * σ
 *
 * Higher k = more conservative (new players rank lower)
 * Lower k = less conservative (new players rank higher)
 *
 * k=3 is standard for TrueSkill-style systems
 */
export const CONSERVATIVE_FACTOR = 3;
