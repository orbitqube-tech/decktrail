CREATE TABLE "themes" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace" text NOT NULL,
	"name" text NOT NULL,
	"theme" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN "theme_id" text;