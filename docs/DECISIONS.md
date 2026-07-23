# Settled decisions

Every settled decision, and why. These supersede anything elsewhere in the repo that contradicts
them. Add new decisions here rather than editing history: several of these were reversed after
evidence, and the reversal is recorded beside the original rather than replacing it, because the
reasoning is the useful part.

This is the one document that talks about how DeckTrail got here. Everywhere else describes the
product as it is.

**The prior art** is the bespoke system DeckTrail generalises: a hand-built deck portal serving a
handful of clients, with the brand, the watermark and the design opinions hardcoded into every
file. It is referenced where a decision only makes sense against what came before. You have not
seen it and do not need to; DeckTrail exists because that system could not be given to anybody
else.

---

## D1. AI generation runs on the user's machine first, in the server later

**Decision:** Phased. Version 1 ships a Claude Code skill plus a command line tool that
runs on the user's own machine, using the Claude subscription they already have. It
emits finished deck content and pushes it to their portal. The server holds no language
model key and runs no agent loop. Version 2 adds an in server worker so a non technical
user can do the same thing from a browser.

**Why:** Keeps the server small, auditable, and cheap to self host. No token storage, no
cost control, no job queue, no prompt injection surface from uploaded files, in version 1.
Matches the free tier first, no vendor markup principle. Also produces two artifacts that
can each gain attention independently.

**Cost accepted:** Version 1 is unusable by a freelancer who does not use Claude Code.
That is most of the target market. This is why the public launch waits for the web studio
or at least a very good CLI onboarding.

---

## D2. Umami is out of the core

**Decision:** Per recipient and per slide analytics live in the portal's own Postgres,
built on the existing events table pattern. Umami becomes an optional plugin for
aggregate marketing traffic only. It is not a dependency and it is not in the default
compose file.

**Why:**
1. Umami is anonymous by design. It is privacy first web analytics that deliberately
   refuses person level tracking. The prior art gets identity only by stuffing viewer
   email into an event property bag, which fights the tool's data model and puts
   personally identifiable information into a system with no subject access or deletion
   story. That is a GDPR (General Data Protection Regulation) liability.
2. The portal's own events table is already the audit source of truth. The prior art's
   own documentation calls Umami "just the pretty dashboard".
3. Setup cost. Keeping Umami means two compose projects, two Postgres instances, a
   Traefik forward auth hop, a cookie scoped to the parent domain, and a manual first
   run where the user logs in as admin/umami, changes the password, creates a website,
   copies a UUID (universally unique identifier) into a .env file, and restarts. That is
   fatal to a five minute setup promise, and setup time is the viral mechanic.

**What we build instead:** a slide_view beacon plus a per recipient engagement timeline.
Small. Roughly one table and one dashboard page.

---

## D3. Licence is AGPL-3.0, with an optional commercial licence

**Decision:** AGPL-3.0 for the portal and the studio. Reserve the right to sell a
commercial licence later for users who cannot accept AGPL terms.

**Why:** Stops a funded competitor taking the code and running a closed hosted service
on it, while keeping the self host path completely free. Leaves an open core business
available later. Same licence as Papermark, the closest competitor, so it is a proven
choice in this exact category.

**Cost accepted:** Slightly fewer stars than MIT, and some corporate users will not touch
AGPL code.

---

## D4. Ingestion re-authors, it does not convert

**Decision:** We never promise fidelity when importing PPTX or PDF. The promise is:
upload your content, we extract the substance and rebuild it in your brand, in our
layouts.

**Why:** Faithful PowerPoint import is a multi year engineering tarpit that has consumed
entire companies. Every user uploads their worst deck and judges the product on it.
Reframing from convert to re-author makes the hardest engineering problem in the project
disappear, and it is also a better product. Nobody wants their ugly 2019 PowerPoint
faithfully preserved. They want it to stop looking like a 2019 PowerPoint.

---

## D5. Positioning is deterrence, attribution, detection. Never prevention.

**Decision:** The product never claims to be AI proof, screenshot proof, or theft proof.
The public claim is three words: deterrence, attribution, detection.

**Why:** Anything a human eye can read, a camera can capture and OCR (optical character
recognition) can lift. This is not solvable, and the prior art conceded it in writing before
DeckTrail existed. Overclaiming prevention is the single fastest way to get the project publicly
discredited on launch day. Being honest about the limit is the credibility play, and honesty is
why people will trust the parts that do work.

See `THREAT-MODEL.md` for what each of the three words actually buys.

---

## D6. The deck intermediate representation is the core abstraction

**Decision:** A deck is a JSON document (the IR, intermediate representation) plus a
theme and a voice profile. Two renderers read the same IR: one produces a self contained
standalone HTML file, one produces a per slide, per recipient portal stream.

