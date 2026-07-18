CREATE TABLE "artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace" text NOT NULL,
	"slug" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deck_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"artifact_id" text NOT NULL,
	"version" integer NOT NULL,
	"parent_version" integer,
	"ir" jsonb NOT NULL,
	"author" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"source" text NOT NULL,
	"changelog" text
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"ts" timestamp DEFAULT now() NOT NULL,
	"workspace" text NOT NULL,
	"artifact_id" text,
	"version_id" text,
	"recipient" text,
	"type" text NOT NULL,
	"ip" text,
	"ua" text,
	"meta" jsonb
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "magic_links" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"workspace" text NOT NULL,
	"expires_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"workspace" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shares" (
	"share_id" text PRIMARY KEY NOT NULL,
	"artifact_id" text NOT NULL,
	"version_id" text NOT NULL,
	"recipient" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp
);
