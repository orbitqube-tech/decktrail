/**
 * The whole journey, in a real browser, as the two people who actually use this.
 *
 * Not a unit test and not a curl script. Every step below is something a person does with a
 * mouse and a keyboard, in the order they do it, starting from `docker compose up` on an
 * empty database. It exists because everything the unit suite could not see was found this
 * way: a green 199-test suite still shipped a portal whose root URL 404'd, whose clients met
 * raw JSON where a sign-in page should be, and whose magic link answered {"ok":true} and left
 * you there.
 *
 * Run:  node scripts/e2e.mjs            (visible browser, slowed down so you can watch)
 *       node scripts/e2e.mjs --headless (for CI)
 *
 * Needs: a fresh stack (docker compose down -v && docker compose up -d --build)
 */
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";

const HEADLESS = process.argv.includes("--headless");
const BASE = process.env.DT_E2E_BASE ?? "http://localhost:3000";
const SHOTS = process.env.DT_E2E_SHOTS ?? "e2e-shots";
const OPERATOR = process.env.DT_E2E_ADMIN ?? "admin@decktrail.orbitqube";
const CLIENT = "user@decktrail.orbitqube";

mkdirSync(SHOTS, { recursive: true });

let step = 0;
const notes = [];
function log(msg) {
  console.log(`  ${msg}`);
}
async function shot(page, name, note) {
  step += 1;
  const file = `${SHOTS}/${String(step).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path: file, fullPage: false });
  notes.push({ step, name, note, file });
  log(`[${step}] ${note}`);
}
function fail(msg) {
  console.error(`\n  FAILED: ${msg}\n`);
  process.exitCode = 1;
  throw new Error(msg);
}

/** The portal logs its magic links when SMTP is unset, which is where a local run reads them. */
function linkFor(email) {
  const logs = execSync("docker compose logs --since 60s portal", { encoding: "utf8" });
  const re = new RegExp(`${email.replace(/[.@+]/g, "\\$&")}: (https?://\\S+)`, "g");
  const all = [...logs.matchAll(re)].map((m) => m[1]);
  const url = all.at(-1);
  if (!url) fail(`no magic link was sent to ${email}`);
  return url.replace(/^https:\/\/localhost:3000/, "http://localhost:3000");
}

function setupUrl() {
  const logs = execSync("docker compose logs portal", { encoding: "utf8" });
  const m = [...logs.matchAll(/(http:\/\/\S*\/setup\?token=\S+)/g)].map((x) => x[1]).at(-1);
  if (!m) fail("the portal printed no setup URL. Is the stack fresh?");
  return m;
}

const browser = await chromium.launch({
  headless: HEADLESS,
  channel: HEADLESS ? undefined : "chrome", // the real Chrome, so this is what a person sees
  slowMo: HEADLESS ? 0 : 350,
});

try {
  // ------------------------------------------------------------------ the operator
  console.log("\n== The freelancer sets up their portal ==");
  const op = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const opPage = await op.newPage();

  // Setup is locked to whoever can read the log. Prove that first, the way a stranger meets it.
  await opPage.goto(`${BASE}/setup`);
  await shot(opPage, "setup-locked", "A stranger opening /setup is told where the token lives, and given nothing");
  if (!(await opPage.locator("text=docker compose logs").count())) fail("the locked page does not tell the operator where to look");

  await opPage.goto(setupUrl());
  await shot(opPage, "setup-form", "The operator opens the URL from their log and gets the wizard");

  await opPage.fill('input[name="adminEmail"]', OPERATOR);
  await opPage.fill('input[name="brandName"]', "OrbitQube");
  await shot(opPage, "setup-filled", "They fill in their email and brand");

  await opPage.click('button[type="submit"]');
  await opPage.waitForLoadState("networkidle");
  // The wizard finishes by sending them to "/", which used to be a raw JSON 404.
  if ((await opPage.content()).includes("Route GET:/ not found")) fail("finishing setup lands on a 404");
  await shot(opPage, "after-setup", "Finishing setup lands them on their console, not a 404");

  // They are not signed in yet: the console shows the sign-in screen.
  await opPage.fill('input[type="email"]', OPERATOR);
  await opPage.click('button[type="submit"]');
  await opPage.waitForTimeout(800);
  await shot(opPage, "operator-link-sent", "They ask for a sign-in link");

  await opPage.goto(linkFor(OPERATOR));
  await opPage.waitForLoadState("networkidle");
  if ((await opPage.content()).includes('{"ok":true}')) fail('the magic link answers {"ok":true} instead of signing them in somewhere');
  await shot(opPage, "operator-console", "Their link signs them in and lands them on the dashboard");

  // ------------------------------------------------------------------ publish
  console.log("\n== They publish a deck and share it with a client ==");
  const token = (readFileSync(".env", "utf8").match(/^DT_ADMIN_TOKEN=(.*)$/m)?.[1] ?? "").trim();
  if (!token) fail("no DT_ADMIN_TOKEN in .env");
  const ir = process.env.DT_E2E_IR;
  if (!ir) fail("set DT_E2E_IR to a deck IR file to publish");
  const out = execSync(
    `node packages/studio/dist/cli.js push "${ir}" --portal ${BASE} --token "${token}" --recipient ${CLIENT}`,
    { encoding: "utf8" },
  );
  // Share ids are base64url (see portal crypto), so they can contain a hyphen. `\w` does not
  // match one, and truncating the id at the first hyphen sends the browser to a share that does
  // not exist: a "page not available" that looks like a serving bug and is really a parse bug,
  // firing only on the runs whose random id happens to carry a hyphen.
  const shareId = out.match(/\/d\/(shr_[\w-]+)/)?.[1];
  if (!shareId) fail(`push did not mint a share link:\n${out}`);
  log(`published and shared: ${shareId}`);

  // ------------------------------------------------------------------ the client
  console.log("\n== The client opens the link they were sent ==");
  const client = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const cp = await client.newPage();

  await cp.goto(`${BASE}/d/${shareId}`);
  const body = await cp.content();
  if (body.includes('{"error":"please sign in"}')) fail("the client is shown raw JSON instead of a sign-in page");
  await shot(cp, "client-signin", "The client, not signed in, gets a door rather than a JSON error");
  if (!(await cp.locator("text=OrbitQube").count())) fail("the sign-in page does not wear the sender's brand");

  await cp.fill('input[type="email"]', CLIENT);
  await cp.click('button[type="submit"]');
  await cp.waitForTimeout(800);
  await shot(cp, "client-link-sent", "They ask for their link, and are told nothing about who is invited");

  await cp.goto(linkFor(CLIENT));
  await cp.waitForLoadState("networkidle");
  const url = cp.url();
  if (!url.includes(`/d/${shareId}`)) fail(`the client's link landed on ${url}, not on their deck`);
  await shot(cp, "client-deck", "Their link takes them straight to the deck they were sent");

  // The watermark is the product. Check it is theirs and nobody else's.
  const deckHtml = await cp.content();
  if (!deckHtml.includes(CLIENT)) {
    // Say what the client is actually looking at. "Not watermarked" was reported for a page that
    // was not the deck at all, which sends you hunting through the renderer for a fault that is
    // upstream of it.
    const heading = (await cp.locator("h1").first().textContent().catch(() => null))?.trim();
    const cookie = (await client.cookies()).map((c) => c.name).join(", ") || "none";
    fail(
      `the client did not get their deck. The page says: ${heading ? `"${heading}"` : "(no heading)"}. ` +
        `Cookies: ${cookie}. Share ${shareId} was made for ${CLIENT}.`,
    );
  }
  log(`watermarked to ${CLIENT}`);

  await cp.keyboard.press("ArrowRight");
  await cp.waitForTimeout(400);
  await cp.keyboard.press("ArrowRight");
  await cp.waitForTimeout(400);
  await shot(cp, "client-slide-3", "They page through the deck with the arrow keys");

  // ------------------------------------------------------------------ the trail
  console.log("\n== The freelancer looks at what happened ==");
  await cp.waitForTimeout(1200); // let the beacon flush its dwell
  await cp.close();
  await opPage.goto(`${BASE}/admin/#/overview`);
  await opPage.reload();
  await opPage.waitForTimeout(1500);
  await shot(opPage, "operator-analytics", "The client's read shows up on their dashboard");
  if (!(await opPage.locator(`text=${CLIENT}`).count())) fail("the client's open does not appear in the owner's analytics");

  await opPage.goto(`${BASE}/admin/#/brand`);
  await opPage.waitForTimeout(1200);
  await shot(opPage, "operator-brand", "The Brand tab lists the deck, by client");

  // ------------------------------------------------------------------ the promise
  console.log("\n== The thing the product actually promises ==");
  const other = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const op2 = await other.newPage();
  await op2.goto(linkFor(OPERATOR).replace(/token=\S+/, "token=stolen-token-does-not-exist"));
  await shot(op2, "forged-link", "A made-up magic link is refused");

  // The operator is signed in and invited, and still may not read the client's deck.
  const snoop = await op.newPage();
  await snoop.goto(`${BASE}/d/${shareId}`);
  const snooped = await snoop.content();
  if (snooped.includes("Technology that works") || snooped.includes(CLIENT)) {
    fail("a signed-in non-recipient can read the client's deck");
  }
  if (snooped.includes('{"error":"not found"}')) fail("a refused viewer is shown raw JSON");
  // The refusal must not say WHY: withdrawn, never existed, and not-yours are one answer.
  if (/not yours|belongs to|revoked/i.test(snooped)) fail("the refusal reveals why");
  await shot(snoop, "not-your-deck", "Even the portal's own owner, signed in, cannot open a deck shared with someone else, and is not told why");

  console.log("\n  All steps passed.\n");
  writeFileSync(`${SHOTS}/steps.json`, JSON.stringify(notes, null, 2));
  console.log(`  ${notes.length} screenshots in ${SHOTS}/`);
} finally {
  await browser.close();
}