**Why:** The prior art authors decks as hand written self contained HTML files with the
theme and logo baked in as literals. That is directly incompatible with every headline
feature: reskinning to another brand, per recipient watermarking, per slide streaming,
and generating personalised variants at scale. The IR is the pivot the whole product
hangs off. See `ARCHITECTURE.md`.

---

## D7. The generator picks layouts, it does not write CSS

**Decision:** A fixed library of roughly fifteen named layouts with named slots. The
language model chooses a layout and fills its slots. It never emits CSS and never
invents structure.

**Why:** It cannot produce ugly output if it cannot produce novel output. It cannot
hallucinate a broken flexbox. It also guarantees every deck is reskinnable, because
every layout reads from the same theme tokens. This is the quality moat.

---

## D8. Fresh repo, lifting the auth module from the prior art

**Decision:** This is a new repository, not a mutation of the live production system.
The magic link authentication core is carried over close to verbatim. Everything else is
rebuilt.

**Why:** The prior art is live and four real clients depend on it. The IR change touches
the serving path, the content path, and the theming, which is most of the code. The auth
core is the one part that is genuinely good and worth keeping: HMAC (hash based message
authentication code) tokens, single use with an atomic claim, hashed at rest, and a
neutral response so invite lists never leak.

**Status:** Settled. The auth core is lifted from an existing magic-link implementation, and the
maintainer's own production portal runs on the open-source product rather than a separate fork, so
the product is dogfooded on real client use rather than a demo.

---

## D9. V1 generation is subscription-only and runs on the freelancer's own machine

**Amended by D25**, which adds a second generation backend. The half of this decision that
governs the server is unchanged and is the load-bearing half: the portal still runs no
generation and holds no agent loop. What D25 changes is the claim that Claude Code is the
*only* backend on the freelancer's machine. Read the two together.

**Decision:** Refines D1. In version 1 the only way to generate deck content is a
Claude Code login on the freelancer's own machine (a Claude Pro or Max
subscription, authenticated once with `claude login`). There is no application
programming interface (API) key path in version 1, and the portal server runs no
generation and holds no agent loop. The command line tool or skill runs locally,
emits the deck intermediate representation (IR), and pushes it to the portal
(Shape 1). Server-side one-click generation from a browser is deferred to version 2.

**Why:**
1. **Keeps the server small and safe to self host on a shared box.** No key
   storage, no agent loop, no prompt-injection surface from uploaded files, no
   job queue. This is the property that lets the portal co-exist with
   money-critical containers on the same machine.
2. **The subscription is the free path.** Generation runs through the Claude Code
   harness on a machine the freelancer has logged in; the product never handles or
   stores the credential, and never replays a subscription token against the raw
   API itself. Cost to the freelancer is zero beyond the subscription they already
   pay for.
3. **Subscription rate limits are an acceptable natural throttle** for a freelancer
   making occasional decks, and are surfaced honestly rather than hidden.

**Consequences:**
- **Onboarding step 0 for every self hoster:** install Claude Code, run
  `claude login`. Stated plainly in the docs.
- **Settles how providers are adapted in version 1.**
  Claude Code only reaches Claude, so subscription-only means Claude-only in
  version 1 by construction. No multi-provider adapter abstraction is built yet.
- **Fail closed:** if Claude Code is not logged in or the subscription has lapsed,
  generation fails with a clear message, never a silent stall.

**Cost accepted:** version 1 is unusable by a freelancer who does not use Claude
Code, which is most of the target market. This is the same cost D1 already
accepted, and it is why the public launch waits for version 2 or a very good
command line onboarding.

**The one thing still to verify (deferred, not blocking):** whether a subscription
entitlement can be driven headlessly server-side, and the precise Anthropic
Terms-of-Service line for using a subscription inside a self-hosted tool. The Shape 1
architecture (generation always through the Claude Code harness on a logged-in
machine) holds regardless of the answer, so this is not a blocker.

---

## D10. Decks are versioned as immutable snapshots, and client links pin to the version sent

**Decision:** Every deck carries a version history. Each version is an immutable,
append-only snapshot of the deck intermediate representation (IR, the JSON document
from D6). A client share link pins to the exact version it was created for: revising
a deck never changes what a client who already has a link sees, until the freelancer
deliberately sends the newer version. Everything is recorded in the portal's own
Postgres for a durable audit trail.

**What gets stored:**
- **`deck_version` table (immutable, append-only).** One row per version, holding the
  full IR snapshot, a `parent_version`, the author, the created-at timestamp (in Indian
  Standard Time where surfaced), the source (`generated` or `hand-edited`), and an
  optional one-line changelog note. A sent version is never mutated; editing produces a
  new version.
