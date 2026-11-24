import { Hono } from "hono";

import { requireCompany, requireOwner } from "@/worker/auth/company";
import type { AppEnv } from "@/worker/auth/middleware";
import { apiError } from "@/worker/errors";

export const auditRoutes = new Hono<AppEnv>();

const PAGE_SIZE = 50;

auditRoutes.get("/", requireCompany, requireOwner, async (c) => {
  const page = Math.max(1, Number(c.req.query("page") ?? "1") || 1);
  const companyId = c.get("company").id;

  const result = await c.env.DB.prepare(
    `SELECT a.id, a.action, a.entity, a.entity_id AS entityId, a.detail,
            a.at, u.email AS userEmail, u.name AS userName
     FROM audit_log a
     JOIN users u ON u.id = a.user_id
     WHERE a.company_id = ?
     ORDER BY a.at DESC
     LIMIT ? OFFSET ?`,
  )
    .bind(companyId, PAGE_SIZE + 1, (page - 1) * PAGE_SIZE)
    .all();

  const rows = result.results ?? [];

  return c.json({
    entries: rows.slice(0, PAGE_SIZE),
    page,
    hasMore: rows.length > PAGE_SIZE,
  });
});

auditRoutes.get("/:entryId", requireCompany, requireOwner, async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT a.id, a.action, a.entity, a.entity_id AS entityId, a.detail,
            a.at, u.email AS userEmail, u.name AS userName
     FROM audit_log a JOIN users u ON u.id = a.user_id
     WHERE a.company_id = ? AND a.id = ?`,
  )
    .bind(c.get("company").id, c.req.param("entryId"))
    .first();

  if (!row) {
    return apiError(c, 404, "not_found", "Audit entry not found.");
  }
  return c.json({ entry: row });
});
