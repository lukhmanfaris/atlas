import { and, eq } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { uuidv7 } from "uuidv7";
import type { ZodError } from "zod";

import {
  createQuotationSchema,
  updateQuotationSchema,
  voidDocumentSchema,
} from "@/shared/documents";
import { requireCompany, requireOwner } from "@/worker/auth/company";
import type { AppEnv } from "@/worker/auth/middleware";
import { createDb } from "@/worker/db/client";
import { findCompany } from "@/worker/db/companies";
import { findCustomer } from "@/worker/db/customers";
import {
  createDraft,
  deleteDraft,
  findDocument,
  findLines,
  listDocuments,
  replaceLines,
  toTotalsLines,
  updateDraftHeader,
} from "@/worker/db/documents";
import { auditLog, documents } from "@/worker/db/schema";
import { apiError } from "@/worker/errors";
import { amountInWords } from "@/worker/services/amount-in-words";
import { addDays, todayInMalaysia } from "@/worker/services/dates";
import { companySnapshot, customerSnapshot } from "@/worker/services/documents";
import { issueDocumentNumber } from "@/worker/services/numbering";
import { ensureStoredPdf, ensureVoidPdf, puppeteerRenderer } from "@/worker/services/pdf";
import { computeTotals } from "@/worker/services/totals";

export const documentRoutes = new Hono<AppEnv>();