- **Change history is a computed diff** between two snapshots, produced on read. Diffs
  are never the source of truth; the full snapshots are.
- **Versioning unit is the whole deck** for the minimum viable product, not per slide.
  Per-slide history is deferred as a possible later refinement.
- **The view events table (D2) gains a `version_id` column.** Every view is stamped with
  the version the viewer actually saw, so the per-recipient engagement timeline can show
  which version each open hit.
- **Every send and every revision is recorded** as its own audit event (who, what
  version, when), so the trail answers "what did this named person see, and when" with
  precision.

**Why:**
1. **It is the core traceability promise made real.** The product's whole thesis is
   attribution: proving how your content is used after you send it. Pinned versions plus
   a version-stamped audit trail let you prove exactly what a specific person saw at a
   specific time. Floating "always latest" links would change the content underneath the
   viewer and quietly break that promise.
2. **The IR makes it nearly free.** Because the deck of record is a small JSON document
   rather than hand-written HTML, a version is just an immutable JSON snapshot and the
   rendered HTML is always regenerated from a chosen version. This mirrors the
   git-and-release discipline already used across the projects: the IR is the versioned
   artifact, renders are rebuilt, and the audit record is append-only.

**Storage home:** the portal's own Postgres (the D2 events-table pattern), not a git
repository per deck.

**Still to thread through:** `ARCHITECTURE.md` needs a versioning section describing the
`deck_version` table, the pinned-link resolution path, and the `version_id` stamp on view
events.

---

## D11. Build end to end, dogfood for one to two weeks, then launch publicly

**Decision:** Build the product end to end (portal,
generation, and the guard/versioning features) as a working whole first. Use it on
real OrbitQube engagements for one to two weeks as a soak period. Only then launch
publicly. The public launch lands on the differentiated story (AI-extraction defence
plus honest tracking), never on the commodity "another Papermark" story.

**Why:** You get one Hacker News front page; spending it on a worse Papermark wastes
it. A short but real self-use soak surfaces the rough edges before strangers see
them, and matches the operator-owned "enable, soak, go live" discipline: the public
launch is a deliberate step taken after the thing has proven itself in your own hands,
never auto-triggered.

**Cost accepted:** later time to first star than launching at P0, and it front-loads
more build before any external validation. Q4 (does the market feel the AI-extraction
fear) should be answered during this window, not after, so a two-week soak also
doubles as a validation window.

---

## D12. Voice ships as presets with a neutral default, and the tool carries a configurable backlink

**Decision:** The OrbitQube house style ships as one named voice preset among
several. New users default to a neutral voice profile, so every user's first deck
sounds like them, not like the maintainer. The code, the Claude Code skill, and generated
output carry a "made with" backlink to a website; the backlink target is a
configurable setting with one authoritative home, never a hardcoded value.

**Why:** The entire purpose of this project is removing the hardcoded OrbitQube
brand from the prior art. Defaulting every user's voice to the OrbitQube style, or
hardcoding an OrbitQube backlink, would reintroduce exactly the problem the project
exists to fix. The rules are good, so they stay available as a preset; they are not
the silent default. The backlink is how the next person finds the project (see the
"sent with" mark) and, per the no-hardcoded-values rule, lives in config so a
self-hoster can point it at their own site or remove it.

**Resolved:** the backlink is on by default as the marketing mechanism,
defaults to the product's own site under the product name, never hardcoded to OrbitQube, and is
removable and repointable by the self-hoster because it lives in config. The maker credit is "by OrbitQube", so
discovering the tool markets the company. This project is deliberately also a
marketing vehicle for OrbitQube; the de-branding applies to the deck output, the
maker credit points home. See D14 for the related watermark-configurability decision.

---

## D13. New URL convention, and existing decks migrate with zero client-facing downtime

**Decision:** New decks use an improved, brand-neutral URL scheme. Existing decks
keep their current URLs by migrating onto the new system, and that migration is a
zero-downtime cutover.

**New URL scheme:**
- **Host:** a configurable base host, never hardcoded. Where a portal replaces an existing one,
  the old host is kept serving so that links already sent to clients keep resolving.
- **Owner console (readable):** `/<workspace>/<deck-slug>` and
  `/<workspace>/<deck-slug>/v<n>` for a specific version. Only the owner sees these.
- **Recipient share link (opaque):** `/d/<shareId>`, an unguessable ID that resolves
  to the version sent (pinned per D10), carries the per-viewer watermark, and is
  magic-link gated. A forwarded or pasted link leaks nothing about the workspace, the
  other clients, the deck subject, or the version.
- Analytics stays at `/analytics`.

