import { describe, it, expect } from "vitest";
import { resolveSmtp, resolveDkim, magicLinkMessage, envOverrideKey, buildMagicLinkSender } from "./mailer.js";
import { InMemorySettingsStore } from "./settings.js";

describe("resolveSmtp", () => {
  const from = (m: Record<string, string>) => (k: string) => m[k];

  it("returns null when no host is set", () => {
    expect(resolveSmtp(from({ smtp_from: "admin@decktrail.orbitqube" }))).toBeNull();
  });

  it("returns null when there is no from and no user to fall back to", () => {
    expect(resolveSmtp(from({ smtp_host: "smtp.example.com" }))).toBeNull();
  });

  it("falls back to the user as the from address", () => {
    const smtp = resolveSmtp(from({ smtp_host: "smtp.example.com", smtp_user: "u@example.com" }));
    expect(smtp?.from).toBe("u@example.com");
  });

  it("defaults to the submission port with STARTTLS (not implicit TLS)", () => {
    const smtp = resolveSmtp(from({ smtp_host: "smtp.example.com", smtp_from: "admin@decktrail.orbitqube" }));
    expect(smtp?.port).toBe(587);
    expect(smtp?.secure).toBe(false);
  });

  it("uses implicit TLS on port 465", () => {
    const smtp = resolveSmtp(from({ smtp_host: "h", smtp_from: "admin@decktrail.orbitqube", smtp_port: "465" }));
    expect(smtp?.secure).toBe(true);
  });
});

describe("envOverrideKey", () => {
  it("maps a wizard setting key to its DT_SMTP_* override", () => {
    expect(envOverrideKey("smtp_host")).toBe("DT_SMTP_HOST");
    expect(envOverrideKey("smtp_pass")).toBe("DT_SMTP_PASS");
  });
});

describe("resolveDkim", () => {
  const from = (m: Record<string, string>) => (k: string) => m[k];

  it("returns null when DKIM is not fully configured", () => {
    expect(resolveDkim(from({}))).toBeNull();
    expect(resolveDkim(from({ DT_DKIM_DOMAIN: "example.com", DT_DKIM_SELECTOR: "s" }))).toBeNull();
  });

  it("returns the settings when domain, selector, and key are all present", () => {
    const dkim = resolveDkim(from({ DT_DKIM_DOMAIN: "example.com", DT_DKIM_SELECTOR: "dt", DT_DKIM_PRIVATE_KEY: "KEY" }));
    expect(dkim).toEqual({ domainName: "example.com", keySelector: "dt", privateKey: "KEY" });
  });
});

describe("magicLinkMessage", () => {
  const url = "https://decks.example.com/auth/claim?token=abc123";

  it("names the brand in the subject and states the link is single-use and time-boxed", () => {
    const msg = magicLinkMessage(url, { brand: "Acme Decks", ttlMinutes: 30 });
    expect(msg.subject).toBe("Your Acme Decks sign-in link");
    expect(msg.text).toContain(url);
    expect(msg.text).toContain("works once");
    expect(msg.text).toContain("30 minutes");
  });

  it("escapes the brand in the HTML body", () => {
    const msg = magicLinkMessage(url, { brand: "A & B <script>", ttlMinutes: 30 });
    expect(msg.html).toContain("A &amp; B &lt;script&gt;");
    expect(msg.html).not.toContain("<script>");
  });

  it("emits no em dash", () => {
    const msg = magicLinkMessage(url, { brand: "Acme", ttlMinutes: 30 });
    const emDash = String.fromCharCode(0x2014);
    expect(msg.subject + msg.text + msg.html).not.toContain(emDash);
  });
});

describe("buildMagicLinkSender", () => {
  it("logs the link when SMTP is not configured, so a fresh install still works", async () => {
    const logs: string[] = [];
    const send = await buildMagicLinkSender(new InMemorySettingsStore(), {
      brand: "DeckTrail",
      ttlMinutes: 30,
      env: {},
      log: (m) => logs.push(m),
    });
    await send("client@example.com", "https://x/auth/claim?token=t");
    expect(logs.some((l) => l.includes("not configured"))).toBe(true);
    expect(logs.some((l) => l.includes("client@example.com") && l.includes("token=t"))).toBe(true);
  });

  it("selects the SMTP path when configured, and env overrides the settings store", async () => {
    const settings = new InMemorySettingsStore();
    await settings.set("smtp_host", "stale-host-from-wizard");
    const logs: string[] = [];
    // Env provides a host and from, so the SMTP path is chosen (no "not configured" log).
    // The sender is not invoked, so no real connection is attempted.
    await buildMagicLinkSender(settings, {
      brand: "DeckTrail",
      ttlMinutes: 30,
      env: { DT_SMTP_HOST: "smtp.override.example.com", DT_SMTP_FROM: "noreply@example.com" },
      log: (m) => logs.push(m),
    });
    expect(logs.some((l) => l.includes("not configured"))).toBe(false);
  });
});
