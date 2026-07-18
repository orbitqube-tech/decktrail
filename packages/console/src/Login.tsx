import { useEffect, useRef, useState } from "react";
import { fetchAuthConfig, requestLink } from "./api";

/** Load the Cloudflare Turnstile script once, when a sitekey is configured. */
function useTurnstileScript(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    if (document.querySelector(`script[src="${src}"]`)) return;
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    document.head.appendChild(s);
  }, [enabled]);
}

/** The sign-in screen. Enter your email, get a one-time link. Always answers the same way,
 *  so it never reveals whether an address is allowed. */
export function Login(): React.ReactElement {
  const [email, setEmail] = useState("");
  const [sitekey, setSitekey] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const widget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchAuthConfig().then((c) => setSitekey(c.turnstileSitekey));
  }, []);
  useTurnstileScript(Boolean(sitekey));

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const token = widget.current?.querySelector<HTMLInputElement>('[name="cf-turnstile-response"]')?.value;
    await requestLink(email.trim().toLowerCase(), token);
    setSent(true);
  }

  return (
    <div className="login">
      <div className="card">
        <h1>Sign in</h1>
        {sent ? (
          <p className="sent">
            If that address has access, a sign-in link is on its way. Open it on this device to reach your
            dashboard.
          </p>
        ) : (
          <>
            <p>Enter your email and we will send you a one-time link. No password to remember.</p>
            <form onSubmit={submit}>
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@studio.com"
              />
              {sitekey && (
                <div className="cf" ref={widget}>
                  <div className="cf-turnstile" data-sitekey={sitekey} />
                </div>
              )}
              <button className="btn primary" type="submit">
                Email me a sign-in link
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