**Existing-deck migration (zero downtime):**
- Each existing deck is imported into the new system as a versioned deck, and the old
  paths (for example `/acme/decks`) are aliased so they resolve to the imported
  deck's pinned version. One system, one codebase; the old links keep working. This is
  the OrbitQube migration confirmed in D8 made concrete.
- **No client-facing downtime is a hard requirement.** The cutover is verified
  additively first: prove the new system serves every legacy URL identically in
  isolation (a `Host:` header smoke test before any route flip), tag a rollback point,
  then cut over in a low-traffic window (night, Indian Standard Time, when clients are
  not accessing the URLs), keeping the old system as an instant rollback. Rollback is a
  single `docker compose down` on the new project; nothing shared is touched.

---

## D14. The per-viewer watermark content and format are configurable, never assumed

**Decision:** The watermark the portal injects into every served page is defined by
self-hoster settings, not hardcoded. The fields it shows, its format, and the
confidentiality label are all configuration with one authoritative home.

**Why:** The prior art hardcodes "email + timestamp + Confidential" into the serving
layer. That is exactly the kind of hardcoded assumption this project exists to remove.
A self-hoster in a different industry, jurisdiction, or brand needs to set what the
watermark says and how it looks. The default stays a sensible per-viewer traceable
stamp (identity plus timestamp plus a confidentiality label), because per-viewer
attribution is the real protection control (see `THREAT-MODEL.md`), but every token is
overrideable. No hardcoded values.

---

## D15. The product is named DeckTrail

**Decision:** The product is named **DeckTrail**. It leads
with the tracing door (D5): the name evokes the trail of what happens to your
content after you share it, which is attribution and traceability, never prevention. The
canonical repository is `https://github.com/orbitqube-tech/decktrail`.

**Consequences:**
- The working-codename phase is over. All documents and code use DeckTrail from here.
- The product carries its own neutral brand, openly "by OrbitQube" (D12). The de-branding
  applies to the deck output; the maker credit points home.

**Stack and build:** TypeScript monorepo (a shared IR package, a
Fastify portal, a React owner console, PostgreSQL, a single Docker Compose, local CI, and
generation via the Claude Agent SDK on the user's Claude Code login per D9). TypeScript is
sufficient for every wave, with one honestly-flagged exception: per-recipient font cmap
scrambling in the guard wave may want a small, isolated, CPU-capped Python (`fonttools`)
helper, decided at Wave 3 after trying TypeScript first. Build proceeds in waves: Foundation,
Studio, Guard, then migrate-and-soak.

---

## D16. The IR is a three-mode pack model with typed escape hatches

**Decision:** Refines D6 and D7, following a validation against 29 real artifacts. The
intermediate representation (IR) is expanded from a lone slide deck to a **pack**: a
client engagement that contains one or more **artifacts**. An artifact is one of:

- a **slide deck** (full-viewport slides, one layout per slide),
- a **scrolling document** (long-form, built from content blocks),
- a **hub** (an auto-generated index that ties the pack together),
- an **interactive tool** (the live-editable pricing/commercials tool).

Two further refinements the corpus forced:

- **Typed escape hatches (refines D7).** The generator remains constrained to layouts
  and slots, and never emits CSS or invents structure. But the IR additionally carries
  two typed escape-hatch blocks for imported and captured content the generator does not
  author: `image` (a raster asset with alt text and caption) and `figure` (raw inline
  SVG or a constrained HTML fragment for bespoke charts and diagrams). Without these,
  screenshots cannot be carried at all and the existing decks cannot migrate faithfully.
- **Rich text and per-artifact theme.** Slots are not plain strings: headings, ledes,
  bodies, and table cells carry a small constrained rich-text vocabulary (emphasis,
  strong, code, link, highlight span). Theme is per artifact, not global.

**Why:** The live corpus of 29 artifacts is roughly half scrolling documents, and a
single engagement is a mixed pack (a deck plus a document plus a pricing tool behind a
hub). The v0.1 slide-only "structural six" could not express half of it. See
`IR-SPEC.md` for the expanded slide and document catalogs, and
the slot and token gaps.

---

## D17. Wave 1 builds the Pack MVP

**Decision:** Wave 1 (Foundation) builds enough to author and migrate one complete
client proposal pack, not just a slide deck:

- the **pack** model and the **hub**,
- **slide mode** with the frequency-ranked layouts: bullets (heading + lede + list, the
  most common), cover, close, card-grid, table, steps, statement, comparison, callout,
  timeline, swimlane, flowchart, tool-visual, chart, stat-grid,
- a **minimal real document mode**: prose-section, long-table, code-block, image,
- the **interactive pricing tool**,
- both **escape hatches** (image, figure) per D16.

**Deferred to fast-follows:** the specialised document blocks that appear mainly in
One client's internal engineering docs, not the client proposal path: ADR (architecture
decision record), test-case/scenario, status-matrix, procedure, walkthrough-step,
commercial-arithmetic, source-note, ranked-list, two-panel, horizon-roadmap, gallery,
toc, known-gaps, audience-box.

