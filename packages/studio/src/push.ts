async function postJson(url: string, token: string, body: unknown, fetchImpl: typeof fetch): Promise<unknown> {
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`request to ${url} failed: ${res.status}`);
  return res.json();
}

export interface PushResult {
  artifactId: string;
  versionId: string;
  version: number;
}

/** Publish an IR artifact to a portal's admin ingest endpoint. */
export async function pushArtifact(
  portalUrl: string,
  token: string,
  ir: unknown,
  opts: { theme?: unknown; fetch?: typeof fetch } = {},
): Promise<PushResult> {
  const base = portalUrl.replace(/\/$/, "");
  const body = opts.theme === undefined ? { artifact: ir } : { artifact: ir, theme: opts.theme };
  return (await postJson(`${base}/admin/publish`, token, body, opts.fetch ?? fetch)) as PushResult;
}

/** Create a per-recipient share link for a published artifact. */
export async function createShareLink(
  portalUrl: string,
  token: string,
  input: { slug: string; recipient: string; workspace?: string; version?: number },
  fetchImpl: typeof fetch = fetch,
): Promise<{ shareId: string; url: string }> {
  const base = portalUrl.replace(/\/$/, "");
  return (await postJson(`${base}/admin/shares`, token, input, fetchImpl)) as { shareId: string; url: string };
}

/**
 * Fetch the workspace voice from a portal, or null if none is set there.
 *
 * The voice belongs to the portal, because that is where the console writes it and where an
 * operator expects their settings to live. Before this the Voice tab wrote to a row nothing
 * read: editing your tone in the console changed nothing, and generation used a voice.json on
 * whatever machine happened to run the CLI. Two sources of truth, one of them decorative.
 *
 * Returns null rather than throwing when the portal has no voice, so a caller can fall back.
 */
export async function fetchVoice(
  portalUrl: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown | null> {
  const base = portalUrl.replace(/\/$/, "");
  const res = await fetchImpl(`${base}/admin/voice`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`could not read the voice from ${base}: ${res.status}`);
  const body = (await res.json()) as { voice?: unknown };
  return body.voice ?? null;
}

/**
 * Publish an IR and, if a recipient is given, share it with them.
 *
 * The slug AND the workspace both come from the IR being published. That is the whole point
 * of this function existing rather than the CLI wiring the two calls together inline: publish
 * stores the artifact under the IR's own workspace, so the share must be looked up under the
 * same one. Passing only the slug looks in workspace "default" and finds nothing unless the
 * IR happened to use that exact word.
 */
export async function publishAndShare(
  portalUrl: string,
  token: string,
  ir: unknown,
  opts: { theme?: unknown; recipient?: string; fetch?: typeof fetch } = {},
): Promise<{ published: PushResult; share?: { shareId: string; url: string } }> {
  const fetchImpl = opts.fetch ?? fetch;
  const published = await pushArtifact(portalUrl, token, ir, { theme: opts.theme, fetch: fetchImpl });
  if (!opts.recipient) return { published };

  // A pack has no slug of its own; its id is its slug (matches extractArtifactMeta on the
  // portal). Every other artifact carries a slug.
  const { slug, id, workspace } = (ir ?? {}) as { slug?: string; id?: string; workspace?: string };
  const share = await createShareLink(
    portalUrl,
    token,
    { slug: slug ?? id ?? "", recipient: opts.recipient, workspace },
    fetchImpl,
  );
  return { published, share };
}
