import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Dashboard.tsx and the other views render real DOM, so this suite needs jsdom rather than the
 * node environment the other packages use, which have nothing to mount. The setup file wires
 * jest-dom's matchers into vitest's `expect` and unmounts each render after its test, so one
 * test's tree cannot leak into the next.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
  },
});
