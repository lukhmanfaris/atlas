import path from "node:path";

import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(root, "migrations"));

  return {
    resolve: {
      alias: {
        "@": path.join(root, "src"),
      },
    },
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          // Tests never use the local development sign-in bypass, and get the
          // SQL migrations so each test file starts from the real schema.
          bindings: {
            ENVIRONMENT: "test",
            PDF_RENDERING: "off",
            DEV_AUTH_EMAIL: "",
            ACCESS_TEAM_DOMAIN: "",
            ACCESS_AUD: "",
            TEST_MIGRATIONS: migrations,
          },
        },
      }),
    ],
    test: {
      include: ["tests/worker/**/*.test.ts"],
      setupFiles: ["./tests/worker/apply-migrations.ts"],
    },
  };
});
