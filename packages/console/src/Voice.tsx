import { useEffect, useState } from "react";
import { getVoice, saveVoice } from "./api";
import type { VoiceShape } from "./types";

const BLANK: VoiceShape = {
  name: "My voice",
  audience: "",
  tone: "",
  forbidden: [],
  preferred: [],
  locale: { currency: "USD", dates: "" },
  instructions: "",
};

/** One line per entry, trimmed, empties dropped. */
const PREFER_HINT = ["plain, complete sentences", "lead with the outcome"].join("\n");
const NEVER_HINT = ["hype and marketing language", "telling the reader what to conclude"].join("\n");

function toLines(v: string[]): string {
  return v.join("\n");
}
function fromLines(s: string): string[] {
  return s.split("\n").map((x) => x.trim()).filter(Boolean);
}

export function Voice(): React.ReactElement {
  const [voice, setVoice] = useState<VoiceShape>(BLANK);
  const [status, setStatus] = useState<string | null>(null);
  // Raw text for the two list boxes, so typing is never fought with.
  const [preferText, setPreferText] = useState("");
  const [neverText, setNeverText] = useState("");

  useEffect(() => {
    getVoice().then((v) => {
      if (!v) return;
      const loaded = { ...BLANK, ...v, locale: v.locale ?? BLANK.locale };
      setVoice(loaded);
      setPreferText(toLines(loaded.preferred));
      setNeverText(toLines(loaded.forbidden));
    });
  }, []);

  function set<K extends keyof VoiceShape>(key: K, value: VoiceShape[K]): void {
    setVoice((v) => ({ ...v, [key]: value }));
  }

  async function save(): Promise<void> {
    try {
      // Parse the list boxes here, once, rather than on every keystroke.
      const next = { ...voice, preferred: fromLines(preferText), forbidden: fromLines(neverText) };
      await saveVoice(next);
      setVoice(next);
      setStatus("Saved. Decks generated with --portal will use this voice.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
  }

  function download(): void {
    const current = { ...voice, preferred: fromLines(preferText), forbidden: fromLines(neverText) };
    const blob = new Blob([JSON.stringify(current, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "voice.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <main>
      <section className="panel">
        <div className="eyebrow">Voice</div>
        <h2>How your decks are written</h2>
        <p className="cap">
          This steers deck generation into your own register. Save it here, then generate with{" "}
          <code>decktrail generate notes.md --portal &lt;url&gt; --token &lt;token&gt;</code> and it is used. A{" "}
          <code>voice.json</code> beside your content overrides it. With no voice anywhere, a neutral
          professional default is used.
        </p>

        <label className="fld">
          <span>Name</span>
          <input value={voice.name} onChange={(e) => set("name", e.target.value)} />
        </label>
        <label className="fld">
          <span>Audience</span>
          <input value={voice.audience ?? ""} onChange={(e) => set("audience", e.target.value)} placeholder="Who reads your decks" />
        </label>
        <label className="fld">
          <span>Tone</span>
          <input value={voice.tone ?? ""} onChange={(e) => set("tone", e.target.value)} placeholder="e.g. measured, professional" />
        </label>

        <div className="typerow" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <label className="fld">
            <span>Prefer (one per line)</span>
            <textarea
              rows={5}
              value={preferText}
              onChange={(e) => setPreferText(e.target.value)}
              placeholder={PREFER_HINT}
            />
          </label>
          <label className="fld">
            <span>Never use (one per line)</span>
            <textarea
              rows={5}
              value={neverText}
              onChange={(e) => setNeverText(e.target.value)}
              placeholder={NEVER_HINT}
            />
          </label>
        </div>

        <div className="typerow" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <label className="fld">
            <span>Currency</span>
            <input value={voice.locale?.currency ?? "USD"} onChange={(e) => set("locale", { ...voice.locale, currency: e.target.value })} />
          </label>
          <label className="fld">
            <span>Dates timezone</span>
            <input value={voice.locale?.dates ?? ""} onChange={(e) => set("locale", { currency: voice.locale?.currency ?? "USD", dates: e.target.value })} placeholder="e.g. Asia/Kolkata" />
          </label>
        </div>

        <label className="fld">
          <span>Instructions (free-form, your "how I present")</span>
          <textarea rows={7} value={voice.instructions ?? ""} onChange={(e) => set("instructions", e.target.value)} placeholder="Examples, structure, do and do not..." />
        </label>

        {status && <div className="banner" style={{ borderColor: "rgba(79,211,154,0.3)", color: "var(--pos)" }}>{status}</div>}
        <div className="actions">
          <button className="btn" onClick={download}>
            Download voice.json
          </button>
          <button className="btn primary" onClick={save}>
            Save voice
          </button>
        </div>
      </section>
    </main>
  );
}
