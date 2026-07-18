import { describe, it, expect } from "vitest";
import { createSession, readSession } from "./session.js";
import { InMemorySessionStore } from "./stores.js";
import { sign, verifySigned, constantTimeEqual } from "../crypto.js";

/**
 * readSession is the gate on every deck the portal serves. It was exercised only through
 * happy paths and one revocation test: nothing asserted that an expired cookie is refused,
 * or that a tampered signature is. A regression dropping either check would have left the
 * whole suite green while every deck on the portal became readable with a forged cookie.
 *
 * That is the same shape as the resolveContent bug this audit followed: the function holding
 * the promise, tested only where it says yes.
 */

const SECRET = "0123456789abcdef0123456789abcdef";
const TTL = 60_000;

async function session(now = 0) {
  const store = new InMemorySessionStore();
  const cookie = await createSession(store, SECRET, "user@decktrail.orbitqube", "orbitqube", TTL, now);
  return { store, cookie };
}

describe("readSession says yes", () => {
  it("returns the identity for a valid, unexpired cookie", async () => {
    const { store, cookie } = await session(0);
    expect(await readSession(store, SECRET, cookie, 1_000)).toEqual({
      email: "user@decktrail.orbitqube",
      workspace: "orbitqube",
    });
  });

  it("carries the workspace the session was created with", async () => {
    const store = new InMemorySessionStore();
    const cookie = await createSession(store, SECRET, "admin@decktrail.orbitqube", "acme", TTL, 0);
    expect((await readSession(store, SECRET, cookie, 0))?.workspace).toBe("acme");
  });
});

describe("readSession says no", () => {
  it("refuses an expired session, exactly at the boundary and beyond", async () => {
    const { store, cookie } = await session(0);
    expect(await readSession(store, SECRET, cookie, TTL - 1)).not.toBeNull(); // still inside
    expect(await readSession(store, SECRET, cookie, TTL)).not.toBeNull(); // expiresAt is not yet past
    expect(await readSession(store, SECRET, cookie, TTL + 1)).toBeNull(); // past: refused
  });

  it("refuses a revoked session even while it is unexpired", async () => {
    const { store, cookie } = await session(0);
    await store.revokeByEmail("user@decktrail.orbitqube", "orbitqube");
    expect(await readSession(store, SECRET, cookie, 1_000)).toBeNull();
  });

  it("refuses a cookie signed with a different secret", async () => {
    const { store, cookie } = await session(0);
    expect(await readSession(store, "a-completely-different-secret-value", cookie, 0)).toBeNull();
  });

  it("refuses a tampered signature", async () => {
    const { store, cookie } = await session(0);
    const [payload, sig] = [cookie.slice(0, cookie.lastIndexOf(".")), cookie.slice(cookie.lastIndexOf(".") + 1)];
    const flipped = `${payload}.${sig.slice(0, -1)}${sig.at(-1) === "a" ? "b" : "a"}`;
    expect(await readSession(store, SECRET, flipped, 0)).toBeNull();
  });

  it("refuses a tampered payload, so a session id cannot be swapped", async () => {
    const { store, cookie } = await session(0);
    const sig = cookie.slice(cookie.lastIndexOf(".") + 1);
    expect(await readSession(store, SECRET, `someoneelsessid.${sig}`, 0)).toBeNull();
  });

  it("refuses an unsigned value, and an empty or absent cookie", async () => {
    const { store } = await session(0);
    expect(await readSession(store, SECRET, "justasid", 0)).toBeNull();
    expect(await readSession(store, SECRET, "", 0)).toBeNull();
    expect(await readSession(store, SECRET, undefined, 0)).toBeNull();
  });

  it("refuses a well-signed cookie whose session is not in the store", async () => {
    // A correct signature is not authority on its own: the session must still exist.
    const store = new InMemorySessionStore();
    expect(await readSession(store, SECRET, sign(SECRET, "never-created"), 0)).toBeNull();
  });
});

describe("the signing primitives underneath", () => {
  it("round-trips a value", () => {
    expect(verifySigned(SECRET, sign(SECRET, "abc"))).toBe("abc");
  });

  it("returns null rather than the payload when the signature is wrong", () => {
    expect(verifySigned(SECRET, "abc.notarealsignature")).toBeNull();
  });

  it("returns null for a value carrying no signature at all", () => {
    expect(verifySigned(SECRET, "abc")).toBeNull();
  });

  it("keeps a payload containing dots intact, splitting on the last one", () => {
    expect(verifySigned(SECRET, sign(SECRET, "a.b.c"))).toBe("a.b.c");
  });

  it("compares in constant time without throwing on length mismatch", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "abcd")).toBe(false); // must not throw
    expect(constantTimeEqual("", "")).toBe(true);
  });
});
