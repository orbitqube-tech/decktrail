# Glossary

Every acronym and specialist term used across DeckTrail, with its full form and a plain
explanation. Ordered alphabetically. Written for a reader who is not a specialist.

**AGPL (GNU Affero General Public License).** The open-source license DeckTrail uses. It lets
anyone run, read, and change the code for free, on one main condition: if you modify it and let
other people use it over a network, you must share your changes back under the same license. It
is the strongest of the common "keep it open" licenses.

**API (Application Programming Interface).** A defined way for one program to ask another for
something. DeckTrail's portal exposes an API, for example a request that says "publish this
deck" or "give me the analytics", which the command-line tool and the console call.

**CAPTCHA (Completely Automated Public Turing test to tell Computers and Humans Apart).** A
check that the visitor is a person, not a script. DeckTrail uses Cloudflare Turnstile, a modern
CAPTCHA that is usually invisible, on the sign-in form to slow down automated abuse.

**CDP (Chrome DevTools Protocol).** The interface a program uses to drive the Chrome browser
(open a page, click, take a screenshot). Used only in testing.

**CLI (Command-Line Interface).** A tool you run by typing commands in a terminal rather than
clicking buttons. DeckTrail's `decktrail` CLI validates, renders, generates, and publishes
decks.

**CSS (Cascading Style Sheets).** The language that controls how a web page looks: colors,
fonts, spacing, layout. DeckTrail themes are turned into CSS so one theme reskins every slide.

**CSV (Comma-Separated Values).** A plain text table format that spreadsheets can open. The
console exports the audit log as a CSV.

**DB (Database).** The store where the portal keeps its data (decks, versions, share links,
events, themes). DeckTrail uses PostgreSQL.

**DDoS (Distributed Denial of Service).** An attack that floods a server with traffic from many
machines at once to knock it offline. It is different from ordinary abuse, and a CAPTCHA alone
does not stop it; the defense is at the network edge (Cloudflare).

**DKIM (DomainKeys Identified Mail).** A cryptographic signature added to an email that proves
it genuinely came from your domain and was not tampered with. One of the three checks that
decide whether an email reaches the inbox or the spam folder.

**DMARC (Domain-based Message Authentication, Reporting and Conformance).** A policy you publish
that tells receiving mail servers what to do when an email claiming to be from your domain fails
its checks: allow it, mark it as spam, or reject it.

**DNS (Domain Name System).** The internet's address book, translating a name like
decktrail.com into the numeric address of the server behind it. Email authentication records
(SPF, DKIM, DMARC) live in DNS.

**ESP (Email Service Provider).** A service built to send email reliably (for example Amazon
SES, Resend, Postmark). Sending through one, rather than straight from your own server, is the
usual way to make sure your email reaches the inbox.

**GDPR (General Data Protection Regulation).** The European data-protection law. It governs how
you may collect and use personal data. DeckTrail's approach is to collect the minimum, keep it
on the operator's own infrastructure, and never track a client's viewers.

**HMAC (Hash-based Message Authentication Code).** A way to stamp a piece of data with a secret
key so you can later confirm it has not been altered and was issued by you. DeckTrail signs its
login sessions this way.

**HTML (HyperText Markup Language).** The language web pages are written in. Every DeckTrail
deck is a single self-contained HTML file.

**IR (Intermediate Representation).** DeckTrail's own structured format for a deck, document, or
pricing sheet, written as JSON. Content is authored once as IR, and the renderers turn it into
HTML. Keeping content separate from how it looks is what lets one deck reskin to any brand.

**IST (Indian Standard Time).** The time zone used in India.

**JSON (JavaScript Object Notation).** A simple, readable text format for structured data, made
of names and values. DeckTrail's IR is JSON.

**MVP (Minimum Viable Product).** The smallest version of something that is genuinely useful, so
you can put it in front of real users before building more.

**OSS (Open-Source Software).** Software whose source code is public and free to use and modify.
DeckTrail is open source under the AGPL.

**PAT (Personal Access Token).** A secret string that stands in for a password when a program
authenticates to a service such as GitLab. It is never shared or printed.

**SMTP (Simple Mail Transfer Protocol).** The standard language email servers use to hand
messages to each other. DeckTrail sends its sign-in links over SMTP, through whatever mail
service you configure.

**SPA (Single-Page Application).** A web app that loads once and then updates in place as you
click, rather than reloading a new page each time. DeckTrail's owner console is a SPA.

**SPF (Sender Policy Framework).** A DNS record listing which servers are allowed to send email
for your domain. The first of the three inbox checks (with DKIM and DMARC).

**SSO (Single Sign-On).** Logging in once to reach several applications. DeckTrail deliberately
avoids it, using a simpler passwordless sign-in link instead.

**TLS (Transport Layer Security).** The encryption that protects data in transit, the "s" in
https. DeckTrail serves everything over TLS.

**TTL (Time To Live).** How long something stays valid before it expires. A DeckTrail sign-in
link has a short TTL, so it works once and only for a while.

**UA (User Agent).** The line a browser or bot sends identifying itself. DeckTrail reads it to
block known AI and scraper agents and to record who tried to scrape a deck.

**URL (Uniform Resource Locator).** A web address, for example the per-recipient link to a
gated deck.
