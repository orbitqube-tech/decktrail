# Security

DeckTrail gates access to documents and attributes leaks to people. A hole in it is not an
inconvenience, it is the product failing at the one thing it claims. Reports are welcome and taken
seriously.

## Reporting a vulnerability

**Do not open a public issue for a security problem.** A gated-access bug is useful to an attacker
for exactly as long as it is unpatched, and a public issue is an announcement.

Email **info@orbitqube.com** with "DeckTrail security" in the subject. Include:

- what you found, and where (a file and line, a route, or a request that shows it),
- what an attacker gets from it,
- how to reproduce it, ideally the smallest case that does.

You will get an acknowledgement within a few days. If a report is valid, you will be told when a
fix lands, and credited in the release notes unless you would rather not be. There is no bounty:
this is a free, self-hosted project, and the honesty is the whole offer.

## What is in scope

The code in this repository: the portal, the renderers, the studio CLI, the IR schemas, and the
console. The kinds of finding that matter most:

- A deck reaching anyone other than its named recipient.
- A magic link, session, or setup token that can be forged, reused, or guessed.
- Content injected through the IR that escapes the renderer's allowlist and runs in a viewer's
  browser.
- Anything served to a client that reaches a host the operator did not configure.

## What is not a vulnerability

These are documented properties, not bugs. `docs/THREAT-MODEL.md` is the authority, and it is
blunt about the limits.

- **A screenshot, a photograph of the screen, or retyping.** DeckTrail deters and attributes; it
  does not prevent. A phone pointed at a monitor defeats every control here, and nothing claims
  otherwise.
- **Anti-copy friction being bypassed.** It is CSS and a keydown handler, and developer tools
  beat it in seconds. It is deterrence against the careless, described as exactly that.
- **A patient scraper reading a whole deck.** A deck is one HTML document today; per-slide
  streaming is designed and not built, and the threat model says so.

If you are unsure whether something is in scope, email rather than guess. A report that turns out
to be a known limit still tells us the documentation was not clear enough.

## Running it safely

- Send mail through an authenticated provider, never straight from the app's host, or links land
  in spam and your setup is harder to trust.
- Put the portal behind TLS. The session cookie is `Secure` by default, so it will not survive
  plain HTTP.
- Keep `DT_TRUST_PROXY_HEADER` off unless a proxy you control genuinely sets the client IP, or the
  rate limiter can be walked past with a forged header.
- The first-run setup token is printed to the container log. Treat the log as it deserves: whoever
  reads it can claim the portal until setup completes.
