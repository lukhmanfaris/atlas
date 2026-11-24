import { and, eq, ne, sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { uuidv7 } from "uuidv7";
import type { ZodError } from "zod";

import {
  createInvoiceSchema,
  createQuotationSchema,
  type DocumentCustomerInput,
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
import { auditLog, customers, documents } from "@/worker/db/schema";
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

  const sourceNumber = document.sourceDocumentId
    ? ((await findDocument(db, companyId, document.sourceDocumentId))?.number ?? null)
    : null;

  const linkedInvoices =
    document.type === "quotation"
      ? (
          await db
            .select({
              id: documents.id,
              number: documents.number,
              status: documents.status,
            })
            .from(documents)
            .where(
              and(
                eq(documents.companyId, companyId),
                eq(documents.sourceDocumentId, documentId),
                eq(documents.type, "invoice"),
              ),
            )
        )
      : [];

  return { ...withExpired(document), lines, sourceNumber, linkedInvoices };
}


type ResolvedCustomer = { id: string } | { failure: "missing" | "address" };

/**
 * Either attaches an existing customer, or reuses one whose name matches
 * exactly (case-insensitive), or creates a new one from the typed details.
 */
async function resolveCustomer(
  db: ReturnType<typeof createDb>,
  companyId: string,
  input: { customerId?: string; customer?: DocumentCustomerInput },
): Promise<ResolvedCustomer> {
  if (input.customerId) {
    const existing = await findCustomer(db, companyId, input.customerId);
    if (!existing || existing.isArchived === 1) {
      return { failure: "missing" };
    }
    return { id: existing.id };
  }

  if (!input.customer) {
    return { failure: "missing" };
  }

  const [match] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(
      and(
        eq(customers.companyId, companyId),
        sql`lower(${customers.name}) = lower(${input.customer.name})`,
      ),
    )
    .limit(1);

  if (match) {
    return { id: match.id };
  }

  const billingAddress = input.customer.billingAddress?.trim();
  if (!billingAddress) {
    return { failure: "address" };
  }

  const id = uuidv7();
  const now = Date.now();
  await db.insert(customers).values({
    id,
    companyId,
    name: input.customer.name,
    billingAddress,
    contactPerson: input.customer.contactPerson ?? null,
    phone: input.customer.phone ?? null,
    email: input.customer.email === "" ? null : (input.customer.email ?? null),
    isArchived: 0,
    createdAt: now,
    updatedAt: now,
  });

  return { id };
}

function customerFailure(c: Context<AppEnv>, failure: "missing" | "address") {
  if (failure === "address") {
    return apiError(c, 400, "validation_error", "A new customer needs a billing address.", [
      { path: "customer.billingAddress", message: "Billing address is required for a new customer." },
    ]);
  }
  return apiError(c, 400, "validation_error", "Choose an active customer.", [
    { path: "customerId", message: "Customer not found in this company." },
  ]);
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
  const raw = await readJson(c);
  const requestedType = (raw as { type?: unknown } | null)?.type;
  if (requestedType !== "quotation" && requestedType !== "invoice") {
    return apiError(c, 400, "validation_error", "Documents are quotations or invoices.");
  }

  const parsed = (requestedType === "quotation" ? createQuotationSchema : createInvoiceSchema)
    .safeParse(raw);
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

  const customer = await resolveCustomer(db, companyId, parsed.data);
  if ("failure" in customer) {
    return customerFailure(c, customer.failure);
  }

  const company = await findCompany(db, companyId);
  const customerRow = await findCustomer(db, companyId, customer.id);
  const paymentTerms =
    customerRow?.paymentTermsDays ?? company?.defaultPaymentTermsDays ?? 30;

  const validUntil =
    requestedType === "quotation"
      ? (parsed.data.validUntil ?? addDays(parsed.data.issueDate, company?.quotationValidityDays ?? 30))
      : null;
  const dueDate =
    requestedType === "invoice"
      ? (parsed.data.dueDate ?? addDays(parsed.data.issueDate, paymentTerms))
      : null;

  const created = await createDraft(db, {
    companyId,
    userId: c.get("user").id,
    type: requestedType,
    customerId: customer.id,
    issueDate: parsed.data.issueDate,
    validUntil,
    dueDate,
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

  let resolvedCustomerId: string | undefined;
  if (parsed.data.customerId || parsed.data.customer) {
    const resolved = await resolveCustomer(db, companyId, parsed.data);
    if ("failure" in resolved) {
      return customerFailure(c, resolved.failure);
    }
    resolvedCustomerId = resolved.id;
  }

  const effectiveLines = parsed.data.lines ?? (await findLines(db, documentId));
  const discountSen = parsed.data.discountSen ?? document.discountSen;
  const totals = computeTotals(toTotalsLines(effectiveLines), discountSen, 0);

  if (parsed.data.lines) {
    await replaceLines(db, documentId, parsed.data.lines);
  }

  await updateDraftHeader(db, companyId, documentId, {
    ...(resolvedCustomerId ? { customerId: resolvedCustomerId } : {}),
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


documentRoutes.post("/:documentId/convert-to-invoice", requireCompany, async (c) => {
  const db = createDb(c.env.DB);
  const companyId = c.get("company").id;
  const quotationId = c.req.param("documentId") ?? "";
  const user = c.get("user");

  const quotation = await findDocument(db, companyId, quotationId);
  if (!quotation) {
    return apiError(c, 404, "not_found", "Quotation not found.");
  }
  if (quotation.type !== "quotation") {
    return apiError(c, 409, "invalid_state", "Only a quotation can be converted.");
  }
  if (quotation.status !== "issued" && quotation.status !== "accepted") {
    return apiError(c, 409, "invalid_state", "Only an issued quotation can be converted.");
  }

  const existing = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        eq(documents.companyId, companyId),
        eq(documents.sourceDocumentId, quotationId),
        eq(documents.type, "invoice"),
        ne(documents.status, "void"),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    return apiError(
      c,
      409,
      "invalid_state",
      "This quotation already has an invoice. Void that invoice before converting again.",
    );
  }

  const lines = await findLines(db, quotationId);
  if (lines.length === 0) {
    return apiError(c, 409, "invalid_state", "The quotation has no lines to copy.");
  }

  const company = await findCompany(db, companyId);
  const customer = await findCustomer(db, companyId, quotation.customerId);
  const issueDate = todayInMalaysia();
  const dueDate = addDays(
    issueDate,
    customer?.paymentTermsDays ?? company?.defaultPaymentTermsDays ?? 30,
  );

  const created = await createDraft(db, {
    companyId,
    userId: user.id,
    type: "invoice",
    customerId: quotation.customerId,
    issueDate,
    validUntil: null,
    dueDate,
    notes: quotation.notes,
    terms: quotation.terms,
    discountSen: quotation.discountSen,
    sourceDocumentId: quotationId,
    lines: lines.map((line) => ({
      itemId: line.itemId,
      sku: line.sku,
      description: line.description,
      unit: line.unit,
      quantityMilli: line.quantityMilli,
      unitPriceSen: line.unitPriceSen ?? 0,
      discountSen: line.discountSen,
      sourceLineId: line.id,
    })),
  });

  const at = Date.now();
  await db.batch([
    db
      .update(documents)
      .set({ status: "accepted", updatedAt: at })
      .where(and(eq(documents.companyId, companyId), eq(documents.id, quotationId))),
    db.insert(auditLog).values({
      id: uuidv7(),
      companyId,
      userId: user.id,
      action: "document.convert",
      entity: "document",
      entityId: quotationId,
      detail: JSON.stringify({ invoiceId: created.id }),
      at,
    }),
  ]);

  const body = await detail(c, created.id);
  return c.json({ document: body }, 201);
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
  const customerRow = await findCustomer(db, companyId, document.customerId);
  const totals = computeTotals(toTotalsLines(lines), document.discountSen, 0);
  const issuedAt = Date.now();
  const validUntil =
    document.validUntil ?? addDays(document.issueDate, company?.quotationValidityDays ?? 30);
  const dueDate =
    document.dueDate ??
    addDays(
      document.issueDate,
      customerRow?.paymentTermsDays ?? company?.defaultPaymentTermsDays ?? 30,
    );

  // Freeze exactly what the PDF will show.
  await db
    .update(documents)
    .set({
      customerSnapshot: JSON.stringify(await customerSnapshot(c.env.DB, document.customerId)),
      companySnapshot: JSON.stringify(await companySnapshot(c.env.DB, companyId)),
      validUntil: document.type === "quotation" ? validUntil : null,
      dueDate: document.type === "invoice" ? dueDate : null,
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
    type: document.type,
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

  if (document.type === "invoice") {
    const pending = await db
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(
          eq(documents.sourceDocumentId, documentId),
          eq(documents.type, "delivery_order"),
          ne(documents.status, "void"),
        ),
      )
      .limit(1);

    if (pending.length > 0) {
      return apiError(
        c,
        409,
        "invalid_state",
        "Void the delivery orders for this invoice before voiding the invoice.",
      );
    }
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
