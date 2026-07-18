import type { AnalyticsSummary, AuthConfig, ThemeRecord, ArtifactRecord, ThemeShape, VoiceShape } from "./types";

/** The analytics summary, or the string "unauthorized" when no admin session is present. */
export async function fetchAnalytics(): Promise<AnalyticsSummary | "unauthorized"> {
  const res = await fetch("/admin/analytics", { credentials: "same-origin" });
  if (res.status === 401) return "unauthorized";
  if (!res.ok) throw new Error(`analytics request failed (${res.status})`);
  return (await res.json()) as AnalyticsSummary;
}

/** Public login config: whether Turnstile is enabled, and its sitekey. */
export async function fetchAuthConfig(): Promise<AuthConfig> {
  const res = await fetch("/auth/config", { credentials: "same-origin" });
  if (!res.ok) return { turnstileSitekey: null, brand: null };
  return (await res.json()) as AuthConfig;
}

/** Ask the portal to email a sign-in link. Always neutral, so this resolves regardless. */
export async function requestLink(email: string, turnstileToken?: string): Promise<void> {
  await fetch("/auth/request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ email, turnstileToken }),
  });
}

/** The CSV export URL, served with the same admin-session gate. */
export const eventsCsvUrl = "/admin/events.csv";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`request failed (${res.status})`);
  return (await res.json()) as T;
}

export async function listThemes(): Promise<ThemeRecord[]> {
  return (await json<{ themes: ThemeRecord[] }>(await fetch("/admin/themes", { credentials: "same-origin" }))).themes;
}

export async function saveTheme(input: { id?: string; name: string; theme: ThemeShape }): Promise<ThemeRecord> {
  return json<ThemeRecord>(
    await fetch("/admin/themes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(input),
    }),
  );
}

export async function deleteTheme(id: string): Promise<void> {
  await fetch(`/admin/themes/${encodeURIComponent(id)}`, { method: "DELETE", credentials: "same-origin" });
}

/**
 * Every deck, across every client, with the list of clients that have one (D23).
 *
 * No workspace is sent on purpose: the owner works across all of their clients, and the
 * console is theirs. Asking for one client would be the bug this route used to have, where it
 * defaulted to "default" and showed an empty list while real decks sat in the database.
 */
export async function listArtifacts(): Promise<{ artifacts: ArtifactRecord[]; workspaces: string[] }> {
  const res = await json<{ artifacts: ArtifactRecord[]; workspaces?: string[] }>(
    await fetch("/admin/artifacts", { credentials: "same-origin" }),
  );
  return { artifacts: res.artifacts, workspaces: res.workspaces ?? [] };
}

export async function assignTheme(artifactId: string, themeId: string | null): Promise<void> {
  await fetch(`/admin/artifacts/${encodeURIComponent(artifactId)}/theme`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ themeId }),
  });
}

export async function getVoice(): Promise<VoiceShape | null> {
  return (await json<{ voice: VoiceShape | null }>(await fetch("/admin/voice", { credentials: "same-origin" }))).voice;
}

export async function saveVoice(voice: VoiceShape): Promise<void> {
  const res = await fetch("/admin/voice", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(voice),
  });
  if (!res.ok) throw new Error(`save failed (${res.status})`);
}
