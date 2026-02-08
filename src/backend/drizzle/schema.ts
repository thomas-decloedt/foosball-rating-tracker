import { createId } from "@paralleldrive/cuid2";
import {
  boolean,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { PlayerPosition } from "@/api-models/position";
export const MatchTeamSize = ["1v1", "1v2", "2v2"] as const;
export type MatchTeamSizeType = (typeof MatchTeamSize)[number];
export const matchTeamSize = pgEnum("match_team_size", MatchTeamSize);

export const MemeType = ["gif", "image"] as const;
export type MemeTypeType = (typeof MemeType)[number];
export const memeType = pgEnum("meme_type", MemeType);

export { PlayerPosition, type PlayerPositionType } from "@/api-models/position";
const PlayerPositionValues = ["defense", "attack", "solo", "mixed"] as const;
export const playerPosition = pgEnum("player_position", PlayerPositionValues);

export const user = pgTable(
  "user",
  {
    id: text()
      .$defaultFn(() => createId())
      .primaryKey()
      .notNull(),
    email: text().notNull(),
    passwordHash: text("password_hash"),
    name: text().notNull(),
    isAdmin: boolean("is_admin").default(false).notNull(),
    profileImage: text("profile_image"),
    createdAt: timestamp("created_at", { precision: 3, mode: "date" })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { precision: 3, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex().using("btree", table.email.asc().nullsLast()),
    index().on(table.createdAt),
  ],
);

export const player = pgTable(
  "player",
  {
    id: text()
      .$defaultFn(() => createId())
      .primaryKey()
      .notNull(),
    userId: text("user_id").notNull(),
    displayName: text("display_name").notNull(),
    generalMu: doublePrecision("general_mu").default(25).notNull(),
    generalSigma: doublePrecision("general_sigma").default(8.333).notNull(),
    defenseMu: doublePrecision("defense_mu").default(25).notNull(),
    defenseSigma: doublePrecision("defense_sigma").default(8.333).notNull(),
    attackMu: doublePrecision("attack_mu").default(25).notNull(),
    attackSigma: doublePrecision("attack_sigma").default(8.333).notNull(),
    soloMu: doublePrecision("solo_mu").default(25).notNull(),
    soloSigma: doublePrecision("solo_sigma").default(8.333).notNull(),
    gamesPlayed: integer("games_played").default(0).notNull(),
    defenseGames: integer("defense_games").default(0).notNull(),
    attackGames: integer("attack_games").default(0).notNull(),
    wins: integer().default(0).notNull(),
    losses: integer().default(0).notNull(),
    winStreak: integer("win_streak").default(0).notNull(),
    bestWinStreak: integer("best_win_streak").default(0).notNull(),
    humiliatingDefeats: integer("humiliating_defeats").default(0).notNull(),
    createdAt: timestamp("created_at", { precision: 3, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [user.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    index().on(table.userId),
    // Indexes on conservative ratings (μ - 3σ) for leaderboard sorting
    index("player_general_conservative_idx").on(
      table.generalMu.getSQL(),
      table.generalSigma.getSQL(),
    ),
    index("player_defense_conservative_idx").on(
      table.defenseMu.getSQL(),
      table.defenseSigma.getSQL(),
    ),
    index("player_attack_conservative_idx").on(
      table.attackMu.getSQL(),
      table.attackSigma.getSQL(),
    ),
    index("player_solo_conservative_idx").on(
      table.soloMu.getSQL(),
      table.soloSigma.getSQL(),
    ),
    index().on(table.gamesPlayed),
  ],
);

export const match = pgTable(
  "match",
  {
    id: text()
      .$defaultFn(() => createId())
      .primaryKey()
      .notNull(),
    team1Player1Id: text("team1_player1_id").notNull(),
    team1Player1Position: playerPosition("team1_player1_position")
      .default(PlayerPosition.SOLO)
      .notNull(),
    team1Player2Id: text("team1_player2_id"),
    team1Player2Position: playerPosition("team1_player2_position"),
    team2Player1Id: text("team2_player1_id").notNull(),
    team2Player1Position: playerPosition("team2_player1_position")
      .default(PlayerPosition.SOLO)
      .notNull(),
    team2Player2Id: text("team2_player2_id"),
    team2Player2Position: playerPosition("team2_player2_position"),
    team1Score: integer("team1_score").notNull(),
    team2Score: integer("team2_score").notNull(),
    matchType: matchTeamSize("match_type").notNull(),
    winningTeam: integer("winning_team").notNull(),
    tableId: text("table_id"),
    seasonId: text("season_id"),
    recordedById: text("recorded_by_id").notNull(),
    isFriendly: boolean("is_friendly").default(false).notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    deletedAt: timestamp("deleted_at", { precision: 3, mode: "date" }),
    deletedById: text("deleted_by_id"),
    createdAt: timestamp("created_at", { precision: 3, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.team1Player1Id],
      foreignColumns: [player.id],
    })
      .onUpdate("cascade")
      .onDelete("restrict"),
    foreignKey({
      columns: [table.team1Player2Id],
      foreignColumns: [player.id],
    })
      .onUpdate("cascade")
      .onDelete("restrict"),
    foreignKey({
      columns: [table.team2Player1Id],
      foreignColumns: [player.id],
    })
      .onUpdate("cascade")
      .onDelete("restrict"),
    foreignKey({
      columns: [table.team2Player2Id],
      foreignColumns: [player.id],
    })
      .onUpdate("cascade")
      .onDelete("restrict"),
    foreignKey({
      columns: [table.recordedById],
      foreignColumns: [user.id],
    })
      .onUpdate("cascade")
      .onDelete("restrict"),
    foreignKey({
      columns: [table.deletedById],
      foreignColumns: [user.id],
    })
      .onUpdate("cascade")
      .onDelete("set null"),
    foreignKey({
      columns: [table.seasonId],
      foreignColumns: [season.id],
    })
      .onUpdate("cascade")
      .onDelete("set null"),
    foreignKey({
      columns: [table.tableId],
      foreignColumns: [foosballTable.id],
    })
      .onUpdate("cascade")
      .onDelete("set null"),
    index().on(table.createdAt),
    index().on(table.team1Player1Id),
    index().on(table.team1Player2Id),
    index().on(table.team2Player1Id),
    index().on(table.team2Player2Id),
    index().on(table.seasonId),
    index().on(table.tableId),
    index().on(table.isDeleted),
  ],
);

export const ratingHistory = pgTable(
  "rating_history",
  {
    id: text()
      .$defaultFn(() => createId())
      .primaryKey()
      .notNull(),
    playerId: text("player_id").notNull(),
    matchId: text("match_id").notNull(),
    muBefore: doublePrecision("mu_before").notNull(),
    sigmaBefore: doublePrecision("sigma_before").notNull(),
    muAfter: doublePrecision("mu_after").notNull(),
    sigmaAfter: doublePrecision("sigma_after").notNull(),
    muChange: doublePrecision("mu_change").notNull(),
    algorithmVersion: integer("algorithm_version").default(2).notNull(),
    position: playerPosition("position").default(PlayerPosition.SOLO).notNull(),
    createdAt: timestamp("created_at", { precision: 3, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.playerId],
      foreignColumns: [player.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    foreignKey({
      columns: [table.matchId],
      foreignColumns: [match.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    index().on(table.playerId),
    index().on(table.matchId),
    index().on(table.position),
    index().on(table.createdAt),
  ],
);

export const comment = pgTable(
  "comment",
  {
    id: text()
      .$defaultFn(() => createId())
      .primaryKey()
      .notNull(),
    matchId: text("match_id").notNull(),
    userId: text("user_id").notNull(),
    content: text().notNull(),
    createdAt: timestamp("created_at", { precision: 3, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: "date" })
      .defaultNow()
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    deletedAt: timestamp("deleted_at", { precision: 3, mode: "date" }),
    deletedById: text("deleted_by_id"),
  },
  (table) => [
    foreignKey({
      columns: [table.matchId],
      foreignColumns: [match.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [user.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    foreignKey({
      columns: [table.deletedById],
      foreignColumns: [user.id],
    })
      .onUpdate("cascade")
      .onDelete("set null"),
    index().on(table.matchId),
    index().on(table.createdAt),
    index().on(table.isDeleted),
  ],
);

export const season = pgTable(
  "season",
  {
    id: text()
      .$defaultFn(() => createId())
      .primaryKey()
      .notNull(),
    name: text().notNull(),
    startDate: timestamp("start_date", {
      precision: 3,
      mode: "date",
    }).notNull(),
    endDate: timestamp("end_date", { precision: 3, mode: "date" }),
    isActive: boolean("is_active").default(false).notNull(),
    createdAt: timestamp("created_at", { precision: 3, mode: "date" })
      .defaultNow()
      .notNull(),
    createdById: text("created_by_id").notNull(),
    winnerId: text("winner_id"),
    winnerMvpScore: doublePrecision("winner_mvp_score"),
    scoringConfigSnapshot: jsonb("scoring_config_snapshot"),
    previousWinnerId: text("previous_winner_id"),
    icon: text("icon"),
  },
  (table) => [
    foreignKey({
      columns: [table.createdById],
      foreignColumns: [user.id],
    })
      .onUpdate("cascade")
      .onDelete("restrict"),
    foreignKey({
      columns: [table.winnerId],
      foreignColumns: [player.id],
    })
      .onUpdate("cascade")
      .onDelete("set null"),
    foreignKey({
      columns: [table.previousWinnerId],
      foreignColumns: [player.id],
    })
      .onUpdate("cascade")
      .onDelete("set null"),
    index().on(table.isActive),
    index().on(table.startDate),
  ],
);

export const playerSeasonStats = pgTable(
  "player_season_stats",
  {
    id: text()
      .$defaultFn(() => createId())
      .primaryKey()
      .notNull(),
    playerId: text("player_id").notNull(),
    seasonId: text("season_id").notNull(),
    gamesPlayed: integer("games_played").default(0).notNull(),
    wins: integer().default(0).notNull(),
    losses: integer().default(0).notNull(),
    winStreak: integer("win_streak").default(0).notNull(),
    bestWinStreak: integer("best_win_streak").default(0).notNull(),
    humiliatingDefeats: integer("humiliating_defeats").default(0).notNull(),
    startMu: doublePrecision("start_mu").notNull(),
    startSigma: doublePrecision("start_sigma").notNull(),
    currentMu: doublePrecision("current_mu").notNull(),
    currentSigma: doublePrecision("current_sigma").notNull(),
    muDelta: doublePrecision("mu_delta").default(0).notNull(),
    createdAt: timestamp("created_at", { precision: 3, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.playerId],
      foreignColumns: [player.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    foreignKey({
      columns: [table.seasonId],
      foreignColumns: [season.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    uniqueIndex().on(table.playerId, table.seasonId),
    index().on(table.seasonId),
    index().on(table.playerId),
  ],
);

export const meme = pgTable(
  "meme",
  {
    id: text()
      .$defaultFn(() => createId())
      .primaryKey()
      .notNull(),
    type: memeType("type").notNull(),
    url: text().notNull(),
    uploadedById: text("uploaded_by_id").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { precision: 3, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.uploadedById],
      foreignColumns: [user.id],
    })
      .onUpdate("cascade")
      .onDelete("restrict"),
    index().on(table.isActive),
    index().on(table.createdAt),
  ],
);

export const InvitationStatus = ["pending", "accepted", "expired"] as const;
export type InvitationStatusType = (typeof InvitationStatus)[number];
export const invitationStatus = pgEnum("invitation_status", InvitationStatus);

export const userInvitation = pgTable(
  "user_invitation",
  {
    id: text()
      .$defaultFn(() => createId())
      .primaryKey()
      .notNull(),
    email: text().notNull(),
    token: text().notNull(),
    status: invitationStatus("status").default("pending").notNull(),
    invitedById: text("invited_by_id").notNull(),
    acceptedAt: timestamp("accepted_at", { precision: 3, mode: "date" }),
    expiresAt: timestamp("expires_at", {
      precision: 3,
      mode: "date",
    }).notNull(),
    createdAt: timestamp("created_at", { precision: 3, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.invitedById],
      foreignColumns: [user.id],
    })
      .onUpdate("cascade")
      .onDelete("restrict"),
    uniqueIndex().on(table.token),
    index().on(table.email),
    index().on(table.status),
    index().on(table.expiresAt),
  ],
);

export const foosballTable = pgTable(
  "foosball_table",
  {
    id: text()
      .$defaultFn(() => createId())
      .primaryKey()
      .notNull(),
    brand: text().notNull(),
    model: text().notNull(),
    notes: text(),
    createdAt: timestamp("created_at", { precision: 3, mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { precision: 3, mode: "date" })
      .defaultNow()
      .notNull(),
    createdById: text("created_by_id").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.createdById],
      foreignColumns: [user.id],
    })
      .onUpdate("cascade")
      .onDelete("restrict"),
    index().on(table.createdAt),
  ],
);

export const scoringConfig = pgTable(
  "scoring_config",
  {
    id: text()
      .$defaultFn(() => createId())
      .primaryKey()
      .notNull(),
    name: text().notNull(),
    description: text(),
    config: jsonb().notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { precision: 3, mode: "date" })
      .defaultNow()
      .notNull(),
    createdById: text("created_by_id").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.createdById],
      foreignColumns: [user.id],
    })
      .onUpdate("cascade")
      .onDelete("restrict"),
    index().on(table.isActive),
    index().on(table.createdAt),
  ],
);

export const weeklyStats = pgTable(
  "weekly_stats",
  {
    id: text()
      .$defaultFn(() => createId())
      .primaryKey()
      .notNull(),
    weekStartDate: timestamp("week_start_date", {
      precision: 3,
      mode: "date",
    }).notNull(),
    seasonId: text("season_id"),
    avgGamesPerPlayer: doublePrecision("avg_games_per_player").notNull(),
    maxGames: integer("max_games").notNull(),
    createdAt: timestamp("created_at", { precision: 3, mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.seasonId],
      foreignColumns: [season.id],
    })
      .onUpdate("cascade")
      .onDelete("set null"),
    index().on(table.weekStartDate),
    index().on(table.seasonId),
  ],
);
