import { Hono } from "hono";

import { requireIdentity, type AppEnv } from "@/worker/auth/middleware";
import { requireUser } from "@/worker/auth/user";
import { apiError } from "@/worker/errors";

import { companyRoutes } from "./routes/companies";
import { customerRoutes } from "./routes/customers";
import { exportRoutes } from "./routes/export";
import { documentPdfRoutes } from "./routes/document-pdf";
import { auditRoutes } from "./routes/audit";
import { documentRoutes } from "./routes/documents";
import { itemRoutes } from "./routes/items";
import { meRoutes } from "./routes/me";
import { memberRoutes } from "./routes/members";

const app = new Hono<AppEnv>();

app.get("/api/health", (c) => c.json({ ok: true }));

app.route("/api/me", meRoutes);

// Everything under /api/companies needs a verified Access token mapped to an
// app user. Company membership is checked per route, either from the
// X-Company-Id header or the :companyId URL parameter.
app.use("/api/companies", requireIdentity, requireUser);
app.use("/api/companies/*", requireIdentity, requireUser);

app.route("/api/companies", companyRoutes);
app.route("/api/companies", memberRoutes);

app.use("/api/customers", requireIdentity, requireUser);
app.use("/api/customers/*", requireIdentity, requireUser);
app.route("/api/customers", customerRoutes);

app.use("/api/items", requireIdentity, requireUser);
app.use("/api/items/*", requireIdentity, requireUser);
app.route("/api/items", itemRoutes);

app.use("/api/documents", requireIdentity, requireUser);
app.use("/api/documents/*", requireIdentity, requireUser);
app.route("/api/documents", documentRoutes);
app.route("/api/documents", documentPdfRoutes);

app.use("/api/audit-log", requireIdentity, requireUser);
app.use("/api/audit-log/*", requireIdentity, requireUser);
app.route("/api/audit-log", auditRoutes);

app.use("/api/export", requireIdentity, requireUser);
app.use("/api/export/*", requireIdentity, requireUser);
app.route("/api/export", exportRoutes);

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