function validationDetails(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

async function readJson(c: Context<AppEnv>): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

function withExpired<T extends { status: string; validUntil: string | null }>(row: T) {
  return {
    ...row,
    expired:
      row.status === "issued" && row.validUntil !== null && row.validUntil < todayInMalaysia(),
  };
}

async function detail(c: Context<AppEnv>, documentId: string) {
  const db = createDb(c.env.DB);
  const companyId = c.get("company").id;
  const document = await findDocument(db, companyId, documentId);
  if (!document) return null;
  const lines = await findLines(db, documentId);
  return { ...withExpired(document), lines };
}

documentRoutes.get("/", requireCompany, async (c) => {
  const type = c.req.query("type") ?? "quotation";
  if (type !== "quotation" && type !== "invoice" && type !== "delivery_order") {
    return apiError(c, 400, "validation_error", "Unknown document type.");
  }

  const rows = await listDocuments(createDb(c.env.DB), c.get("company").id, {
    type,
    status: c.req.query("status")?.trim() || undefined,
    q: c.req.query("q")?.trim() || undefined,
  });

  return c.json({ documents: rows.map(withExpired) });
});

documentRoutes.post("/", requireCompany, async (c) => {
  const parsed = createQuotationSchema.safeParse(await readJson(c));
  if (!parsed.success) {
    return apiError(
      c,
      400,
      "validation_error",
      "Check the quotation and try again.",
      validationDetails(parsed.error),
    );
  }

  const db = createDb(c.env.DB);
  const companyId = c.get("company").id;

  const customer = await findCustomer(db, companyId, parsed.data.customerId);
  if (!customer || customer.isArchived === 1) {
    return apiError(c, 400, "validation_error", "Choose an active customer.", [
      { path: "customerId", message: "Customer not found in this company." },
    ]);
  }

  const company = await findCompany(db, companyId);
  const validUntil =
    parsed.data.validUntil ?? addDays(parsed.data.issueDate, company?.quotationValidityDays ?? 30);

  const created = await createDraft(db, {
    companyId,
    userId: c.get("user").id,
    type: "quotation",
    customerId: parsed.data.customerId,
    issueDate: parsed.data.issueDate,
    validUntil,
    notes: parsed.data.notes ?? null,
    terms: parsed.data.terms ?? null,
    discountSen: parsed.data.discountSen ?? 0,
    lines: parsed.data.lines,
  });

  const body = await detail(c, created.id);
  return c.json({ document: body }, 201);
});

documentRoutes.get("/:documentId", requireCompany, async (c) => {
  const body = await detail(c, c.req.param("documentId"));
  if (!body) {
    return apiError(c, 404, "not_found", "Document not found.");
  }
  return c.json({ document: body });
});

documentRoutes.patch("/:documentId", requireCompany, async (c) => {
  const db = createDb(c.env.DB);
  const companyId = c.get("company").id;
  const documentId = c.req.param("documentId");

  const document = await findDocument(db, companyId, documentId);
  if (!document) {
    return apiError(c, 404, "not_found", "Document not found.");
  }
  if (document.status !== "draft") {
    return apiError(c, 409, "invalid_state", "An issued document cannot be edited.");
  }

  const parsed = updateQuotationSchema.safeParse(await readJson(c));
  if (!parsed.success) {
    return apiError(
      c,
      400,
      "validation_error",
      "Check the quotation and try again.",
      validationDetails(parsed.error),
    );
  }

  if (Object.keys(parsed.data).length === 0) {
    return apiError(c, 400, "validation_error", "Nothing to update.");
  }

  if (parsed.data.customerId) {
    const customer = await findCustomer(db, companyId, parsed.data.customerId);
    if (!customer || customer.isArchived === 1) {
      return apiError(c, 400, "validation_error", "Choose an active customer.", [
        { path: "customerId", message: "Customer not found in this company." },
      ]);
    }
  }

  const effectiveLines = parsed.data.lines ?? (await findLines(db, documentId));
  const discountSen = parsed.data.discountSen ?? document.discountSen;
  const totals = computeTotals(toTotalsLines(effectiveLines), discountSen, 0);

  if (parsed.data.lines) {
    await replaceLines(db, documentId, parsed.data.lines);
  }

  await updateDraftHeader(db, companyId, documentId, {
    ...(parsed.data.customerId ? { customerId: parsed.data.customerId } : {}),
    ...(parsed.data.issueDate ? { issueDate: parsed.data.issueDate } : {}),
    ...(parsed.data.validUntil !== undefined ? { validUntil: parsed.data.validUntil } : {}),
    ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
    ...(parsed.data.terms !== undefined ? { terms: parsed.data.terms } : {}),
    discountSen,
    subtotalSen: totals.subtotalSen,
    totalSen: totals.totalSen,
    updatedAt: Date.now(),
  });

  const body = await detail(c, documentId);
  return c.json({ document: body });
});

documentRoutes.delete("/:documentId", requireCompany, async (c) => {
  const db = createDb(c.env.DB);
  const document = await findDocument(db, c.get("company").id, c.req.param("documentId"));

  if (!document) {
    return apiError(c, 404, "not_found", "Document not found.");
  }
  if (document.status !== "draft") {
    return apiError(c, 409, "invalid_state", "Only a draft can be deleted. Void an issued document instead.");
  }

  await deleteDraft(db, c.get("company").id, document.id);
  return c.body(null, 204);
});

documentRoutes.post("/:documentId/issue", requireCompany, async (c) => {
  const db = createDb(c.env.DB);
  const companyId = c.get("company").id;
  const documentId = c.req.param("documentId");
  const user = c.get("user");

  const document = await findDocument(db, companyId, documentId);
  if (!document) {
    return apiError(c, 404, "not_found", "Document not found.");
  }
  if (document.status !== "draft") {
    return apiError(c, 409, "invalid_state", "This document has already been issued.");
  }

  const lines = await findLines(db, documentId);
  if (lines.length === 0) {
    return apiError(c, 409, "invalid_state", "Add at least one line before issuing.");
  }

  const company = await findCompany(db, companyId);
  const totals = computeTotals(toTotalsLines(lines), document.discountSen, 0);
  const issuedAt = Date.now();
  const validUntil =
    document.validUntil ?? addDays(document.issueDate, company?.quotationValidityDays ?? 30);

  // Freeze exactly what the PDF will show.
  await db
    .update(documents)
    .set({
      customerSnapshot: JSON.stringify(await customerSnapshot(c.env.DB, document.customerId)),
      companySnapshot: JSON.stringify(await companySnapshot(c.env.DB, companyId)),
      validUntil,
      subtotalSen: totals.subtotalSen,
      taxSen: 0,
      totalSen: totals.totalSen,
      amountInWords: amountInWords(totals.totalSen),
      updatedAt: issuedAt,
    })
    .where(and(eq(documents.companyId, companyId), eq(documents.id, documentId)));

  const auditStatement = c.env.DB.prepare(
    `INSERT INTO audit_log (id, company_id, user_id, action, entity, entity_id, detail, at)
     VALUES (?, ?, ?, 'document.issue', 'document', ?, ?, ?)`,
  ).bind(
    uuidv7(),
    companyId,
    user.id,
    documentId,
    JSON.stringify({ type: document.type }),
    issuedAt,
  );

  const issued = await issueDocumentNumber(c.env.DB, {
    companyId,
    documentId,
    type: "quotation",
    issueDate: document.issueDate,
    issuedAt,
    issuedBy: user.id,
    extraStatements: [auditStatement],
  });

  if (!issued) {
    return apiError(c, 409, "invalid_state", "This document has already been issued.");
  }

  // Browser Run failing must never undo the issue (spec.json -> F-06).
  try {
    if ((c.env.PDF_RENDERING as string) === "off") {
      throw new Error("PDF rendering is switched off");
    }
    await ensureStoredPdf(
      { d1: c.env.DB, r2: c.env.FILES, render: puppeteerRenderer(c.env) },
      { companyId, documentId },
    );
  } catch (error) {
    console.error("PDF generation deferred", {
      documentId,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const body = await detail(c, documentId);
  return c.json({ document: body });
});

documentRoutes.post("/:documentId/void", requireCompany, requireOwner, async (c) => {
  const parsed = voidDocumentSchema.safeParse(await readJson(c));
  if (!parsed.success) {
    return apiError(
      c,
      400,
      "validation_error",
      "A reason is required to void a document.",
      validationDetails(parsed.error),
    );
  }

  const db = createDb(c.env.DB);
  const companyId = c.get("company").id;
  const documentId = c.req.param("documentId") ?? "";

  const document = await findDocument(db, companyId, documentId);
  if (!document) {
    return apiError(c, 404, "not_found", "Document not found.");
  }
  if (!["issued", "accepted", "rejected"].includes(document.status)) {
    return apiError(c, 409, "invalid_state", "Only an issued document can be voided.");
  }

  const at = Date.now();
  await db.batch([
    db
      .update(documents)
      .set({
        status: "void",
        voidedAt: at,
        voidedBy: c.get("user").id,
        voidReason: parsed.data.reason,
        updatedAt: at,
      })
      .where(and(eq(documents.companyId, companyId), eq(documents.id, documentId))),
    db.insert(auditLog).values({
      id: uuidv7(),
      companyId,
      userId: c.get("user").id,
      action: "document.void",
      entity: "document",
      entityId: documentId,
      detail: JSON.stringify({ reason: parsed.data.reason }),
      at,
    }),
  ]);

  try {
    if ((c.env.PDF_RENDERING as string) === "off") {
      throw new Error("PDF rendering is switched off");
    }
    await ensureVoidPdf(
      { d1: c.env.DB, r2: c.env.FILES, render: puppeteerRenderer(c.env) },
      { companyId, documentId },
    );
  } catch (error) {
    console.error("VOID PDF generation deferred", {
      documentId,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const body = await detail(c, documentId);
  return c.json({ document: body });
});
