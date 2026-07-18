# Attribution

Every deck, document, and pricing sheet DeckTrail renders carries a small mark:

> Made with **DeckTrail** by **OrbitQube**

"DeckTrail" links to https://decktrail.com and "OrbitQube" links to https://www.orbitqube.com.

## We ask you to keep it. We do not require it.

The mark is on by default. You can turn it off, and you do not need our permission to do so.
Nothing in the license requires you to display it.

We are asking instead. DeckTrail is free, AGPL-3.0, and self-hosted: there is no trial funnel,
no hosted tier steering people back to us, and no sales team. A consultant who receives your
deck, notices the mark, and follows it is the only way this project reaches the next person who
needs it. If DeckTrail saves you the price of a month of some SaaS subscription, leaving the
mark on is a fair way to pay that forward. If you would rather not, that is genuinely fine, and
you owe us no explanation.

## How to remove it

The mark is a normal configuration value. See the theme and rendering configuration in
`docs/ARCHITECTURE.md`; `renderMadeWith` accepts `null` to omit it entirely, or an object to
replace it with your own.

## Why this is not a license term

An earlier draft of this file mandated the mark under AGPL-3.0 Section 7(b). We checked that
against the license text and the FSF's guidance before publishing, and it did not hold up. The
honest summary:

- Section 7(b) permits requiring preservation of "reasonable legal notices or **author
  attributions**". The FSF reads "author attribution" as identifying **the natural person** who
  wrote the work. "OrbitQube" is a company and "DeckTrail" is a product, so the mark is neither.
- The FSF states plainly that "links leading to different materials are not intended to benefit
  from Sec. 7(b)". Our mark is two links.
- The mark is not an "Appropriate Legal Notice" either. Section 0 defines that term as a
  copyright notice, a no-warranty statement, a statement that licensees may convey the work,
  and how to view the license. Our mark contains none of them.
- Section 2 affirms "unlimited permission to run the unmodified Program". Almost everyone who
  runs DeckTrail self-hosts and conveys nothing, so a Section 7(b) term would not have reached
  them anyway.
- Forbidding you to configure the mark away would have been a "further restriction" under
  Section 10, and Section 7 says you may simply remove such a term.

We could have shipped the term anyway and hoped nobody read it closely. We would rather tell
you what we found. A project asking you to trust it with your client relationships should not
open by overstating its own license.

See `docs/DECISIONS.md` D19 for the full reasoning and the evidence behind it.

## What we do protect

The **names** "DeckTrail" and "OrbitQube", and their logos, are trademarks. Removing the mark
from your own decks is fine. Shipping a modified DeckTrail *called* DeckTrail, or implying
OrbitQube endorses your fork, is not. That distinction is what `TRADEMARK.md` covers, and it is
also the only thing we ask permission for.

The AGPL is a copyright license. It grants no rights in our trademarks, and it never purported
to: **Section 7(e)** exists to confirm that declining to grant trademark rights is compatible
with the license. `TRADEMARK.md` does not add a term to the AGPL and takes nothing back from
it. It stands on trademark law, which is separate from the license and applies whether or not
either document exists.

We nearly got this wrong twice. The first draft of this file mandated the mark under 7(b), and
the paragraph above originally claimed the trademark policy was itself a 7(e) additional term.
It is not, and framing it that way would have been the same mistake in a new place: a
mandatory term dressed as a Section 7 permission is a "further restriction" under Section 10,
which Section 7 lets you delete. We would have handed you a documented right to bin our own
policy.
