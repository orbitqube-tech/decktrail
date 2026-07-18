# Quickstart

**Goal:** in about fifteen minutes, a deck that only one named person can open, watermarked to
them, with you able to see when they read it.

Everything runs on your machine. Nothing is sent anywhere.

**You need:** Docker, and about 2GB free. Node 24 and pnpm only if you want to generate decks
with AI (step 5).

---

## 1. Get it running

```sh
git clone https://github.com/orbitqube-tech/decktrail
cd decktrail
cp .env.example .env
```

Open `.env` and set one value:

```sh
POSTGRES_PASSWORD=pick-something-long-and-random
```

That is the only setting that is required. Everything else has a working default, and the
secrets generate themselves on first boot.

```sh
docker compose up -d
```

Two containers start: Postgres, and the portal. Give it about twenty seconds.

## 2. Find your setup link

```sh
docker compose logs portal | grep setup
```

```
DeckTrail is not set up yet. Open this to finish, and keep it to yourself:
http://localhost:3000/setup?token=4pa3XVotf6yHj9ngWOHvhTwNBTPdOTLN
```

**Open that URL.**

> **Why a token?** Setup decides who the administrator is, and at that moment there is nobody
> to ask. Without this, whoever reached your portal first would become its admin. Reading the
> log means being on the box, which is the only proof of "operator" available before an admin
> exists. The token is burned the moment setup finishes.
>
> Lost the log? `docker compose restart portal` prints it again.

## 3. Finish setup

| Field | What to put | Required |
|---|---|---|
| **Admin email** | Your own. This is who owns the portal. | Yes |
| **Brand name** | Your company. Your clients see this. | No |
| **SMTP fields** | Leave blank for now. See step 4. | No |
| **Share anonymous usage** | Your call. Off by default. [What it sends](05-configuration.md#telemetry). | No |

Press **Finish setup**. You land on your console.

## 4. Sign in

You are not signed in yet, so the console shows a sign-in screen. Enter your admin email and
press the button.

**No email will arrive.** You left SMTP blank, so the portal logs the link instead of sending
it. That is deliberate: a fresh install works with zero mail configuration.

```sh
docker compose logs --since 2m portal | grep magic-link
```

Open the link it prints. You are in.

> Mail is worth setting up before you use this for real. It is [step 2 of Going
> live](06-going-live.md#2-send-real-email), and it has one rule that matters more than the
> rest: **never send mail from the app's own host.** It will land in spam.

## 5. Make a deck

**If you have Claude Code** (a Pro or Max subscription, already logged in), DeckTrail can write
the deck for you from your notes. It runs on your machine, on your subscription. There is no
API key and the portal never sees your content.

```sh
pnpm install
pnpm -r build
cd packages/studio && npm link && cd ../..   # puts the decktrail CLI on your PATH

decktrail generate notes.md --client acme --out deck.json
```

> Prefer not to link it globally? Every `decktrail` command below is the same as
> `node packages/studio/dist/cli.js`, so `node packages/studio/dist/cli.js generate ...` works
> without the link step.

**If you do not**, write the JSON yourself. It is not hard, and
[Writing a deck](02-writing-decks.md) has the full shape. The smallest deck that works:

```json
{
  "id": "d1",
  "title": "A proposal",
  "slug": "a-proposal",
  "workspace": "acme",
  "kind": "slide-deck",
  "slides": [
    { "id": "s1", "layout": "cover", "heading": "A proposal", "sub": "For Acme" },
    { "id": "s2", "layout": "bullets", "heading": "What we would build",
      "items": ["Intake", "Scheduling", "Reporting"] }
  ]
}
```

Check it before you send it:

```sh
decktrail validate deck.json     # valid: slide-deck
decktrail render deck.json --out preview.html   # open it and look
```

> `workspace` is **the client this deck is for**, not you. It is how the console groups your
> decks once you have more than a handful.

## 6. Send it

```sh
decktrail push deck.json \
  --portal http://localhost:3000 \
  --token "$(grep '^DT_ADMIN_TOKEN=' .env | cut -d= -f2-)" \
  --recipient user@decktrail.orbitqube
```

```
published: artifact art_bm-KbHy0CT9d, version 1
share: http://localhost:3000/d/shr_HKRBVjspyK_jSO9b
```

That URL is **the deck, for that person, and nobody else.** Send it to them however you
normally send things.

> **DeckTrail does not email it for you.** `--recipient` creates the link and lets that address
> sign in; you still send the link yourself. This is a real gap and we know it.

## 7. Be your own client

This is the part worth doing. Open the share URL in a **private window**.

1. You get a sign-in page wearing **your** brand, not ours.
2. Enter the recipient address. Only that address can open this deck.
3. Grep the log for their link, open it, and you land **on the deck**.
4. Look closely: it is tiled with their address and the timestamp. That is the watermark, and
   it is drawn at serve time, not baked into a file.

Now go back to your console. Their read is on your dashboard: who, when, which slides, how far
they got.

## 8. Try the thing that should not work

Still signed in as yourself, open the client's share link in your **normal** window.

> This page is not available

Your own portal will not show you a deck that was shared with someone else. That is the whole
product in one refusal.

---

## What you just proved

- A deck opens for **one named person**, and the link is worthless to anyone else.
- It is **watermarked to whoever is reading it**, at the moment they read it.
- You can see **what they did with it**.
- All of it ran **on your machine**. No account, no upload, nobody else's server.

## Next

- [Writing a deck](02-writing-decks.md) for every layout and the other artifact kinds.
- [Your brand and your voice](03-brand-and-voice.md) to make it look and read like you.
- [Going live](06-going-live.md) when you want a real domain and real email.
- [What it cannot do](../THREAT-MODEL.md) before you trust it with a real client.
