import { fileURLToPath } from "node:url";

import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["tests/worker/**/*.test.ts"],
  },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        // Tests never use the local development sign-in bypass.
        bindings: {
          ENVIRONMENT: "test",
          DEV_AUTH_EMAIL: "",
          ACCESS_TEAM_DOMAIN: "",
          ACCESS_AUD: "",
        },
      },
    }),
  ],
});
