import { describe, it, expect } from "vitest";
import { fixedWindowLimiter } from "./ratelimit.js";

describe("fixedWindowLimiter", () => {
  it("allows up to the max hits in a window, then blocks", () => {
    let t = 1000;
    const limiter = fixedWindowLimiter(3, 1000, () => t);
    expect(limiter.hit("a")).toBe(true);
    expect(limiter.hit("a")).toBe(true);
    expect(limiter.hit("a")).toBe(true);
    expect(limiter.hit("a")).toBe(false);
  });

  it("tracks keys independently", () => {
    let t = 0;
    const limiter = fixedWindowLimiter(1, 1000, () => t);
    expect(limiter.hit("a")).toBe(true);
    expect(limiter.hit("b")).toBe(true);
    expect(limiter.hit("a")).toBe(false);
  });

  it("resets after the window elapses", () => {
    let t = 0;
    const limiter = fixedWindowLimiter(1, 1000, () => t);
    expect(limiter.hit("a")).toBe(true);
    expect(limiter.hit("a")).toBe(false);
    t = 1000;
    expect(limiter.hit("a")).toBe(true);
  });

  it("does not extend the window on a blocked hit (cooldown semantics)", () => {
    let t = 0;
    const limiter = fixedWindowLimiter(1, 1000, () => t);
    expect(limiter.hit("a")).toBe(true); // window ends at 1000
    t = 500;
    expect(limiter.hit("a")).toBe(false); // blocked, must not push the reset out
    t = 1000;
    expect(limiter.hit("a")).toBe(true); // original window elapsed
  });
});
