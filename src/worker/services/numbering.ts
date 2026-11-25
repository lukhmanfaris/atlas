import type { DocumentType } from "@/shared/enums";

export type IssueNumberInput = {
  companyId: string;
  documentId: string;
  type: DocumentType;
  /** Business date of issue, YYYY-MM-DD in Malaysia time. */
  issueDate: string;
  issuedAt: number;
  issuedBy: string;
  /** Extra statements to run in the same transaction, e.g. the audit row. */
  extraStatements?: D1PreparedStatement[];
};

export type IssueNumberResult = {
  number: string;
  seq: number;
};

/** The first number in every company/type sequence. */
export const FIRST_SEQUENCE_VALUE = 1000;

type CompanyPrefixes = {
  prefix_quotation: string;
  prefix_invoice: string;
  prefix_delivery_order: string;
};

function prefixFor(company: CompanyPrefixes, type: DocumentType): string {
  switch (type) {
    case "quotation":
      return company.prefix_quotation;
    case "invoice":
      return company.prefix_invoice;
    case "delivery_order":
      return company.prefix_delivery_order;
  }
}

/**
 * Assigns the next gap-free number to a draft and marks it issued, in one D1
 * batch (a single transaction).
 *
 * Returns null when the document is not a draft of that company and type, in
 * which case the sequence is left untouched.
 *
 * D1 has no interactive transactions, so the counter only advances while the
 * document is still a draft (a conditional UPDATE), and the number is stamped
 * from the same value in the same transaction.
 */
export async function issueDocumentNumber(
  d1: D1Database,
  input: IssueNumberInput,
): Promise<IssueNumberResult | null> {
  const { companyId, documentId, type, issueDate, issuedAt, issuedBy } = input;

  const company = await d1
    .prepare(
      `SELECT prefix_quotation, prefix_invoice, prefix_delivery_order
       FROM companies WHERE id = ?`,
    )
    .bind(companyId)
    .first<CompanyPrefixes>();

  if (!company) {
    return null;
  }

  const prefix = prefixFor(company, type);
  const seqYear = Number(issueDate.slice(0, 4));

  if (type === "delivery_order") {
    return issueDeliveryOrderNumber(d1, input, prefix, seqYear);
  }

  const [, advance, stamp] = await d1.batch([
    // 1. Make sure the counter row exists, starting at 1000.
    d1
      .prepare(
        `INSERT OR IGNORE INTO number_sequences (company_id, doc_type, next_value)
         VALUES (?, ?, ${FIRST_SEQUENCE_VALUE})`,
      )
      .bind(companyId, type),

    // 2. Advance the counter, but only while the document is still a draft.
    d1
      .prepare(
        `UPDATE number_sequences
         SET next_value = next_value + 1
         WHERE company_id = ? AND doc_type = ?
           AND EXISTS (
             SELECT 1 FROM documents
             WHERE id = ? AND company_id = ? AND type = ? AND status = 'draft'
           )`,
      )
      .bind(companyId, type, documentId, companyId, type),

    // 3. Stamp the allocated value on the document.
    d1
      .prepare(
        `UPDATE documents
         SET seq = (
               SELECT next_value - 1 FROM number_sequences
               WHERE company_id = ? AND doc_type = ?
             ),
             seq_year = ?,
             number = ? || '-' || printf(
               '%04d',
               (SELECT next_value - 1 FROM number_sequences
                WHERE company_id = ? AND doc_type = ?)
             ),
             status = 'issued',
             issued_at = ?,
             issued_by = ?,
             updated_at = ?
         WHERE id = ? AND company_id = ? AND type = ? AND status = 'draft'`,
      )
      .bind(
        companyId,
        type,
        seqYear,
        prefix,
        companyId,
        type,
        issuedAt,
        issuedBy,
        issuedAt,
        documentId,
        companyId,
        type,
      ),
    ...(input.extraStatements ?? []),
  ]);

  if ((advance?.meta.changes ?? 0) === 0 || (stamp?.meta.changes ?? 0) === 0) {
    return null;
  }

  const row = await d1
    .prepare("SELECT number, seq FROM documents WHERE id = ?")
    .bind(documentId)
    .first<{ number: string | null; seq: number | null }>();

  if (!row?.number || row.seq === null) {
    return null;
  }

  return { number: row.number, seq: row.seq };
}

/**
 * A delivery order carries its invoice's digits: invoice seq 1042 gives
 * DO-1042, then DO-1042-2, DO-1042-3 for further deliveries of that invoice
 * (voided ones still count). It never touches number_sequences. The count and
 * the stamp happen in one UPDATE, so concurrent issues cannot share a number
 * (the unique index on company_id + number is the backstop).
 */
async function issueDeliveryOrderNumber(
  d1: D1Database,
  input: IssueNumberInput,
  prefix: string,
  seqYear: number,
): Promise<IssueNumberResult | null> {
  const { companyId, documentId, issuedAt, issuedBy } = input;

  const [stamp] = await d1.batch([
    d1
      .prepare(
        `UPDATE documents
         SET seq = (
               SELECT inv.seq FROM documents inv
               WHERE inv.id = documents.source_document_id AND inv.company_id = ?
             ),
             seq_year = ?,
             number = ? || '-' || printf(
               '%04d',
               (SELECT inv.seq FROM documents inv
                WHERE inv.id = documents.source_document_id AND inv.company_id = ?)
             ) || (
               SELECT CASE WHEN COUNT(*) = 0 THEN '' ELSE '-' || (COUNT(*) + 1) END
               FROM documents o
               WHERE o.company_id = ? AND o.type = 'delivery_order'
                 AND o.source_document_id = documents.source_document_id
                 AND o.number IS NOT NULL
             ),
             status = 'issued',
             issued_at = ?,
             issued_by = ?,
             updated_at = ?
         WHERE id = ? AND company_id = ? AND type = 'delivery_order' AND status = 'draft'
           AND EXISTS (
             SELECT 1 FROM documents inv
             WHERE inv.id = documents.source_document_id AND inv.company_id = ?
               AND inv.type = 'invoice' AND inv.seq IS NOT NULL
           )`,
      )
      .bind(
        companyId,
        seqYear,
        prefix,
        companyId,
        companyId,
        issuedAt,
        issuedBy,
        issuedAt,
        documentId,
        companyId,
        companyId,
      ),
    ...(input.extraStatements ?? []),
  ]);

  if ((stamp?.meta.changes ?? 0) === 0) {
    return null;
  }

  const row = await d1
    .prepare("SELECT number, seq FROM documents WHERE id = ?")
    .bind(documentId)
    .first<{ number: string | null; seq: number | null }>();

  if (!row?.number || row.seq === null) {
    return null;
  }

  return { number: row.number, seq: row.seq };
}
