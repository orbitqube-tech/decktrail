import { readFileSync } from "node:fs";
import { createTransport } from "nodemailer";
import type { SettingsStore } from "./settings.js";

/** The magic-link sender seam buildApp expects (app.ts AppDeps.sendMagicLink). */
export type SendMagicLink = (email: string, url: string) => Promise<void>;

/** Default submission port: 587 is SMTP submission with STARTTLS. */
const DEFAULT_SMTP_PORT = 587;
/** Implicit-TLS port: 465 wraps the whole connection in TLS from the first byte. */
const SMTPS_PORT = 465;

/** The setting keys the first-run wizard writes, and their DT_SMTP_* env override names. */
const SMTP_KEYS = ["smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_from"] as const;

/** Resolved SMTP settings. The password lives here and is never logged. */
export interface SmtpSettings {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  from: string;
  /** Implicit TLS (port 465). Port 587/25 upgrade with STARTTLS, so this is false there. */
  secure: boolean;
}

/**
 * Optional app-level DKIM (DomainKeys Identified Mail) signing. Only needed when sending
 * direct from a host whose mail service does not sign for you. When the SMTP host is an
 * authenticated mail service (a mailbox provider, SES, Resend), it signs already and this
 * stays unset. The DNS record `<selector>._domainkey.<domain>` must publish the matching
 * public key, or receivers see an invalid signature.
 */
export interface DkimSettings {
  domainName: string;
  keySelector: string;
  privateKey: string;
}

/** Content of one magic-link email. */
export interface MessageOptions {
  /** Brand name shown in the subject and body. */
  brand: string;
  /** Link lifetime in minutes, stated to the recipient. */
  ttlMinutes: number;
}

/** The environment override variable name for a wizard setting key (smtp_host -> DT_SMTP_HOST). */
export function envOverrideKey(settingKey: string): string {
  return `DT_${settingKey.toUpperCase()}`;
}

/**
 * Resolve SMTP settings from a key lookup. Returns null when SMTP is not configured (no
 * host or no usable from address), which selects the logging fallback. This is pure so it
 * can be unit-tested without a settings store or a live server.
 */
export function resolveSmtp(get: (key: string) => string | undefined): SmtpSettings | null {
  const host = get("smtp_host");
  const from = get("smtp_from") ?? get("smtp_user");
  if (!host || !from) return null;
  const port = Number(get("smtp_port") ?? DEFAULT_SMTP_PORT);
  return {
    host,
    port,
    user: get("smtp_user"),
    pass: get("smtp_pass"),
    from,
    secure: port === SMTPS_PORT,
  };
}

/**
 * Resolve optional DKIM settings from an environment lookup. Returns null unless all three
 * of domain, selector, and private key are present, so partial config is treated as off.
 * Pure, so it is unit-testable; the private-key file read happens in buildMagicLinkSender.
 */
export function resolveDkim(get: (key: string) => string | undefined): DkimSettings | null {
  const domainName = get("DT_DKIM_DOMAIN");
  const keySelector = get("DT_DKIM_SELECTOR");
  const privateKey = get("DT_DKIM_PRIVATE_KEY");
  if (!domainName || !keySelector || !privateKey) return null;
  return { domainName, keySelector, privateKey };
}

/** Minimal HTML escape for values interpolated into the email body. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Build the magic-link email. Plain text is the source of truth; the HTML mirrors it. The
 * link is single-use and time-boxed, and the copy says so, so a recipient who did not ask
 * for it can ignore it safely.
 */
export function magicLinkMessage(url: string, opts: MessageOptions): { subject: string; text: string; html: string } {
  const brand = opts.brand;
  const subject = `Your ${brand} sign-in link`;
  const text = [
    `Here is your sign-in link for ${brand}.`,
    "",
    url,
    "",
    `This link works once and expires in ${opts.ttlMinutes} minutes.`,
    `If you did not request it, you can ignore this email.`,
  ].join("\n");
  const b = escapeHtml(brand);
  const u = escapeHtml(url);
  const html =
    `<p>Here is your sign-in link for ${b}.</p>` +
    `<p><a href="${u}">Sign in to ${b}</a></p>` +
    `<p>This link works once and expires in ${opts.ttlMinutes} minutes. ` +
    `If you did not request it, you can ignore this email.</p>`;
  return { subject, text, html };
}

/**
 * Make an SMTP-backed sender. nodemailer speaks the SMTP wire protocol to the configured
 * host using our own credentials; pointing host at a provider's SMTP endpoint (a mail
 * server, Google Workspace, Resend, SES, Mailgun) is a config choice, not a code change.
 */
export function makeSmtpSender(smtp: SmtpSettings, opts: MessageOptions, dkim?: DkimSettings | null): SendMagicLink {
  const transport = createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
    ...(dkim
      ? { dkim: { domainName: dkim.domainName, keySelector: dkim.keySelector, privateKey: dkim.privateKey } }
      : {}),
  });
  return async (email, url) => {
    const msg = magicLinkMessage(url, opts);
    await transport.sendMail({ from: smtp.from, to: email, subject: msg.subject, text: msg.text, html: msg.html });
  };
}

/**
 * Build the magic-link sender used by the running portal. For each SMTP setting the
 * environment (DT_SMTP_*) wins over the settings store the wizard wrote, so there is one
 * authoritative value per key. When SMTP is not configured the sender logs the link
 * instead, so a fresh install works before SMTP is set up.
 */
export async function buildMagicLinkSender(
  settings: SettingsStore,
  opts: MessageOptions & { env?: NodeJS.ProcessEnv; log?: (msg: string) => void },
): Promise<SendMagicLink> {
  const env = opts.env ?? process.env;
  const log = opts.log ?? ((m: string) => console.log(m));

  const values = new Map<string, string | undefined>();
  for (const key of SMTP_KEYS) {
    const override = env[envOverrideKey(key)];
    values.set(key, override ?? (await settings.get(key)) ?? undefined);
  }

  const smtp = resolveSmtp((k) => values.get(k));
  if (!smtp) {
    log("[magic-link] SMTP is not configured; logging links instead of sending");
    return async (email, url) => {
      log(`[magic-link] ${email}: ${url}`);
    };
  }

  // Optional app-level DKIM. The private key may be given inline (DT_DKIM_PRIVATE_KEY) or,
  // preferably, as a mounted file (DT_DKIM_PRIVATE_KEY_FILE) so the secret stays off the env.
  const keyFile = env["DT_DKIM_PRIVATE_KEY_FILE"];
  const inlineKey = env["DT_DKIM_PRIVATE_KEY"];
  const privateKey = inlineKey ?? (keyFile ? readFileSync(keyFile, "utf8") : undefined);
  const dkim = resolveDkim((k) => (k === "DT_DKIM_PRIVATE_KEY" ? privateKey : env[k]));
  if (dkim) log(`[magic-link] DKIM signing enabled for ${dkim.domainName} (selector ${dkim.keySelector})`);

  const send = makeSmtpSender(smtp, { brand: opts.brand, ttlMinutes: opts.ttlMinutes }, dkim);
  return async (email, url) => {
    try {
      await send(email, url);
    } catch (err) {
      // The request route answers neutrally regardless, so surface the failure here as the
      // server-side alert, then rethrow for the route's neutral-on-error guard to log too.
      log(`[magic-link] send failed for ${email}: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  };
}
