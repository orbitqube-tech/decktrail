import { useEffect, useState } from "react";
import { listThemes, saveTheme, deleteTheme, listArtifacts, assignTheme, fetchAuthConfig } from "./api";
import type { ThemeRecord, ArtifactRecord, ThemeShape, ThemeColors, AuthConfig } from "./types";

const COLOR_FIELDS: [keyof ThemeColors, string][] = [
  ["bg", "Background"],
  ["surfaceLow", "Surface low"],
  ["surfaceHigh", "Surface high"],
  ["accent", "Accent"],
  ["accentDim", "Accent dim"],
  ["accent2", "Accent 2"],
  ["accent2Dim", "Accent 2 dim"],
  ["text", "Text"],
  ["heading", "Heading"],
  ["muted", "Muted"],
  ["good", "Good"],
  ["warn", "Warn"],
  ["bad", "Bad"],
];

const BLANK: ThemeShape = {
  name: "",
  colors: {
    bg: "#0e1015", surfaceLow: "#151922", surfaceHigh: "#1e2430",
    accent: "#6ea8fe", accentDim: "#4a86e8", accent2: "#b98cff", accent2Dim: "#9a68e6",
    text: "#c6ccd8", heading: "#f2f5fa", muted: "#8a92a3", good: "#4fd39a", warn: "#ffcf5c", bad: "#ff6b6b",
  },
  typography: { family: "Inter", scale: 1 },
  logo: { src: "" },
};

/** Longest logo data URI accepted (kept in step with the portal's MAX_LOGO_CHARS). */
const MAX_LOGO_CHARS = 800_000;

interface Editing {
  id?: string;
  name: string;
  theme: ThemeShape;
}