**Why:** D11 requires dogfooding on a real engagement before launch, and a real
engagement is a mixed pack. The "structural six" was not enough to express even one.
The Pack MVP is the true minimum that lets a full engagement be authored and migrated.

---

## D18. Magic-link abuse protection is layered: Turnstile, app rate limiting, and a Cloudflare edge rule

**Decision:** Protect the magic-link request endpoint (`POST /auth/request`) with three
complementary layers, all on free tiers:

1. **Cloudflare Turnstile** (a CAPTCHA, Completely Automated Public Turing test to tell
   Computers and Humans Apart, alternative) on the request form. The server verifies the
   returned token before issuing or sending a link, and fails closed on any error. Raises
   the cost of scripting the form.
2. **App-level rate limiting** in the portal: a per-IP request cap and a per-email cooldown
   (anti email-bombing), keyed on the real client IP (`CF-Connecting-IP`). Origin-side, so
   it holds even if the origin is hit directly, past the edge.
3. **A Cloudflare edge rate-limit rule** plus Bot Fight Mode, staged for the operator
   (dashboard config, a one-way step). This is the volumetric-DDoS layer.

**Turnstile over reCAPTCHA (revalidate on a pricing or plan change):**

| Factor | Cloudflare Turnstile | Google reCAPTCHA |
|---|---|---|
| Cost | Free, no meaningful cap at our scale | Free to 10,000 assessments per month per organization, then paid |
| Account | No credit card | Requires a credit card on a Google Cloud account, for any version |
| Privacy | No personal data collected, fits privacy-by-default | Sends viewer data to Google |
| Fit | Same vendor as the existing Cloudflare edge | A new Google dependency |

**The honest limitation:** a CAPTCHA stops automated abuse of the form, but it does not stop
a volumetric DDoS (distributed denial of service) by itself, because a flood never solves the
challenge yet still reaches the server. The DDoS control is the Cloudflare edge (layer 3); the
app rate limit (layer 2) is the origin backstop.

**Config:** `DT_TURNSTILE_SITEKEY` and `DT_TURNSTILE_SECRET` (verification is off when the
secret is unset, so local dev and a fresh install still work), `DT_RATELIMIT_IP_MAX`,
`DT_RATELIMIT_IP_WINDOW_MS`, `DT_EMAIL_COOLDOWN_MS`. The public sitekey is served to the login
form at `GET /auth/config`.

**Operator runbook (layer 3, Cloudflare edge):**

1. In the Cloudflare dashboard for the serving zone, add a Rate Limiting rule on the request
   path (for example `/auth/request`): a sane per-IP rate (for example 10 per minute), action
   Managed Challenge or Block.
2. Enable Bot Fight Mode under Security, Bots.
3. Keep Under Attack mode as a break-glass toggle for an active flood.
4. The portal already reads the real viewer IP from `CF-Connecting-IP`, so the app-level
   limits stay accurate behind the proxy.

---

## D19. Attribution is protected by trademark and a strong default, not by a license mandate

**Decision:** The rendered attribution mark stays **"Made with DeckTrail by OrbitQube"**, with
two links: DeckTrail to `https://decktrail.com` and OrbitQube to `https://www.orbitqube.com`.
It ships on by default and the README asks people to keep it. It is **not** mandated by the
license, and an operator may remove it without asking anyone.

Protection comes from three places instead:

1. **A Section 7(e) trademark declination.** AGPL-3.0 Section 7(e) permits a term "declining
   to grant rights under trademark law for use of some trade names, trademarks, or service
   marks". This is the FSF's own recommended mechanism for this goal.
2. **A published trademark policy** (`TRADEMARK.md`). This, not the license, is what stops a
   fork shipping under the DeckTrail name or trading on OrbitQube's reputation.
3. **A good default plus a social norm.** The FSF is explicit that asking is fine: "Asking
   people modifying the software to retain other information, such as a link or logo is fine
   as a request."

**Reverses the mandate in the first version of this decision.** That version required the mark
under an **AGPL-3.0 Section 7(b)** additional term. It was vetted against the AGPL projects
above 20,000 GitHub stars, and it failed on five independent grounds:

