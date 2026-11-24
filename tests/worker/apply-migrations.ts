import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { env } from "cloudflare:workers";

// TEST_MIGRATIONS is injected by vitest.config.ts, so it is not part of the
// generated Env type.
const migrations = (env as unknown as { TEST_MIGRATIONS: D1Migration[] }).TEST_MIGRATIONS;

// Runs before every test file. `applyD1Migrations` only applies migrations that
// have not been applied yet, so calling it repeatedly is safe.
await applyD1Migrations(env.DB, migrations);
