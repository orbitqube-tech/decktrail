import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// React Testing Library does not unmount components between tests on its own unless it finds a
// global afterEach; this file imports vitest's directly instead of enabling vitest's globals, to
// stay consistent with how the rest of this package writes its tests (see format.test.ts).
afterEach(() => {
  cleanup();
});
