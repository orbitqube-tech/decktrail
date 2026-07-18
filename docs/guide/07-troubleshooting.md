# Troubleshooting

The failure modes people actually hit, and the fix for each. If something here is wrong or
missing, that is a documentation bug worth an issue.

---

## Generation

**`decktrail generate` fails or says Claude Code is not logged in.**
Generation runs on your own Claude subscription through Claude Code, not an API key. Install
Claude Code and run `claude login` once. If the subscription has lapsed, generation fails with a
clear message rather than stalling (decision D9). If you do not use Claude Code, write the deck
JSON by hand; see [Writing a deck](02-writing-decks.md).

**The generated deck does not validate.**
The generator repairs an invalid field once or twice on its own, then gives up with the exact
path that is wrong. Open the JSON, fix that field (the error names it), and run
`decktrail validate deck.json`. Common causes are a value outside a closed set (a state that is
not `good`/`warn`/`bad`) or a string where a number belongs (a chart value).

## Mail and sign-in

**No magic-link email arrives.**
On a fresh local install this is expected: with SMTP unset, the portal logs the link instead of
sending it. Find it with `docker compose logs --since 2m portal | grep magic-link`. For real
clients, configure mail; see [Going live, step 2](06-going-live.md#2-send-real-email).

**The email lands in spam.**
Almost always because it was sent from the app's own host, which has no sending reputation. Send
through an authenticated mail service and add SPF and DKIM records on the sending domain. This is
the single most common going-live mistake.

**A client enters their address and never gets in.**
They must use the exact address the deck was shared to. The response is deliberately identical
for an uninvited address (so the invite list never leaks), so a typo looks the same as a refusal.
Re-share to the correct address with `decktrail push ... --recipient`, and confirm the address
matches.

**You get "This page is not available" on a deck.**
That is the product working: you are signed in as one person and the deck was shared to another.
A deck opens only for its share recipient, never for the owner's own session and never by
workspace.

## Setup

**You lost the setup link, or setup reopened.**
`docker compose restart portal` prints a fresh setup URL. Setup locks once complete and the token
is burned; if the settings row is ever lost, setup reopens and prints a new token, so a stale one
from an old log is worthless.

## Rendering and brand

**Decks render in the wrong font.**
The theme font is embedded at render time. Fetch it once with `pnpm fetch-fonts`; without the
cached font, decks fall back to the system face, which changes the weight and the line wrapping.

**A deck has no brand, just the neutral default.**
The theme is applied per artifact. Assign one in the console's Brand tab, or pass
`--theme theme.json` at `render` or `push`. Setting only the brand name in the wizard does not set
colors or a logo; see [Your brand and your voice](03-brand-and-voice.md).

**A `figure` renders as unstyled boxes.**
`figure` is an allowlisted escape hatch: the sanitizer strips `<style>`, `style=`, and scripts,
so a figure that relies on external CSS loses it. Use inline SVG for anything visual.

## The console and grouping

**All my decks are grouped under one workspace.**
The workspace is the client the deck is for (decision D23). When generating, pass
`--client <name>`; when writing by hand, set `workspace`. If you omit it, decks land under a
single default grouping, which is harmless but makes the per-client view useless.

**The dashboard shows nothing while a client is reading.**
Confirm the deck's workspace and the recipient's invite line up; the owner dashboard spans all
workspaces by default, so if a deck is genuinely being read it should appear. If it does not,
capture the portal logs and open an issue.

## Container and database

**The portal will not boot.**
Check `docker compose logs portal`. Two common causes: `POSTGRES_PASSWORD` unset in `.env` (the
one required value), or a secret left at a published placeholder (the portal refuses to boot on
any placeholder it has ever shipped, on purpose). Set a real value and bring it back up.

**A legitimate tool gets a 403.**
Known AI and crawler agents are refused at the door and logged in the tripwire. If a tool you
trust is blocked, it is matching that list; the block is by user agent, and the attempt is
visible in the dashboard so you can see what was refused.

## Still stuck

Read the [threat model](../THREAT-MODEL.md) if the question is "should this be possible", the
[configuration reference](05-configuration.md) if it is "where does this setting live", and open
an issue on the [repository](https://github.com/orbitqube-tech/decktrail) otherwise.

---

<!-- guide-nav -->
**The guide:** [← Setting it up on your own server](08-server-setup.md) · [All docs](../README.md) · [What it cannot do →](../THREAT-MODEL.md)
