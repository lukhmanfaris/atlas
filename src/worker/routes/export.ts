import { Hono } from "hono";

import { requireCompany, requireOwner } from "@/worker/auth/company";
import type { AppEnv } from "@/worker/auth/middleware";
import { apiError } from "@/worker/errors";

export const exportRoutes = new Hono<AppEnv>();

/** Dates go out as DD/MM/YYYY and money as plain ringgit with two decimals, for Excel. */
function csvDate(value: string | null): string {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function csvMoney(sen: number | null): string {
  return sen === null ? "" : (sen / 100).toFixed(2);
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

exportRoutes.get("/documents.csv", requireCompany, requireOwner, async (c) => {
  const type = c.req.query("type") ?? "invoice";
  if (!["quotation", "invoice", "delivery_order"].includes(type)) {
    return apiError(c, 400, "validation_error", "Unknown document type.");
  }

  const from = c.req.query("from")?.trim();
  const to = c.req.query("to")?.trim();
  const conditions = ["d.company_id = ?", "d.type = ?", "d.status != 'draft'"];
  const params: unknown[] = [c.get("company").id, type];

  if (from) {
    conditions.push("d.issue_date >= ?");
    params.push(from);
  }
  if (to) {
    conditions.push("d.issue_date <= ?");
    params.push(to);
  }

  const result = await c.env.DB.prepare(
    `SELECT d.number, d.issue_date, c.name AS customerName, d.status, d.total_sen
     FROM documents d JOIN customers c ON c.id = d.customer_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY d.issue_date ASC, d.number ASC`,
  )
    .bind(...params)
    .all<{
      number: string | null;
      issue_date: string;
      customerName: string;
      status: string;
      total_sen: number;
    }>();

  const rows = result.results ?? [];
  const header = ["Number", "Date", "Customer", "Status", "Total (RM)"];
  const lines = [
    header.map(csvCell).join(","),
    ...rows.map((row) =>
      [
        csvCell(row.number ?? ""),
        csvCell(csvDate(row.issue_date)),
        csvCell(row.customerName),
        csvCell(row.status),
        csvCell(type === "delivery_order" ? "" : csvMoney(row.total_sen)),
      ].join(","),
    ),
  ];

  // The BOM makes Excel read UTF-8 without a manual import step.
  const body = `\uFEFF${lines.join("\r\n")}\r\n`;
  const filename = `atlas-${type}-${from ?? "all"}-${to ?? "all"}.csv`;

  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
});
