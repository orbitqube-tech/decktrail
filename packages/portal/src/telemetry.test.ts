import { describe, it, expect } from "vitest";
import { bucket, buildTelemetryPayload, sendTelemetry, DECKTRAIL_VERSION } from "./telemetry.js";

describe("bucket", () => {
  it("coarsens a count so an exact figure never leaves the instance", () => {
    expect(bucket(0)).toBe("0");
    expect(bucket(1)).toBe("1-10");
    expect(bucket(10)).toBe("1-10");
    expect(bucket(11)).toBe("11-100");
    expect(bucket(100)).toBe("11-100");
    expect(bucket(1000)).toBe("101-1000");
    expect(bucket(5000)).toBe("1000+");
  });
});

describe("buildTelemetryPayload", () => {
  it("carries only an anonymous id, version, and coarse counts", () => {
    const p = buildTelemetryPayload({ instanceId: "anon123", version: DECKTRAIL_VERSION, decks: 3, views: 47 });
    expect(p).toEqual({ instanceId: "anon123", version: DECKTRAIL_VERSION, decks: "1-10", views: "11-100" });
    // Nothing identifying may appear in the payload.
    const keys = Object.keys(p).sort();
    expect(keys).toEqual(["decks", "instanceId", "version", "views"]);
  });
});

describe("sendTelemetry", () => {
  it("posts the payload to the endpoint", async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: String(init?.body ?? "") });
      return { ok: true } as Response;
    }) as typeof fetch;
    const ok = await sendTelemetry("https://x/telemetry", buildTelemetryPayload({ instanceId: "a", version: "1", decks: 1, views: 1 }), fetchImpl);
    expect(ok).toBe(true);
    expect(calls[0]?.url).toBe("https://x/telemetry");
    expect(calls[0]?.body).toContain('"instanceId":"a"');
  });

  it("fails silently, so telemetry can never affect the portal", async () => {
    const fetchImpl = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    await expect(sendTelemetry("https://x", { instanceId: "a", version: "1", decks: "0", views: "0" }, fetchImpl)).resolves.toBe(false);
  });
});
