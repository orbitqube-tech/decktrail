import { pgTable, text, bigint, boolean, jsonb, integer, timestamp } from "drizzle-orm/pg-core";

/** Magic-link tokens, stored only as their SHA-256 hash, single use, short TTL. */
export const magicLinks = pgTable("magic_links", {
  tokenHash: text("token_hash").primaryKey(),
  email: text("email").notNull(),
  workspace: text("workspace").notNull(),
  expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
});

/** Server-side sessions, so revoking an invite can kill a live session. */
export const sessions = pgTable("sessions", {
  sid: text("sid").primaryKey(),
  email: text("email").notNull(),
  workspace: text("workspace").notNull(),
  expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
  revoked: boolean("revoked").notNull().default(false),
});

/** Who may view a given workspace's decks. */
export const invites = pgTable("invites", {
  id: text("id").primaryKey(),
  workspace: text("workspace").notNull(),
  email: text("email").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** An artifact within a workspace (slide deck, document, hub, or tool). */
export const artifacts = pgTable("artifacts", {
  id: text("id").primaryKey(),
  workspace: text("workspace").notNull(),
  slug: text("slug").notNull(),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  /** Optional theme assigned from the console; applied at serve time over the version theme. */
  themeId: text("theme_id"),
});

/** Reusable brand themes managed from the console (the IR Theme shape, logo as a data URI). */
export const themes = pgTable("themes", {
  id: text("id").primaryKey(),
  workspace: text("workspace").notNull(),
  name: text("name").notNull(),
  theme: jsonb("theme").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** Immutable, append-only artifact versions (D10). The IR snapshot is the source of truth. */
export const deckVersions = pgTable("deck_versions", {
  id: text("id").primaryKey(),
  artifactId: text("artifact_id").notNull(),
  version: integer("version").notNull(),
  parentVersion: integer("parent_version"),
  ir: jsonb("ir").notNull(),
  theme: jsonb("theme"),
  author: text("author").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  source: text("source").notNull(),
  changelog: text("changelog"),
});

/** A per-recipient share link pinned to a specific version (D13). */
export const shares = pgTable("shares", {
  shareId: text("share_id").primaryKey(),
  artifactId: text("artifact_id").notNull(),
  versionId: text("version_id").notNull(),
  recipient: text("recipient").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  revokedAt: timestamp("revoked_at"),
});

/** The audit and analytics event log, stamped with the version the viewer saw (D10). */
export const events = pgTable("events", {
  id: text("id").primaryKey(),
  ts: timestamp("ts").notNull().defaultNow(),
  workspace: text("workspace").notNull(),
  artifactId: text("artifact_id"),
  versionId: text("version_id"),
  recipient: text("recipient"),
  type: text("type").notNull(),
  ip: text("ip"),
  ua: text("ua"),
  meta: jsonb("meta"),
});

/** First-run setup state and generated boot secrets. One authoritative home. */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
