import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * The console is served by the portal under /admin, so the build is based there and assets
 * resolve relatively. In dev, requests to the portal API are proxied to a local portal.
 */
export default defineConfig({
  base: "/admin/",
  plugins: [react()],
  server: {
    proxy: {
      "/admin/analytics": "http://localhost:3000",
      "/admin/events.csv": "http://localhost:3000",
      "/auth": "http://localhost:3000",
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
