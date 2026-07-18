/**
 * Cloudflare Turnstile server-side verification. Turnstile is a CAPTCHA alternative: the
 * browser widget returns a token, and the server confirms it here before acting. This
 * raises the cost of scripting the magic-link request form. It is a bot-abuse control, not
 * a volumetric-DDoS control; the DDoS layer is the Cloudflare edge (see docs/DECISIONS.md).
 */

/** Cloudflare's token verification endpoint. */
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** The subset of the siteverify response we act on. */
interface SiteVerifyResponse {
  success?: boolean;
}

/** A verifier bound to a secret: given a token and the viewer IP, is it valid? */
export type TurnstileVerifier = (token: string, remoteIp?: string) => Promise<boolean>;

/**
 * Verify a Turnstile token against Cloudflare. Fails closed: an empty token, a non-success
 * result, a non-OK response, or any network error all return false, so a verification that
 * cannot be completed blocks rather than passes.
 */
export async function verifyTurnstileToken(
  secret: string,
  token: string,
  remoteIp?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!token) return false;
  const form = new URLSearchParams({ secret, response: token });
  if (remoteIp) form.set("remoteip", remoteIp);
  try {
    const res = await fetchImpl(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form,
    });
    if (!res.ok) return false;
    const data = (await res.json()) as SiteVerifyResponse;
    return data.success === true;
  } catch {
    return false;
  }
}

/** Bind a secret into a reusable verifier for the request route. */
export function makeTurnstileVerifier(secret: string, fetchImpl: typeof fetch = fetch): TurnstileVerifier {
  return (token, remoteIp) => verifyTurnstileToken(secret, token, remoteIp, fetchImpl);
}
