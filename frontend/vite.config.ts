import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

const backend = process.env.NEVU_DEV_BACKEND ?? "http://localhost:3000";
const apiPaths = [
  "/status",
  "/config",
  "/proxy",
  "/dynproxy",
  "/user",
  "/sharing",
  "/libraries",
  "/library-page",
  "/reviews",
  "/discover",
  "/socket.io",
  "/nevu-remote",
];

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: Object.fromEntries(
      ["app", "features", "entities", "shared", "plex"].map((layer) => [
        layer,
        fileURLToPath(new URL(`./src/${layer}`, import.meta.url)),
      ]),
    ),
  },
  server: {
    port: 4000,
    strictPort: true,
    proxy: Object.fromEntries(
      apiPaths.map((path) => [path, { target: backend, ws: true }]),
    ),
  },
  build: {
    outDir: "build",
    target: ["chrome109", "edge109", "firefox115", "safari15.4"],
  },
  test: {
    globals: true,
    environment: "jsdom",
    clearMocks: true,
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