| Claim in the old term | What the license and the FSF actually say |
|---|---|
| The mark is an "Appropriate Legal Notice" | Section 0 defines that term as copyright notice + no-warranty statement + license notice + how to view the license. Our mark has **none of the four**. |
| A 7(b) "author attribution" | FSF, Jan 2026: "'Author attribution' is an identification of the **natural person** who is the author." OrbitQube is a company; DeckTrail is a product. |
| Two hyperlinks carry the attribution | FSF, Jan 2026: "**links leading to different materials are not intended to benefit from Sec. 7(b)**." |
| It binds a self-hoster | Section 2: "This License explicitly affirms your **unlimited permission to run the unmodified Program**." A 7(b) term attaches through conveying. Self-hosters are our entire user base, so the term reached nobody who mattered. |
| "You may not configure it away" | Not within 7(b), therefore a "further restriction" under Section 10, therefore removable under Section 7 paragraph 4: "**you may remove that term**." Self-defeating. |

The mark also sits in the software's **output**, which Section 2 reaches only "if the output,
given its content, constitutes a covered work", and the GPL FAQ pre-describes our exact
mechanism: "if that copied text serves no practical purpose, the user could simply delete that
text from the output". The counter-argument, that a rendered deck embeds our CSS and
JavaScript and is therefore a covered work, is one we must **not** make: it would mean every
consultant's confidential client deck is an AGPL-licensed work, which contradicts the gating
promise the product is built on.

**Evidence:** zero of the AGPL projects above 20,000 stars use a Section 7 attribution term.
Immich (108K), Grafana (76K), MinIO (61K), Mastodon (50K), Nextcloud (36K) and Plausible (28K)
all ship byte-identical canonical AGPL and protect their names with trademark policies. The
7(b) badge users are SuiteCRM (5.6K) and ONLYOFFICE (6.7K), and ONLYOFFICE is currently being
publicly rebuked by both the FSF and the Software Freedom Conservancy for precisely the clause
we had drafted. Nextcloud and IONOS forked it and stripped the branding, and both bodies backed
their right to do so. Dify (149K) wanted a logo clause and left open source to get one.

**Why this is also the better commercial call, not just the safer one.** The mandate existed to
drive virality. Both live attempts at enforcing an AGPL badge produced the opposite: forks,
public denunciation, and reputational damage landing on the licensor. For a product whose pitch
is trust and traceability, being the next name in that sentence would cost more than the badge
could ever return.

**Cost, stated honestly:** we give up any legal grip on badge removal. A default plus a request
is all we have. The evidence says a good default retains the large majority of installs anyway,
and the alternative was a term that was unenforceable against self-hosters regardless.

**Supersedes** the mandate reading. This restores and confirms D12: the mark is a configurable,
removable default.

---

## D20. Trademark is the protection mechanism, and it must be registered

> **Status: registration deferred.** The project launches on unregistered
> common-law marks and register later. The consequence to be aware of, not a reason to
> reverse it: until the registrations exist, D19's protection rests entirely on passing off,
> which Section 27(1) below makes a materially weaker instrument in India than infringement
> of a registration. The exposure grows with adoption, because the mark becomes worth taking
> at exactly the point we are least able to defend it.

**Decision:** Register **DeckTrail** and **OrbitQube** as trademarks in India in **Class 9**
(downloadable and self-hosted software) and **Class 42** (software as a service, plus software
design and development). Government fee is ₹4,500 per class per mark when e-filing as an
individual, startup, or small enterprise, so ₹9,000 per mark for both classes, excluding
attorney fees. India has been a Madrid Protocol member since 8 July 2013, so an Indian
registration can serve as the basic mark for later international extension. A US registration
is $350 per class, filed electronically.

**Why it is now load-bearing:** D19 moves all attribution protection onto trademark. An
unregistered mark still has rights (India preserves passing off at Section 27(2) of the Trade
Marks Act 1999), but Section 27(1) is blunt: "No person shall be entitled to institute any
proceeding to prevent, or to recover damages for, the infringement of an **unregistered** trade
mark." Unregistered means no infringement suit at all in India, only passing off, which
requires proving goodwill, misrepresentation, and damage. That is a far heavier lift, and our
goodwill in a brand-new name is near zero.

**The trademark policy is not optional either.** *FreecycleSunnyvale v. Freecycle Network* is
the warning: fail to exercise quality control over downstream use of your mark and you can lose
it to naked licensing. An AGPL project whose name travels with every fork is structurally
exposed, so `TRADEMARK.md` is part of the protection, not decoration.

**Note:** open-source distribution does establish common-law trademark rights in the US.
*Planetary Motion, Inc. v. Techsplosion, Inc.*, 261 F.3d 1188 (11th Cir. 2001): "The
distribution of the Software for end-users over the Internet satisfies the 'use in commerce'
jurisdictional predicate", and "the existence of sales or lack thereof does not by itself
determine whether a user of a mark has established ownership rights therein." One circuit,
2001, and it requires use "sufficiently public" to build recognition. A repo nobody installs
earns nothing.

