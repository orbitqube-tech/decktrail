/**
 * Theme management for the console: reusable brand themes and per-artifact assignment
 * (D16). A theme is the IR Theme shape (colours, typography, and a logo carried as a data
 * URI, so a self-hosted install needs no file storage). Injected, so it can be faked in tests.
 */

/** Longest logo data URI accepted, bounding a brand mark stored inline in the DB (~600KB). */
export const MAX_LOGO_CHARS = 800_000;

export interface ThemeRecord {
  id: string;
  name: string;
  theme: unknown;
}

export interface ArtifactRecord {
  id: string;
  title: string;
  slug: string;
  kind: string;
  themeId: string | null;
  /** The client this artifact belongs to (D23). The console groups by it. */
  workspace: string;
}

/**
 * Theme and artifact administration for the owner console.
 *
 * On the workspace argument (D23): a workspace is a client. The portal's owner works across
 * all of their clients, so every read here takes an OPTIONAL workspace, and omitting it means
 * all of them. Defaulting a read to "default" is what made the console's Brand tab show an
 * empty list while real decks sat in the database under their client's name.
 *
 * Writes are different and take the id of the thing being written. An id is unique across the
 * portal, so scoping a write by a workspace the caller guessed can only fail to find a row
 * that exists, which is exactly the bug again.
 */
export interface ThemeAdmin {
  /** Themes, for one client or (omitted) for all of them. */
  listThemes(workspace?: string): Promise<ThemeRecord[]>;
  /** Create (no id) or update (with id) a theme; returns the stored record. */
  saveTheme(workspace: string, input: { id?: string; name: string; theme: unknown }): Promise<ThemeRecord>;
  deleteTheme(id: string): Promise<void>;
  /** Artifacts, for one client or (omitted) for all of them. */
  listArtifacts(workspace?: string): Promise<ArtifactRecord[]>;
  /** Assign a theme to an artifact, or clear it with null. */
  assignTheme(artifactId: string, themeId: string | null): Promise<void>;
  /** Every client that has an artifact, for the console's switcher. */
  listWorkspaces(): Promise<string[]>;
}

/** In-memory theme admin for tests and a store-free build. */
export class InMemoryThemeAdmin implements ThemeAdmin {
  private readonly themesById = new Map<string, ThemeRecord & { workspace: string }>();
  private readonly artifacts = new Map<string, ArtifactRecord & { workspace: string }>();
  private seq = 0;

  /** Test helper: seed an artifact so it can be listed and assigned. */
  seedArtifact(a: ArtifactRecord & { workspace: string }): void {
    this.artifacts.set(a.id, a);
  }

  async listThemes(workspace?: string): Promise<ThemeRecord[]> {
    return [...this.themesById.values()]
      .filter((t) => workspace === undefined || t.workspace === workspace)
      .map(({ id, name, theme }) => ({ id, name, theme }));
  }

  async saveTheme(workspace: string, input: { id?: string; name: string; theme: unknown }): Promise<ThemeRecord> {
    const id = input.id ?? `thm_${++this.seq}`;
    // Preserve the theme's original home on update, rather than moving it to whatever the
    // caller passed. The Drizzle store keys the update on the id alone; this must match, or
    // the fake and the real store disagree and the tests stop meaning anything.
    const workspaceOfRecord = (input.id ? this.themesById.get(input.id)?.workspace : undefined) ?? workspace;
    this.themesById.set(id, { id, workspace: workspaceOfRecord, name: input.name, theme: input.theme });
    return { id, name: input.name, theme: input.theme };
  }

  async deleteTheme(id: string): Promise<void> {
    this.themesById.delete(id);
    for (const a of this.artifacts.values()) if (a.themeId === id) a.themeId = null;
  }

  async listArtifacts(workspace?: string): Promise<ArtifactRecord[]> {
    return [...this.artifacts.values()]
      .filter((a) => workspace === undefined || a.workspace === workspace)
      .map(({ id, title, slug, kind, themeId, workspace: ws }) => ({ id, title, slug, kind, themeId, workspace: ws }));
  }

  async assignTheme(artifactId: string, themeId: string | null): Promise<void> {
    const a = this.artifacts.get(artifactId);
    if (a) a.themeId = themeId;
  }

  async listWorkspaces(): Promise<string[]> {
    return [...new Set([...this.artifacts.values()].map((a) => a.workspace))].sort();
  }
}
