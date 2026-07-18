# Sending a deck and tracking it

You have a validated deck. This is how it reaches one named person, carries their name while they
read, and reports back to you.

---

## Publish and share

```sh
decktrail push deck.json \
  --portal http://localhost:3000 \
  --token "$(grep '^DT_ADMIN_TOKEN=' .env | cut -d= -f2-)" \
  --theme theme.json \
  --recipient user@decktrail.orbitqube
```

```
published: artifact art_bm-KbHy0CT9d, version 1
share: http://localhost:3000/d/shr_HKRBVjspyK_jSO9b
```

Two things happened. The deck was **published** as an immutable version in its workspace, and a
**share** was minted for that one recipient. The share URL (`/d/<shareId>`) is opaque: a
forwarded or pasted link leaks nothing about the workspace, your other clients, or the deck
subject, and it opens for nobody but the invited address.

> **DeckTrail does not email the deck for you.** `--recipient` mints the share and lets that
> address sign in, but you still send the link yourself. This is a real, known gap. Recipients
> can also request their own link at the share URL.

Publish the same slug again and you get **version 2**, not a duplicate. A share pins to the exact
version it was created for, so revising a deck never changes what a client who already holds a
link sees, until you deliberately send the newer version (decision D10).

---

## How a client opens it

1. They open the share URL and see a sign-in page wearing **your** brand.
2. They enter their address. Only the invited address is accepted; the response is identical for
   an uninvited one, so the invite list never leaks.
3. They get a one-time magic link (by email once you have mail set up, see
   [Going live](06-going-live.md#2-send-real-email); on a fresh local install it is printed in
   the portal log).
4. They click it and land on the deck, tiled with their address and the timestamp. That
   watermark is drawn at serve time, per viewer, not baked into a file, so a screenshot or a
   photo carries their name with it.

What the watermark shows (identity, timestamp, a confidentiality label) and how it looks are
configurable; see [Configuration](05-configuration.md).

---

## Send a whole engagement as one link

A client engagement is usually more than one deck: a technical proposal, a commercial proposal
(a pricing tool), perhaps a document. You can group them behind one branded landing, the hub, and
send the client a single link.

1. **Publish each artifact first** (without a recipient), so the pack can reference them by slug:

   ```sh
   decktrail push technical.deck.json  --portal <url> --token "$TOKEN"
   decktrail push commercial.tool.json --portal <url> --token "$TOKEN"
   ```

2. **Write a `pack.json` manifest** listing them by slug (see [Writing a deck](02-writing-decks.md)
   and `examples/acme.pack.json`).

3. **Share the pack in one command:**

   ```sh
   decktrail push acme.pack.json --portal <url> --token "$TOKEN" --recipient client@acme.example
   ```

   This mints, for that person, the hub link plus a gated share for each artifact, and prints the
   hub URL.

The client opens that one link, signs in once, and lands on their branded index. Each card opens a
gated, watermarked artifact, and every open is tracked. The hub is gated to the recipient exactly
like an artifact: a forwarded hub link opens for nobody else, and it never shows an artifact the
recipient was not shared.

## What you see afterwards

Sign in to `/admin` as the owner. The dashboard answers "who read what, and how far":

- **Headline counts:** deck opens, unique viewers, sign-ins, and scrape attempts.
- **Opens over time:** every time a recipient opened one of your decks.
- **Most opened:** which decks get read.
- **Who is reading:** each recipient, their open count, and when they were last seen.
- **Tripwire:** requests from known AI and crawler agents, refused at the door with a 403 and
  logged against the attempt.
- **Audit log (CSV):** the full event trail to export.

Every view is stamped with the exact version the viewer saw, so the record answers "what did this
named person see, and when" with precision.

By default the dashboard spans every client. Narrow it to one with `?workspace=<client>`.

---

## The honest limit

Tracking is attribution and detection, never prevention. A determined person can screenshot,
photograph the screen, or retype the deck, and nothing here stops that. What you get is a leak
with a name on it and a record of who had it open. Read [what it cannot do](../THREAT-MODEL.md)
before you trust this with a real client; it is the honest floor, stated plainly.

## Next

- [Going live](06-going-live.md) to serve on a real domain with real email.
- [Troubleshooting](07-troubleshooting.md) if a link does not arrive or a client cannot sign in.

---

<!-- guide-nav -->
**The guide:** [← Your brand and your voice](03-brand-and-voice.md) · [All docs](../README.md) · [Configuration →](05-configuration.md)