---

## D22. DeckTrail moves under OrbitQube Technologies Private Limited

**Decision:** DeckTrail's IP sits under **OrbitQube Technologies Private Limited**. `CLA.md`
Section 1 names the company as the counterparty, and the partnership firm
is not mentioned anywhere in the public repository: the sequencing this decision hoped for held,
so the CLA is company-named before the repo is public and before anyone signs. The table below is
retained as the reasoning, and because it is the record of what incorporation resolved.

**Why this settles rather than defers the problem.** Checking the partnership firm as the CLA
counterparty found three things drafting cannot fix, and incorporation fixes all three at once:

| Problem | Partnership firm | Private limited |
|---|---|---|
| Suit on a contract while unregistered | **Barred**, Section 69(2), Indian Partnership Act 1932 | Not applicable |
| Separate legal person | **No.** A firm is a compendious name for the partners (*Dulichand Laxminarayan v. CIT*, AIR 1956 SC 354) | Yes |
| Perpetual succession | **No.** Dissolves on a partner's death or insolvency (s.42), or one partner's written notice (s.43) | Yes |
| Partner liability | **Unlimited, joint and several** (s.25). No veil exists to pierce | Limited |

The liability point is the sharpest one for this project specifically: open core deliberately
strips the AGPL's warranty disclaimer on the paid side, and the partnership form removes the
liability shield on that same side.

**No migration to do.** Because the CLA names the company from the outset, no contribution is
ever accepted under a firm-named CLA, so there is no chain of title to reassign to the company
later, and nothing for diligence to question.

**Also fixed while checking this, and independent of the entity:** the copyright grant now
states its duration and territory expressly. Section 19(5) of the Copyright Act 1957 deems an
assignment of unstated duration to be **five years**, s.19(6) presumes an unstated territory to
be India only, s.19(4) deems unexercised rights lapsed after a year, and s.30A applies s.19 to
licences. Whether s.30A reaches a gratuitous open-source licence is unsettled with no case law
either way, so the grant says perpetual, worldwide, full term including renewals and
reversions, and no-lapse, rather than relying on the answer. The moral rights clause is recast
from waiver to consent, because s.57 rights subsist "even after the assignment" and a blanket
waiver is widely regarded as unenforceable in India (*Amar Nath Sehgal v. Union of India*,
Delhi HC, 2005).

**Resolved:** OrbitQube Technologies Private Limited is incorporated (its Corporate Identity
Number is recorded in `CLA.md`), so the earlier partnership-firm registration question is moot:
the CLA counterparty is the company from the outset, and no contribution is ever accepted under a
firm-named agreement.

---

## D23. A workspace is a client

**Decision:** A workspace identifies the **client or engagement** a deck belongs to, exactly as
the folder names did in the prior art (one folder per client).

**What follows from it, and is now enforced in code:**

| Surface | Rule |
|---|---|
| Publish | Takes the workspace from the IR. The generator must put the client there. |
| Invites | Created under the artifact's workspace. |
| Sessions | Take the workspace from the invite, looked up by email. |
| Owner reads (artifacts, themes, analytics, CSV) | **Span every client** by default; `?workspace=` narrows. |
| Writes (assign, delete, update) | Key on the row's own **id**, and take no workspace at all. |
| Access to a deck | Decided by the share's **recipient**, never by the workspace. |

**Why this needed deciding at all.** Four bugs in one session came from the same root: the
workspace is set from the IR on publish, from the invite on login, and was *guessed* as
`"default"` on every surface that could see neither. Every guess was silent and wrong:

1. `push --recipient` published, then 404'd minting the share.
2. A recipient could never sign in. Their invite sat under the deck's workspace and
   `/auth/request` looked in `"default"`, so the neutral response refused them forever.
3. The owner's analytics dashboard showed nothing while a client was reading the deck.
4. The console's Brand tab listed no artifacts, so no theme could be assigned.

**The rule that prevents the next one:** a workspace is an *organising* label, never an access
check. Nothing is protected by it; things are protected by the share's recipient
(`content.ts`) and the admin session. So a read may span workspaces safely, and a write should
never be scoped by one, because an id is already unique and a guessed workspace in a predicate
can only hide a row that exists.

**Handled by `--client`:** `decktrail generate --client <name>` writes the client into
`workspace`, so a client deck lands under that client. Only when `--client` is omitted does the
generator infer the sender, in which case all such decks land in one grouping, which is harmless
but makes the per-client view useless. Always pass `--client` for a client deck.

---

## D24. The hub is a portal-served, per-recipient gated landing

