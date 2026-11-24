import { Hono } from "hono";

import type { AppEnv } from "@/worker/auth/middleware";
import { apiError } from "@/worker/errors";

import { meRoutes } from "./routes/me";
import { memberRoutes } from "./routes/members";

const app = new Hono<AppEnv>();

app.get("/api/health", (c) => c.json({ ok: true }));

app.route("/api/me", meRoutes);

// Company-scoped routes; the company comes from the X-Company-Id header.
app.route("/api/companies", memberRoutes);

app.notFound((c) => apiError(c, 404, "not_found", "Not found."));

app.onError((error, c) => {
  console.error("Unhandled error", {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    path: new URL(c.req.url).pathname,
  });
  return apiError(c, 500, "internal_error", "Something went wrong.");
});

export default app;
