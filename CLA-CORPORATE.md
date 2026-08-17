# DeckTrail Corporate Contributor Licence Agreement

**Version 1.0.**

> **NOT YET REVIEWED BY COUNSEL.** Drafted carefully and from good sources, and
> **not reviewed by a qualified lawyer**. Said plainly here because an
> unreviewed instrument presented as settled is worse than one that says where
> it stands. Take your own advice.
>
> Its structure follows the Apache Software Foundation's **Corporate
> Contributor Licence Agreement v2.0**, adjusted for the fact that DeckTrail is
> dual-licensed and the ASF's is not. Grafana and Element both build their
> agreements on the ASF's for the same reason: it is the instrument corporate
> legal departments already recognise, which matters more than originality when
> the goal is for somebody's counsel to approve it quickly.

---

## When you need this, and when you do not

**Most contributors do not need this document.** If you are contributing on your
own time, on your own equipment, and your employer has no claim on what you
write, sign the individual agreement in [`CLA.md`](CLA.md) and stop here.

**You need this one as well if any of the following is true:**

- You are contributing as part of your job, or on your employer's time or
  equipment.
- Your employment contract assigns your employer the copyright in code you
  write, which is the default in most employment contracts and in most
  jurisdictions.
- Your employer wants several of its people to contribute without each of them
  separately chasing an internal approval.

**Why this exists at all.** The individual agreement asks you to *represent*
that your employer has either given permission or waived its rights. That
representation is the standard approach and it is what most projects rely on,
but it puts the whole legal weight on one sentence signed by someone who is
usually not authorised to bind their employer. If the representation turns out
to be wrong, the contribution was never licensed and no amount of good faith
fixes it afterwards. This agreement lets the entity that actually owns the
copyright grant the licence itself.

**A corporate agreement does NOT replace the individual one.** Every human who
contributes still signs [`CLA.md`](CLA.md). The two cover different things: this
one covers what the company owns, and that one covers what the person owns and
represents. The ASF requires both for the same reason.

---

## Agreement

This agreement is between **OrbitQube Technologies Private Limited**, a company
incorporated under the Companies Act 2013 (Corporate Identity Number
U85499MR2026PTC478649), referred to as **"OrbitQube"**, **"We"** or **"Us"**,
and the corporation, partnership, limited liability partnership, or other legal
entity identified in the signature block below, referred to as **"You"**.

Except where this agreement says otherwise, the **Definitions (Section 1)**,
**Grant of copyright licence (Section 2)**, **Grant of patent licence (Section
3)**, and **General (Section 8)** of the individual agreement in
[`CLA.md`](CLA.md) version 1.0 apply to this agreement in full, and are
incorporated by reference. Read that document first; this one only states what
differs for an entity.

**In particular, the condition in Section 2.3 of `CLA.md` applies here without
change:** OrbitQube may license Your Contributions commercially only for so long
as it continues to make the corresponding source available to the public under
the GNU Affero General Public Licence version 3 or later. That condition is the
reason a contributor can grant a commercial licence without simply handing over
their work, and it protects a corporate contributor exactly as it protects an
individual one.

### C1. Scheduled employees

**C1.1.** You grant the licences in Sections 2 and 3 of `CLA.md` in respect of
Contributions submitted by any employee, contractor, or agent listed in
**Schedule A** below, to the extent You own or control the rights in those
Contributions.

**C1.2.** You may add people to Schedule A at any time by submitting an updated
version of this agreement, or by a written notice to the address in
[`CLA.md`](CLA.md). Additions take effect when We acknowledge them.

**C1.3.** Removing a person from Schedule A stops this agreement covering their
**future** Contributions. It does **not** withdraw the licence for Contributions
already made, and it cannot: those are already in released software that other
people rely on, and a licence that could be pulled back would make the whole
project unusable. This is the same irrevocability that Section 2 of `CLA.md`
states for individuals.

### C2. Your representations

**C2.1.** You represent that You are legally entitled to grant the licences
above, and that the person signing below is authorised to bind You.

**C2.2.** You represent that each person listed in Schedule A is authorised by
You to submit Contributions on Your behalf.

**C2.3.** You represent that each Contribution submitted under this agreement is
either Your original creation, or that You have the necessary rights in it and
have identified any third-party rights as required by Section 7 of `CLA.md`.

**C2.4.** You are **not** expected to provide support for Your Contributions,
and Section 5 of `CLA.md` ("What you are not promising") applies to You in full.
Contributions are provided as-is, without warranties of any kind.

### C3. Notification

You agree to notify Us in writing if You become aware that any representation
above has become inaccurate. Section 6 of `CLA.md` applies.

---

## How to sign

The mechanism is the same as the individual agreement, and it is a file in the
repository rather than a third-party service, so the record travels with the
code and can be checked by anyone against the git history.

**1. Open a pull request** adding your entity to
[`CLA-SIGNATURES.md`](CLA-SIGNATURES.md) under the corporate section, in this
form:

```
- Example Technologies Pvt Ltd (CIN U12345MH2020PTC000000)
  signed DeckTrail Corporate CLA v1.0 on YYYY-MM-DD
  by: Authorised Signatory Name, Title <email@example.com>
  Schedule A: person-one <a@example.com>, person-two <b@example.com>
```

**2. Send the signed agreement.** Because this binds a company rather than a
person, a pull request alone is not enough: email a copy naming the authorised
signatory to the address in [`CLA.md`](CLA.md), from a domain the company
controls. We will acknowledge it in writing, and only then is it in force.

**3. Every listed person signs `CLA.md` too**, individually. Both are required.

---

## Schedule A

The people authorised to contribute on Your behalf. List each by name and the
email address they will use in their git commits, because that address is how a
contribution is matched to this agreement.

| Name | Git email | Added on |
|---|---|---|
|  |  |  |
