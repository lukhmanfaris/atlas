export type RemainingLine = {
  lineId: string;
  lineNo: number;
  sku: string | null;
  description: string;
  unit: string;
  invoicedMilli: number;
  deliveredMilli: number;
  remainingMilli: number;
};

type Row = {
  id: string;
  line_no: number;
  sku: string | null;
  description: string;
  unit: string;
  quantity_milli: number;
  delivered_milli: number;
};

/**
 * Remaining quantity per invoice line. Defined in spec.json -> calculations:
 * invoice quantity minus the quantity on every non-void delivery order that
 * points at that line.
 *
 * `excludeDocumentId` is used when editing an existing DO, so its own lines do
 * not count against the remainder twice.
 */
export async function remainingForInvoice(
  d1: D1Database,
  invoiceId: string,
  excludeDocumentId?: string,
): Promise<RemainingLine[]> {
  const result = await d1
    .prepare(
      `SELECT il.id,
              il.line_no,
              il.sku,
              il.description,
              il.unit,
              il.quantity_milli,
              COALESCE((
                SELECT SUM(dl.quantity_milli)
                FROM document_lines dl
                JOIN documents d ON d.id = dl.document_id
                WHERE dl.source_line_id = il.id
                  AND d.type = 'delivery_order'
                  AND d.status != 'void'
                  AND (? IS NULL OR d.id != ?)
              ), 0) AS delivered_milli
       FROM document_lines il
       WHERE il.document_id = ?
       ORDER BY il.line_no`,
    )
    .bind(excludeDocumentId ?? null, excludeDocumentId ?? null, invoiceId)
    .all<Row>();

  return (result.results ?? []).map((row) => ({
    lineId: row.id,
    lineNo: row.line_no,
    sku: row.sku,
    description: row.description,
    unit: row.unit,
    invoicedMilli: row.quantity_milli,
    deliveredMilli: row.delivered_milli,
    remainingMilli: Math.max(0, row.quantity_milli - row.delivered_milli),
  }));
}

/**
 * Checks DO lines against the invoice remainder. Returns the offending line so
 * the caller can answer 400 with a field-level message.
 */
export function findOverDelivery(
  lines: { quantityMilli: number; sourceLineId?: string | null }[],
  remaining: RemainingLine[],
): RemainingLine | null {
  const byId = new Map(remaining.map((line) => [line.lineId, line]));

  for (const line of lines) {
    if (!line.sourceLineId) {
      continue;
    }
    const invoiceLine = byId.get(line.sourceLineId);
    if (invoiceLine && line.quantityMilli > invoiceLine.remainingMilli) {
      return invoiceLine;
    }
  }

  return null;
}