**Decision:** A pack's hub (the grouped, card-based index of a client engagement) is published,
served, and gated by the portal exactly like any other artifact, not only rendered as a local
standalone file. Sharing a pack to a recipient mints, in one command, a hub share plus a share
for each artifact the pack references, all to that recipient. Opening the hub link, behind the
same passwordless sign-in and the same recipient gate as any artifact, renders a watermarked
index whose tiles link to that recipient's own gated share for each artifact.

**Why:** The pack and hub existed in the IR with a standalone renderer, but the portal did not
recognise a pack on publish (400), had no serve branch for it (404), and had no watermarked hub
renderer, so a client could not open a grouped, gated engagement landing. That is the natural
completion of the pack model and the "one engagement, one link" experience a consultant needs.

**What was built:**
- `renderPortalHub` (the watermarked, anti-copy hub variant), alongside the standalone `renderHub`.
- Publish recognises the `pack` kind (its `id` is its slug, since a pack is a manifest, not an
  ArtifactMeta, and has no slug of its own).
- `content.ts` gains a pack branch: it resolves, for the hub's recipient, the live share of each
  referenced artifact, drops any the recipient was not shared, and renders the hub with tiles
  pointing only at `/d/<shareId>` for that recipient. The recipient gate that protects a single
  artifact protects the index; a forwarded hub link 404s for anyone else, and no slug-based or
  ungated path is ever exposed.
- `createShare` is pack-aware: sharing a pack mints the hub share and a share per referenced
  artifact, to the same recipient. A referenced artifact not yet published simply gets no share
  and is dropped from that recipient's hub.

**Consequences:** the artifacts of an engagement must be published before the pack is shared, so
the pack's slug references resolve. Generation is unchanged (decks only); the pack manifest and
the non-deck artifacts are hand-authored JSON, and the hub is a deterministic projection of the
pack, not an AI generation.

**Verified end to end:** publish two artifacts, share the pack, open the hub as the recipient
(watermarked, tiles resolve to the recipient's shares), click through to a gated artifact,
unauthenticated open returns the sign-in page, and a different recipient opening the hub link
gets the not-available page.

---

## D25. Generation has a provider seam, and OpenCode is the second backend

**Decision:** Amends D9. Generation is no longer bound to one model backend. It moves out of the
command line tool into its own package, `packages/generate`, behind a `GenerationProvider`
interface, and ships with two implementations:

| Provider | What it runs | What it costs | Needs a key |
|---|---|---|---|
| `claude` (default) | the `claude` command line tool in print mode, on your own Claude Code login | nothing beyond the subscription | no |
| `opencode` | the `opencode` command line tool | whatever its configured model costs, and there are genuinely free ones | depends on the model |

`claude` stays the default. At stock settings DeckTrail generates exactly as it did before, and
every other backend is something the operator opted into by name.

**Why:**
1. **Version 1 was unusable without a Claude subscription**, which D9 accepted as a cost and
   which is most of the target market. OpenCode reaches a model running on your own machine
   (Ollama, LM Studio, llama.cpp), its own zero-cost tier, and hosted free tiers. That removes
   the paywall from the one feature that had one.
2. **The seam was already there and was being duplicated instead.** The repair loop, the schema
   validation and the workspace rule are identical whatever writes the JSON, and the prompt is
   the same words either way. One interface below them is smaller than a second copy beside them.
3. **The portal is unaffected.** This is deliberately the half of D9 that does not move: no
   generation, no agent loop and no key storage on the server, which is what lets the portal sit
   on a shared machine next to workloads that matter.

**Consequences:**
- **The "no API key" claim is now conditional and must be written that way.** It is still true
  of the default and of a local model. It is not true of a hosted free tier, which needs a key
  configured in OpenCode, not in DeckTrail. Nothing in this repository may state it flatly.
- **DeckTrail never holds a model credential.** Which provider OpenCode talks to, and with what
  key, is OpenCode's own configuration on the operator's machine. DeckTrail spawns a command and
  reads its output.
- **A smaller model needs a bigger repair budget.** The retry count, the timeout and the model
  are settings rather than constants, because the right values differ per backend.
- **Output quality is the operator's to judge.** A local model writes a visibly different deck
  from the same content, so the tool prints which backend and which model ran before it starts.

**Verified against a real install (OpenCode 1.18.4), not against its documentation,** which is
silent or wrong on all three points: `opencode run` reads a piped stdin even though only a
positional message argument is documented; stdout carries the model's text alone, with the
progress chrome on stderr; and `--format json` emits raw session events rather than model output,
so it is the wrong flag here. On Windows the tool installs as an npm shim, which Node refuses to
execute directly, so the spawn helper resolves the command through PATH and uses a shell only for
`.cmd` and `.bat`.
