export enum PlayerPosition {
  DEFENSE = "defense",
  ATTACK = "attack",
  SOLO = "solo",
  MIXED = "mixed",
}

export type PlayerPositionType = PlayerPosition;

/**
 * Get the symbol/icon for a position
 */
export function getPositionSymbol(position: PlayerPositionType): string {
  switch (position) {
    case PlayerPosition.SOLO:
      return "⚔️";
    case PlayerPosition.DEFENSE:
      return "D";
    case PlayerPosition.ATTACK:
      return "A";
    case PlayerPosition.MIXED:
      return "🔀";
    default:
      return "";
  }
}

/**
 * Get the display label for a position
 */
export function getPositionDisplayLabel(position: PlayerPositionType): string {
  switch (position) {
    case PlayerPosition.SOLO:
      return "Solo";
    case PlayerPosition.DEFENSE:
      return "Defense";
    case PlayerPosition.ATTACK:
      return "Attack";
    case PlayerPosition.MIXED:
      return "Mixed";
    default:
      return "";
  }
}

/**
 * Sort team players for display: Attack first, then Defense, then alphabetical if both Mixed
 */
export function sortTeamPlayers<
  T extends {
    id: string;
    displayName: string;
    position?: PlayerPositionType;
  },
>(player1: T, player2: T | null): [T, T | null] {
  if (!player2) {
    return [player1, null];
  }

  const pos1 = player1.position;
  const pos2 = player2.position;

  // If both are MIXED, sort alphabetically by displayName
  if (pos1 === PlayerPosition.MIXED && pos2 === PlayerPosition.MIXED) {
    return player1.displayName.localeCompare(player2.displayName) <= 0
      ? [player1, player2]
      : [player2, player1];
  }

  // Attack position first
  if (pos1 === PlayerPosition.ATTACK && pos2 !== PlayerPosition.ATTACK) {
    return [player1, player2];
  }
  if (pos2 === PlayerPosition.ATTACK && pos1 !== PlayerPosition.ATTACK) {
    return [player2, player1];
  }

  // Defense position second
  if (pos1 === PlayerPosition.DEFENSE && pos2 !== PlayerPosition.DEFENSE) {
    return [player1, player2];
  }
  if (pos2 === PlayerPosition.DEFENSE && pos1 !== PlayerPosition.DEFENSE) {
    return [player2, player1];
  }

  // Default: keep original order
  return [player1, player2];
}
