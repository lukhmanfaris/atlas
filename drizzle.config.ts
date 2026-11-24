import { defineConfig } from "drizzle-kit";

// Only generates SQL migrations. Applying them is Wrangler's job
// (`npm run db:migrate:local`), so no database credentials are needed here.
export default defineConfig({
  schema: "./src/worker/db/schema.ts",
  out: "./migrations",
  dialect: "sqlite",
  strict: true,
  verbose: true,
});
