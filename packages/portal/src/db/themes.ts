import { eq } from "drizzle-orm";
import type { Db } from "./client.js";
import { themes, artifacts } from "./schema.js";
import { randomToken } from "../crypto.js";
import type { ThemeAdmin, ThemeRecord, ArtifactRecord } from "../themes.js";

/**
 * Postgres-backed theme admin.
 *
 * Reads take an optional workspace and span every client when it is omitted (D23). Writes are
 * keyed on the row's own id rather than on a workspace the caller supplied: an id is already
 * unique, so adding a guessed workspace to the predicate can only ever hide a row that exists,
 * which silently turned an assign or a delete into a no-op.
 */
export class DrizzleThemeAdmin implements ThemeAdmin {
  constructor(private readonly db: Db) {}

  async listThemes(workspace?: string): Promise<ThemeRecord[]> {
    const base = this.db.select().from(themes);
    const rows = await (workspace === undefined ? base : base.where(eq(themes.workspace, workspace)));
    return rows.map((r) => ({ id: r.id, name: r.name, theme: r.theme }));
  }

  async saveTheme(workspace: string, input: { id?: string; name: string; theme: unknown }): Promise<ThemeRecord> {
    if (input.id) {
      await this.db.update(themes).set({ name: input.name, theme: input.theme }).where(eq(themes.id, input.id));
      return { id: input.id, name: input.name, theme: input.theme };
    }
    const id = `thm_${randomToken(9)}`;
    await this.db.insert(themes).values({ id, workspace, name: input.name, theme: input.theme });
    return { id, name: input.name, theme: input.theme };
  }

  async deleteTheme(id: string): Promise<void> {
    await this.db.update(artifacts).set({ themeId: null }).where(eq(artifacts.themeId, id));
    await this.db.delete(themes).where(eq(themes.id, id));
  }

  async listArtifacts(workspace?: string): Promise<ArtifactRecord[]> {
    const base = this.db.select().from(artifacts);
    const rows = await (workspace === undefined ? base : base.where(eq(artifacts.workspace, workspace)));
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      kind: r.kind,
      themeId: r.themeId ?? null,
      workspace: r.workspace,
    }));
  }

  async assignTheme(artifactId: string, themeId: string | null): Promise<void> {
    await this.db.update(artifacts).set({ themeId }).where(eq(artifacts.id, artifactId));
  }

  async listWorkspaces(): Promise<string[]> {
    const rows = await this.db.selectDistinct({ workspace: artifacts.workspace }).from(artifacts);
    return rows.map((r) => r.workspace).sort();
  }
}
