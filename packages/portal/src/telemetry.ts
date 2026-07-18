/**
 * Opt-in, anonymous usage telemetry. Off unless the operator turns it on at setup. It sends
 * only an anonymous instance id, the version, and bucketed aggregate counts to the configured
 * endpoint. No viewer data, no content, no client information, and no raw counts, ever. This
 * measures active installs and use without touching anyone's privacy.
 */

/** The product version reported in telemetry and shown in the console. */
export const DECKTRAIL_VERSION = "0.1.0";

export interface TelemetryPayload {
  instanceId: string;
  version: string;
  /** Bucketed count of published artifacts, so no exact figure leaves the instance. */
  decks: string;
  /** Bucketed view count, so no exact figure leaves the instance. */
  views: string;
}

/** Bucket a raw count into a coarse range, so an exact number never leaves the instance. */
export function bucket(n: number): string {
  if (n <= 0) return "0";
  if (n <= 10) return "1-10";
  if (n <= 100) return "11-100";
  if (n <= 1000) return "101-1000";
  return "1000+";
}

export function buildTelemetryPayload(input: { instanceId: string; version: string; decks: number; views: number }): TelemetryPayload {
  return { instanceId: input.instanceId, version: input.version, decks: bucket(input.decks), views: bucket(input.views) };
}

/** Send one telemetry ping, failing silently. Telemetry must never affect the running portal. */
export async function sendTelemetry(endpoint: string, payload: TelemetryPayload, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}
