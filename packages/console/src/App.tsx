import { useEffect, useState } from "react";
import { fetchAnalytics, fetchAuthConfig } from "./api";
import { Login } from "./Login";
import { Dashboard } from "./Dashboard";
import { Brand } from "./Brand";
import { Voice } from "./Voice";
import type { AnalyticsSummary } from "./types";

type State = { kind: "loading" } | { kind: "login" } | { kind: "ready"; data: AnalyticsSummary } | { kind: "error"; message: string };
type View = "overview" | "brand" | "voice";

const VIEWS: View[] = ["overview", "brand", "voice"];

/** The tab named in the URL fragment, or the overview. */
function viewFromHash(): View {
  const h = window.location.hash.replace(/^#\/?/, "");
  return (VIEWS as string[]).includes(h) ? (h as View) : "overview";
}

/**
 * The console shell: header with tabs, then the active view. The session decides whether the
 * dashboard or the login screen renders.
 *
 * The tab lives in the URL fragment so it can be linked to and survives a refresh. Held only
 * in component state, a reload always dropped you back on the overview, and there was no way
 * to send someone to a particular tab.
 */
export function App(): React.ReactElement {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [view, setView] = useState<View>(viewFromHash);
  const [brand, setBrand] = useState<string | null>(null);

  useEffect(() => {
    const onHash = (): void => setView(viewFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const show = (v: View): void => {
    window.location.hash = `/${v}`;
    setView(v);
  };

  useEffect(() => {
    let live = true;
    fetchAnalytics()
      .then((r) => live && setState(r === "unauthorized" ? { kind: "login" } : { kind: "ready", data: r }))
      .catch((e: unknown) => live && setState({ kind: "error", message: e instanceof Error ? e.message : String(e) }));
    fetchAuthConfig().then((c) => live && setBrand(c.brand));
    return () => {
      live = false;
    };
  }, []);

  if (state.kind === "loading") return <div className="state">Loading your workspace…</div>;
  if (state.kind === "error") return <div className="state">Could not load analytics: {state.message}</div>;
  if (state.kind === "login") return <Login />;

  return (
    <>
      <header className="top">
        <div className="brand">
          <b>{brand ?? "Your workspace"}</b>
          <span className="on">on DeckTrail</span>
        </div>
        <nav className="tabs">
          <button className={view === "overview" ? "active" : ""} onClick={() => show("overview")}>
            Overview
          </button>
          <button className={view === "brand" ? "active" : ""} onClick={() => show("brand")}>
            Brand
          </button>
          <button className={view === "voice" ? "active" : ""} onClick={() => show("voice")}>
            Voice
          </button>
        </nav>
        <div className="live">
          <span className="dot" aria-hidden="true" />
          Live
        </div>
      </header>
      {view === "overview" ? <Dashboard data={state.data} /> : view === "brand" ? <Brand /> : <Voice />}
    </>
  );
}
