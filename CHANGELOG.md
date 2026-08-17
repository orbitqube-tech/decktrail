# Changelog

Every released version of DeckTrail, newest first.

Versions are `MAJOR.MINOR.PATCH` and they are cut deliberately, not on every commit: `main` is
always releasable, and a version number is a point somebody can install, cite in a bug report, and
come back to. Before 1.0 the minor number carries features and the patch number carries fixes.
`docs/RELEASING.md` is how one is cut.

Dates are the day the tag was pushed.

## 0.3.0 (2026-08-17)

The release that lets an owner act on a share and see what a viewer actually did to a protected
deck, not just that it loaded.

### Sending and tracking a deck

- **Withdraw a share.** `decktrail revoke <shareId>`, and the same action from `DELETE
  /admin/shares/:id`. It does not just stop the link from resolving: it ends the session the
  recipient already holds, so someone reading a deck when you revoke it is signed out, not left
  to finish. Revoking twice, or revoking a share that never existed, is not an error.
- **The dashboard shows what a viewer did against the copy protection.** Copy, print and download
  attempts, and tripwires broken down by reason, all reached the database before this release and
  went nowhere. They have their own panel now, separate from bot traffic refused at the door,
  which looked similar enough at a glance to hide behind it.
- **A selection tripwire.** It fires only once a selection exists, which on a protected deck means
  the stylesheet that prevents selection has already been defeated, so it is evidence of that,
  not a record of an ordinary drag across the page.
- **The dashboard shows where the reading went**: time per slide and how far each person got,
  summarised from data the beacon was already sending. Dwell is capped per view so a deck left
  open in a browser tab over a weekend cannot report as one sixty-hour reading, and the per-slide
  figure is a median so one abandoned tab cannot move a number you're meant to trust.
- **A forwarded link now leaves a trace.** A signed-in person opening a share that was not sent to
  them was always refused; it is now recorded and shown, not only reachable in the exported log.
- **The `devtools_open` event type is gone.** It was reserved and never emitted, and the
  documentation described it as deferred. It is not deferred, it is impossible: measured against a
  real browser, the technique fires zero times with the developer console open, because the console
  does not evaluate a getter while drawing a preview. A signal that cannot be observed is not a
  weaker signal, it is not a signal. `docs/DECISIONS.md` D33 carries the measurement.
- **A share link now uses the scheme the portal is actually reached on.** It hardcoded `https`,
  so a portal running on plain `http` handed out a share link that did not load, even though its
  own sign-in link was correct.

### Writing a deck

- **A fourth theme, storybook**, alongside crest, editorial and vivid. All four are palette and
  type only, so any of them restyles a deck without moving anything on it.
- **Four layouts to choose from**, `--layout crest`, `editorial`, `storybook` or `vivid`. A layout
  is CSS placed over the existing shell: it changes no markup and no behaviour, so navigation, the
  jump menu, the progress bar, the watermark and the beacon keep working under any of them.
  Naming none renders the same default as before.
- **Body text reads better.** Paragraphs, list items and card text are roughly fifteen percent
  larger; headings are unchanged, because they were never the part that was hard to read on a
  laptop.

### Getting started

- **The setup wizard can send a test message** using the SMTP host, port, user, password and from
  address currently typed into the form, before any of it is saved. It reports the mail server's
  real error rather than falling back to logging the way the ordinary sender does, so a test that
  passes actually means the setting works.
- **The installers ask for the right Node.** They said 22 or newer while the project has required
  24 or newer since the last release; installing exactly what was asked for still failed. The CLI's
  list of themes and layouts is generated from the same source that ships them now, so it cannot
  fall behind again the way it did when a fourth theme shipped.
- **The double-click launchers find the right directory.** Explorer and Finder can start a
  double-clicked file somewhere other than the folder it sits in; both launchers now anchor
  themselves first. Neither launcher names a port any more, since `.env` is the port's one home.

### Under it

- `packages/ingest` moves to `@orbitqube/oq-ai-ocr` 0.1.3, off a high severity advisory for
  arbitrary JavaScript execution on a malicious PDF, fixed at the source so every consumer of the
  shared library gets it. Two development-only advisories are pinned forward in the same pass, so
  `pnpm audit` now reports nothing outstanding at all.
- The owner console has a rendering test harness: real components in a real DOM, asserted on the
  text a person reads, in the one surface that has already shipped a panel nobody could see.
