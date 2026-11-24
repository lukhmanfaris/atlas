import { and, desc, eq, like, or } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import type { DocumentLineInput } from "@/shared/documents";
import type { DocumentType } from "@/shared/enums";
import { computeTotals, type TotalsLine } from "@/worker/services/totals";

import type { Db } from "./client";
import { customers, documentLines, documents, type Document, type DocumentLine } from "./schema";

/** document_lines has 13 bound columns; keep every statement under D1's 100. */
const LINES_PER_STATEMENT = 7;

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

type TotalsSource = {
  quantityMilli: number;
  unitPriceSen: number | null;
  discountSen?: number | null;
};

/** Works for both input lines and stored rows (delivery order lines have no price). */
export function toTotalsLines(lines: TotalsSource[]): TotalsLine[] {
  return lines.map((line) => ({
    quantityMilli: line.quantityMilli,
    unitPriceSen: line.unitPriceSen ?? 0,
    discountSen: line.discountSen ?? 0,
  }));
}

function lineRows(documentId: string, lines: DocumentLineInput[]) {
  const totals = computeTotals(toTotalsLines(lines));

  return lines.map((line, index) => ({
    id: uuidv7(),
    documentId,
    lineNo: index + 1,
    itemId: line.itemId ?? null,
    sku: line.sku ?? null,
    description: line.description,
    unit: line.unit,
    quantityMilli: line.quantityMilli,
    unitPriceSen: line.unitPriceSen,
    discountSen: line.discountSen ?? 0,
    taxRateBp: 0,
    lineTotalSen: totals.lineTotalsSen[index] ?? 0,
  }));
}

function insertLineStatements(db: Db, documentId: string, lines: DocumentLineInput[]) {
  return chunks(lineRows(documentId, lines), LINES_PER_STATEMENT).map((chunk) =>
    db.insert(documentLines).values(chunk),
  );
}

export type CreateDraftInput = {
  companyId: string;
  userId: string;
  type: DocumentType;
  customerId: string;
  issueDate: string;
  validUntil: string | null;
  notes: string | null;
  terms: string | null;
  discountSen: number;
  lines: DocumentLineInput[];
};

export async function createDraft(
  db: Db,
  input: CreateDraftInput,
): Promise<{ id: string; subtotalSen: number; totalSen: number }> {
  const id = uuidv7();
  const now = Date.now();
  const totals = computeTotals(toTotalsLines(input.lines), input.discountSen, 0);

  const statements = [
    db.insert(documents).values({
      id,
      companyId: input.companyId,
      type: input.type,
      status: "draft",
      customerId: input.customerId,
      issueDate: input.issueDate,
      validUntil: input.validUntil,
      notes: input.notes,
      terms: input.terms,
      discountSen: input.discountSen,
      taxSen: 0,
      subtotalSen: totals.subtotalSen,
      totalSen: totals.totalSen,
      createdBy: input.userId,
      createdAt: now,
      updatedAt: now,
    }),
    ...insertLineStatements(db, id, input.lines),
  ];

  // Mixed insert builders of different tables: Drizzle types batch() as a tuple.
  await db.batch(statements as unknown as Parameters<Db["batch"]>[0]);

  return { id, subtotalSen: totals.subtotalSen, totalSen: totals.totalSen };
}

export async function replaceLines(
  db: Db,
  documentId: string,
  lines: DocumentLineInput[],
): Promise<void> {
  const statements = [
    db.delete(documentLines).where(eq(documentLines.documentId, documentId)),
    ...insertLineStatements(db, documentId, lines),
  ];

  await db.batch(statements as unknown as Parameters<Db["batch"]>[0]);
}

export async function findDocument(
  db: Db,
  companyId: string,
  documentId: string,
): Promise<Document | null> {
  const rows = await db
    .select()
    .from(documents)
    .where(and(eq(documents.companyId, companyId), eq(documents.id, documentId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function findLines(db: Db, documentId: string): Promise<DocumentLine[]> {
  return db
    .select()
    .from(documentLines)
    .where(eq(documentLines.documentId, documentId))
    .orderBy(documentLines.lineNo);
}

export async function deleteDraft(
  db: Db,
  companyId: string,
  documentId: string,
): Promise<boolean> {
  const result = await db
    .delete(documents)
    .where(
      and(
        eq(documents.companyId, companyId),
        eq(documents.id, documentId),
        eq(documents.status, "draft"),
      ),
    );
  return (result.meta.changes ?? 0) > 0;
}

export async function updateDraftHeader(
  db: Db,
  companyId: string,
  documentId: string,
  patch: Partial<{
    customerId: string;
    issueDate: string;
    validUntil: string | null;
      notes: string | null;
    terms: string | null;
    discountSen: number;
    subtotalSen: number;
    totalSen: number;
    updatedAt: number;
  }>,
): Promise<void> {
  await db
    .update(documents)
    .set(patch)
    .where(
      and(
        eq(documents.companyId, companyId),
        eq(documents.id, documentId),
        eq(documents.status, "draft"),
      ),
    );
}

export type ListFilters = {
  type: DocumentType;
  status?: string;
  q?: string;
  limit?: number;
};

export async function listDocuments(db: Db, companyId: string, filters: ListFilters) {
  const conditions = [
    eq(documents.companyId, companyId),
    eq(documents.type, filters.type),
  ];

  if (filters.status) {
    conditions.push(eq(documents.status, filters.status));
  }

  const term = filters.q?.replace(/[%_]/g, "").trim();
  if (term) {
    const pattern = `%${term}%`;
    const match = or(like(documents.number, pattern), like(customers.name, pattern));
    if (match) {
      conditions.push(match);
    }
  }

  return db
    .select({
      id: documents.id,
      type: documents.type,
      status: documents.status,
      number: documents.number,
      issueDate: documents.issueDate,
      validUntil: documents.validUntil,
      dueDate: documents.dueDate,
      totalSen: documents.totalSen,
      customerId: documents.customerId,
      customerName: customers.name,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .innerJoin(customers, eq(customers.id, documents.customerId))
    .where(and(...conditions))
    .orderBy(desc(documents.createdAt))
    .limit(filters.limit ?? 50);
}
