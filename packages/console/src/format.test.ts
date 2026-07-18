import { describe, it, expect } from "vitest";
import { ago } from "./format";

describe("ago", () => {
  const now = new Date("2026-07-16T12:00:00Z").getTime();
  it("reads recent times in the right unit", () => {
    expect(ago("2026-07-16T11:59:30Z", now)).toBe("just now");
    expect(ago("2026-07-16T11:40:00Z", now)).toBe("20m ago");
    expect(ago("2026-07-16T09:00:00Z", now)).toBe("3h ago");
    expect(ago("2026-07-13T12:00:00Z", now)).toBe("3d ago");
  });
  it("never goes negative for a future timestamp", () => {
    expect(ago("2026-07-16T12:05:00Z", now)).toBe("just now");
  });
});