- The commit-msg hook `CONTRIBUTING.md` already described now ships in the repository. It is
  inert until a contributor opts in, and safe to enable on a fork.

### Fixed

- A stat value sized as a magazine pull figure could overlap its neighbour at normal deck widths;
  it is now bounded to the column that holds it and allowed to break onto a second line for a
  long word.

## 0.2.0 (2026-07-25)

The release that made DeckTrail reachable: the install stopped being a checklist, and the model that
writes your deck stopped being a single choice.

### Getting started

- **One command installs everything.** `./scripts/up.sh` on macOS, Linux and WSL;
  `.\scripts\up.ps1` in PowerShell; `scripts\up.bat` from `cmd.exe`. It checks Docker, writes a
  `.env` with a generated database password, starts the stack, waits until the portal answers rather
  than guessing at a delay, builds the command line tool, and prints the one-time link that finishes
  setup. Safe to run again: it will not overwrite a `.env` you have edited and it leaves a running
  stack alone.
- **The port is a setting again.** It was pinned inside `docker-compose.yml` while `.env.example`
  advertised a `PORT` line that did nothing, so a machine with 3000 already busy had no way through
  and no explanation. `./scripts/up.sh --port 3900` now works end to end.
- **The scripts are executable.** Every file in `scripts/` was committed without the executable bit,
  so on a fresh clone on Linux or macOS the documented commands, including both release gates, failed
  with a permission error until you fixed them yourself.

### Writing a deck

- **Steer a deck in one line.** `--prompt "lead with the cost, and keep it to five slides"` is
  guidance for one deck, folded into whichever voice wins. The same notes that produced seven slides
  produce five, with the cost at the front.
- **Read a document you already have.** A PDF, a PowerPoint deck, a Word document, an image or a
  scan, not just prose. Text is preferred to the picture, and a scanned page is read as a picture
  only when it carries no text of its own. `decktrail extract` shows you what was found before you
  spend a model call on it.
- **Scans read better.** Recognition moved to a stronger engine where one is installed, with the
  previous one always present as a fallback. Every result names the engine that produced it, and no
  accuracy threshold in the project is a guess: each one names the measurement that set it.
- **Generation is not tied to one model.** `--provider opencode` reaches a model on your own hardware
  through Ollama, LM Studio or llama.cpp, a free hosted tier, or a provider you already have a key
  for. Your own Claude login stays the default and still needs no key.
- **A routing gateway is one flag.** `--gateway` starts a local gateway, waits until it answers, and
  tells OpenCode how to reach it, merging into your OpenCode configuration rather than replacing it
  and keeping the previous version as a backup.

### Under it

- Ingestion moved to a published, versioned library shared with other projects, so a fix or a
  measurement happens in one place. Behaviour is unchanged and the release gates prove it.
- Line endings are pinned, because a shell script with CRLF fails on Linux and a batch file with LF
  can mis-parse the blocks `cmd.exe` uses.
- Decisions recorded: D25 (a provider seam), D26 and D27 (ingestion and recognition), D28 (the shared
  library), D29 (routing lives in front of DeckTrail, not inside it), D30 (one command, and one line
  of guidance).

### Fixed

- Speaker notes attached to the slide that owns them, rather than to the slide in the same position.
  PowerPoint numbers notes in their own sequence, so notes on slide three could land on slide one.
- The end-to-end gate no longer trips over hyphenated share identifiers, which made roughly two runs
  in five fail for a reason that had nothing to do with the change under test.

## 0.1.0 (2026-07-18)

The first public release, and the whole promise: send a client a branded web deck instead of a file,
and know afterwards what happened to it.

- **A private space per client.** Every recipient gets their own link behind a passwordless sign in.
  No public URL and no anonymous forwarding.
- **A record you can act on.** Who opened it, which parts held them, how far they read, whether they
  finished. Per person and per deck, on your own dashboard.
- **Watermarked at serve time**, to the person reading it, and known AI agents are turned away at the
  door.
- **One engagement, many artifacts.** A grouped landing page per client, gated the same way.
- **Drafted with AI on your own machine**, through your own Claude login, with no API key and with
  your content never reaching the portal.
- **Self-hosted.** Postgres and a container, behind the bundled Caddy or an existing Traefik.

What it does not do has been on the front page since this release, not in a footnote: it does not
prevent a screenshot, a camera or a retype, and it never claims to. `docs/THREAT-MODEL.md` is the
authority on that.