export function Brand(): React.ReactElement {
  const [themes, setThemes] = useState<ThemeRecord[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactRecord[]>([]);
  const [workspaces, setWorkspaces] = useState<string[]>([]);
  const [client, setClient] = useState("");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cfg, setCfg] = useState<AuthConfig | null>(null);

  async function refresh(): Promise<void> {
    setThemes(await listThemes());
    const { artifacts: rows, workspaces: clients } = await listArtifacts();
    setArtifacts(rows);
    setWorkspaces(clients);
  }

  const shown = client ? artifacts.filter((a) => a.workspace === client) : artifacts;
  useEffect(() => {
    refresh().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    fetchAuthConfig().then(setCfg);
  }, []);

  function startNew(): void {
    setEditing({ name: "", theme: structuredClone(BLANK) });
  }
  function startEdit(t: ThemeRecord): void {
    setEditing({ id: t.id, name: t.name, theme: structuredClone(t.theme) });
  }

  function setColor(key: keyof ThemeColors, value: string): void {
    setEditing((e) => (e ? { ...e, theme: { ...e.theme, colors: { ...e.theme.colors, [key]: value } } } : e));
  }

  function onLogo(file: File): void {
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result);
      if (src.length > MAX_LOGO_CHARS) {
        setError("That logo is too large. Use an image under about 500KB.");
        return;
      }
      setError(null);
      setEditing((e) => (e ? { ...e, theme: { ...e.theme, logo: { ...e.theme.logo, src } } } : e));
    };
    reader.readAsDataURL(file);
  }

  async function save(): Promise<void> {
    if (!editing) return;
    if (!editing.name.trim()) {
      setError("Give the theme a name.");
      return;
    }
    try {
      await saveTheme({ id: editing.id, name: editing.name.trim(), theme: { ...editing.theme, name: editing.name.trim() } });
      setEditing(null);
      setError(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function remove(id: string): Promise<void> {
    await deleteTheme(id);
    setEditing(null);
    await refresh();
  }

  async function assign(artifactId: string, themeId: string): Promise<void> {
    await assignTheme(artifactId, themeId === "" ? null : themeId);
    await refresh();
  }

  return (
    <main>
      {error && <div className="banner">{error}</div>}

      <section className="panel">
        <div className="eyebrow">Brand</div>
        <div className="brandhead">
          <div>
            <h2>Your themes</h2>
            <p className="cap">Colours, type, and a logo. Assign a theme to any deck below; it applies without republishing.</p>
          </div>
          <button className="btn primary" onClick={startNew}>
            New theme
          </button>
        </div>
        {themes.length ? (
          <div className="themelist">
            {themes.map((t) => (
              <button key={t.id} className="themecard" onClick={() => startEdit(t)}>
                <div className="swatches">
                  {(["accent", "accent2", "heading", "surfaceHigh", "bg"] as (keyof ThemeColors)[]).map((k) => (
                    <span key={k} style={{ background: t.theme.colors[k] }} />
                  ))}
                </div>
                <div className="tname">
                  {t.theme.logo?.src ? <img src={t.theme.logo.src} alt="" /> : null}
                  {t.name}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="empty">No themes yet. Create one to brand your decks.</p>
        )}
      </section>

      {editing && (
        <section className="panel">
          <div className="eyebrow">{editing.id ? "Edit theme" : "New theme"}</div>
          <label className="fld">
            <span>Name</span>
            <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Acme Brand" />
          </label>

          <h3 className="sub">Colours</h3>
          <div className="colorgrid">
            {COLOR_FIELDS.map(([key, label]) => (
              <label key={key} className="color">
                <span>{label}</span>
                <span className="crow">
                  <input type="color" value={editing.theme.colors[key] ?? "#000000"} onChange={(e) => setColor(key, e.target.value)} />
                  <input className="hex" value={editing.theme.colors[key] ?? ""} onChange={(e) => setColor(key, e.target.value)} />
                </span>
              </label>
            ))}
          </div>

          <h3 className="sub">Type and logo</h3>
          <div className="typerow">
            <label className="fld">
              <span>Font family</span>
              <input
                value={editing.theme.typography.family}
                onChange={(e) => setEditing({ ...editing, theme: { ...editing.theme, typography: { ...editing.theme.typography, family: e.target.value } } })}
              />
            </label>
            <label className="fld">
              <span>Scale</span>
              <input
                type="number"
                step="0.05"
                value={editing.theme.typography.scale}
                onChange={(e) => setEditing({ ...editing, theme: { ...editing.theme, typography: { ...editing.theme.typography, scale: Number(e.target.value) || 1 } } })}
              />
            </label>
            <div className="fld">
              <span>Logo</span>
              <div className="logorow">
                {editing.theme.logo.src ? <img className="logoprev" src={editing.theme.logo.src} alt="" /> : <span className="nologo">None</span>}
                <label className="btn small">
                  Upload
                  <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && onLogo(e.target.files[0])} />
                </label>
                {editing.theme.logo.src && (
                  <button className="btn small" onClick={() => setEditing({ ...editing, theme: { ...editing.theme, logo: { ...editing.theme.logo, src: "" } } })}>
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="actions">
            {editing.id && (
              <button className="btn danger" onClick={() => remove(editing.id!)}>
                Delete
              </button>
            )}
            <button className="btn" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button className="btn primary" onClick={save}>
              Save theme
            </button>
          </div>
        </section>
      )}

      <section className="panel">
        <div className="brandhead">
          <div>
            <div className="eyebrow">Decks</div>
            <h2>Assign a theme</h2>
            <p className="cap">Pick the brand each deck is served with. A deck with no theme uses the built-in neutral.</p>
          </div>
          {/* Filtering happens here rather than server-side: the list is one row per deck and
              the owner should see all their clients by default (D23). */}
          {workspaces.length > 1 && (
            <select value={client} onChange={(e) => setClient(e.target.value)}>
              <option value="">All clients</option>
              {workspaces.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          )}
        </div>
        {shown.length ? (
          <table>
            <thead>
              <tr>
                <th>Deck</th>
                <th>Client</th>
                <th>Type</th>
                <th>Theme</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((a) => (
                <tr key={a.id}>
                  <td className="who">{a.title}</td>
                  <td className="ago">{a.workspace}</td>
                  <td className="ago">{a.kind}</td>
                  <td>
                    <select value={a.themeId ?? ""} onChange={(e) => assign(a.id, e.target.value)}>
                      <option value="">Neutral (none)</option>
                      {themes.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="empty">{artifacts.length ? "No decks for this client." : "No decks published yet."}</p>
        )}
      </section>

      <section className="panel">
        <div className="eyebrow">Attribution</div>
        <h2>The mark on your decks</h2>
        <p className="cap">
          Every deck carries a small "Made with DeckTrail by OrbitQube" mark. The licence does not require it, and you
          can turn it off in your theme without asking us.
        </p>
        <p className="cap">
          We do ask you to keep it. DeckTrail is free and self-hosted, so a client noticing that mark is the only way
          the next person finds this project. If you would rather not, that is genuinely fine.
        </p>
        <div className="actions">
          <a className="btn" href="https://decktrail.com/attribution" target="_blank" rel="noopener">
            Why we ask
          </a>
        </div>
      </section>

      <section className="panel">
        <div className="eyebrow">Trademark</div>
        <h2>Using the DeckTrail name</h2>
        <p className="cap">
          Separate from the mark above, and the one thing we do ask permission for. Running, modifying, and forking
          DeckTrail needs nothing from us. Naming a modified version "DeckTrail", using our logos, or offering a hosted
          service under the name does.
        </p>
        <div className="actions">
          {cfg?.trademarkEmail && (
            <a className="btn" href={`mailto:${cfg.trademarkEmail}?subject=DeckTrail%20trademark%20permission%20request`}>
              Email instead
            </a>
          )}
          {cfg?.trademarkUrl && (
            <a className="btn primary" href={cfg.trademarkUrl} target="_blank" rel="noopener">
              Request permission
            </a>
          )}
        </div>
      </section>
    </main>
  );
}
