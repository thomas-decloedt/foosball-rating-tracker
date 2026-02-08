CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'expired');--> statement-breakpoint
CREATE TYPE "public"."match_team_size" AS ENUM('1v1', '1v2', '2v2');--> statement-breakpoint
CREATE TYPE "public"."meme_type" AS ENUM('gif', 'image');--> statement-breakpoint
CREATE TYPE "public"."player_position" AS ENUM('defense', 'attack', 'solo', 'mixed');--> statement-breakpoint
CREATE TABLE "comment" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"user_id" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp (3),
	"deleted_by_id" text
);
--> statement-breakpoint
CREATE TABLE "foosball_table" (
	"id" text PRIMARY KEY NOT NULL,
	"brand" text NOT NULL,
	"model" text NOT NULL,
	"notes" text,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL,
	"created_by_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match" (
	"id" text PRIMARY KEY NOT NULL,
	"team1_player1_id" text NOT NULL,
	"team1_player1_position" "player_position" DEFAULT 'solo' NOT NULL,
	"team1_player2_id" text,
	"team1_player2_position" "player_position",
	"team2_player1_id" text NOT NULL,
	"team2_player1_position" "player_position" DEFAULT 'solo' NOT NULL,
	"team2_player2_id" text,
	"team2_player2_position" "player_position",
	"team1_score" integer NOT NULL,
	"team2_score" integer NOT NULL,
	"match_type" "match_team_size" NOT NULL,
	"winning_team" integer NOT NULL,
	"table_id" text,
	"season_id" text,
	"recorded_by_id" text NOT NULL,
	"is_friendly" boolean DEFAULT false NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp (3),
	"deleted_by_id" text,
	"created_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meme" (
	"id" text PRIMARY KEY NOT NULL,
	"type" "meme_type" NOT NULL,
	"url" text NOT NULL,
	"uploaded_by_id" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"display_name" text NOT NULL,
	"general_mu" double precision DEFAULT 25 NOT NULL,
	"general_sigma" double precision DEFAULT 8.333 NOT NULL,
	"defense_mu" double precision DEFAULT 25 NOT NULL,
	"defense_sigma" double precision DEFAULT 8.333 NOT NULL,
	"attack_mu" double precision DEFAULT 25 NOT NULL,
	"attack_sigma" double precision DEFAULT 8.333 NOT NULL,
	"solo_mu" double precision DEFAULT 25 NOT NULL,
	"solo_sigma" double precision DEFAULT 8.333 NOT NULL,
	"games_played" integer DEFAULT 0 NOT NULL,
	"defense_games" integer DEFAULT 0 NOT NULL,
	"attack_games" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"win_streak" integer DEFAULT 0 NOT NULL,
	"best_win_streak" integer DEFAULT 0 NOT NULL,
	"humiliating_defeats" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_season_stats" (
	"id" text PRIMARY KEY NOT NULL,
	"player_id" text NOT NULL,
	"season_id" text NOT NULL,
	"games_played" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"win_streak" integer DEFAULT 0 NOT NULL,
	"best_win_streak" integer DEFAULT 0 NOT NULL,
	"humiliating_defeats" integer DEFAULT 0 NOT NULL,
	"start_mu" double precision NOT NULL,
	"start_sigma" double precision NOT NULL,
	"current_mu" double precision NOT NULL,
	"current_sigma" double precision NOT NULL,
	"mu_delta" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rating_history" (
	"id" text PRIMARY KEY NOT NULL,
	"player_id" text NOT NULL,
	"match_id" text NOT NULL,
	"mu_before" double precision NOT NULL,
	"sigma_before" double precision NOT NULL,
	"mu_after" double precision NOT NULL,
	"sigma_after" double precision NOT NULL,
	"mu_change" double precision NOT NULL,
	"algorithm_version" integer DEFAULT 2 NOT NULL,
	"position" "player_position" DEFAULT 'solo' NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scoring_config" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"config" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"created_by_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "season" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"start_date" timestamp (3) NOT NULL,
	"end_date" timestamp (3),
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"created_by_id" text NOT NULL,
	"winner_id" text,
	"winner_mvp_score" double precision,
	"scoring_config_snapshot" jsonb,
	"previous_winner_id" text,
	"icon" text
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"name" text NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"profile_image" text,
	"created_at" timestamp (3) DEFAULT now() NOT NULL,
	"last_seen_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"token" text NOT NULL,
	"status" "invitation_status" DEFAULT 'pending' NOT NULL,
	"invited_by_id" text NOT NULL,
	"accepted_at" timestamp (3),
	"expires_at" timestamp (3) NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_stats" (
	"id" text PRIMARY KEY NOT NULL,
	"week_start_date" timestamp (3) NOT NULL,
	"season_id" text,
	"avg_games_per_player" double precision NOT NULL,
	"max_games" integer NOT NULL,
	"created_at" timestamp (3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_match_id_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."match"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_deleted_by_id_user_id_fk" FOREIGN KEY ("deleted_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "foosball_table" ADD CONSTRAINT "foosball_table_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "match" ADD CONSTRAINT "match_team1_player1_id_player_id_fk" FOREIGN KEY ("team1_player1_id") REFERENCES "public"."player"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "match" ADD CONSTRAINT "match_team1_player2_id_player_id_fk" FOREIGN KEY ("team1_player2_id") REFERENCES "public"."player"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "match" ADD CONSTRAINT "match_team2_player1_id_player_id_fk" FOREIGN KEY ("team2_player1_id") REFERENCES "public"."player"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "match" ADD CONSTRAINT "match_team2_player2_id_player_id_fk" FOREIGN KEY ("team2_player2_id") REFERENCES "public"."player"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "match" ADD CONSTRAINT "match_recorded_by_id_user_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "match" ADD CONSTRAINT "match_deleted_by_id_user_id_fk" FOREIGN KEY ("deleted_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "match" ADD CONSTRAINT "match_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "match" ADD CONSTRAINT "match_table_id_foosball_table_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."foosball_table"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "meme" ADD CONSTRAINT "meme_uploaded_by_id_user_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "player" ADD CONSTRAINT "player_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "player_season_stats" ADD CONSTRAINT "player_season_stats_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "player_season_stats" ADD CONSTRAINT "player_season_stats_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "rating_history" ADD CONSTRAINT "rating_history_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "rating_history" ADD CONSTRAINT "rating_history_match_id_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."match"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "scoring_config" ADD CONSTRAINT "scoring_config_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "season" ADD CONSTRAINT "season_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "season" ADD CONSTRAINT "season_winner_id_player_id_fk" FOREIGN KEY ("winner_id") REFERENCES "public"."player"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "season" ADD CONSTRAINT "season_previous_winner_id_player_id_fk" FOREIGN KEY ("previous_winner_id") REFERENCES "public"."player"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "user_invitation" ADD CONSTRAINT "user_invitation_invited_by_id_user_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "weekly_stats" ADD CONSTRAINT "weekly_stats_season_id_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."season"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "comment_match_id_index" ON "comment" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "comment_created_at_index" ON "comment" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "comment_is_deleted_index" ON "comment" USING btree ("is_deleted");--> statement-breakpoint
CREATE INDEX "foosball_table_created_at_index" ON "foosball_table" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "match_created_at_index" ON "match" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "match_team1_player1_id_index" ON "match" USING btree ("team1_player1_id");--> statement-breakpoint
CREATE INDEX "match_team1_player2_id_index" ON "match" USING btree ("team1_player2_id");--> statement-breakpoint
CREATE INDEX "match_team2_player1_id_index" ON "match" USING btree ("team2_player1_id");--> statement-breakpoint
CREATE INDEX "match_team2_player2_id_index" ON "match" USING btree ("team2_player2_id");--> statement-breakpoint
CREATE INDEX "match_season_id_index" ON "match" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "match_table_id_index" ON "match" USING btree ("table_id");--> statement-breakpoint
CREATE INDEX "match_is_deleted_index" ON "match" USING btree ("is_deleted");--> statement-breakpoint
CREATE INDEX "meme_is_active_index" ON "meme" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "meme_created_at_index" ON "meme" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "player_user_id_index" ON "player" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "player_general_conservative_idx" ON "player" USING btree ("general_mu","general_sigma");--> statement-breakpoint
CREATE INDEX "player_defense_conservative_idx" ON "player" USING btree ("defense_mu","defense_sigma");--> statement-breakpoint
CREATE INDEX "player_attack_conservative_idx" ON "player" USING btree ("attack_mu","attack_sigma");--> statement-breakpoint
CREATE INDEX "player_solo_conservative_idx" ON "player" USING btree ("solo_mu","solo_sigma");--> statement-breakpoint
CREATE INDEX "player_games_played_index" ON "player" USING btree ("games_played");--> statement-breakpoint
CREATE UNIQUE INDEX "player_season_stats_player_id_season_id_index" ON "player_season_stats" USING btree ("player_id","season_id");--> statement-breakpoint
CREATE INDEX "player_season_stats_season_id_index" ON "player_season_stats" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "player_season_stats_player_id_index" ON "player_season_stats" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "rating_history_player_id_index" ON "rating_history" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "rating_history_match_id_index" ON "rating_history" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "rating_history_position_index" ON "rating_history" USING btree ("position");--> statement-breakpoint
CREATE INDEX "rating_history_created_at_index" ON "rating_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "scoring_config_is_active_index" ON "scoring_config" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "scoring_config_created_at_index" ON "scoring_config" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "season_is_active_index" ON "season" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "season_start_date_index" ON "season" USING btree ("start_date");--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_index" ON "user" USING btree ("email");--> statement-breakpoint
CREATE INDEX "user_created_at_index" ON "user" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_invitation_token_index" ON "user_invitation" USING btree ("token");--> statement-breakpoint
CREATE INDEX "user_invitation_email_index" ON "user_invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "user_invitation_status_index" ON "user_invitation" USING btree ("status");--> statement-breakpoint
CREATE INDEX "user_invitation_expires_at_index" ON "user_invitation" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "weekly_stats_week_start_date_index" ON "weekly_stats" USING btree ("week_start_date");--> statement-breakpoint
CREATE INDEX "weekly_stats_season_id_index" ON "weekly_stats" USING btree ("season_id");