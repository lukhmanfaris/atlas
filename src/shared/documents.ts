import { z } from "zod";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const nullableText = (max: number) => z.string().trim().max(max).nullish();

export const documentLineSchema = z.strictObject({
  itemId: z.string().trim().min(1).nullish(),
  sku: z.string().trim().max(60).nullish(),
  description: z.string().trim().min(1).max(500),
  unit: z.string().trim().min(1).max(20),
  quantityMilli: z.number().int().positive().max(1_000_000_000),
  unitPriceSen: z.number().int().min(0).max(100_000_000),
  discountSen: z.number().int().min(0).max(100_000_000).optional(),
});

export type DocumentLineInput = z.infer<typeof documentLineSchema>;

export const createQuotationSchema = z.strictObject({
  type: z.literal("quotation"),
  customerId: z.string().trim().min(1),
  issueDate: dateString,
  validUntil: dateString.optional(),
  reference: nullableText(100),
  notes: nullableText(2000),
  terms: nullableText(4000),
  discountSen: z.number().int().min(0).max(100_000_000).optional(),
  lines: z.array(documentLineSchema).min(1).max(300),
});

export type CreateQuotationInput = z.infer<typeof createQuotationSchema>;

export const updateQuotationSchema = z
  .strictObject({
    customerId: z.string().trim().min(1).optional(),
    issueDate: dateString.optional(),
    validUntil: dateString.nullable().optional(),
    reference: nullableText(100),
    notes: nullableText(2000),
    terms: nullableText(4000),
    discountSen: z.number().int().min(0).max(100_000_000).optional(),
    lines: z.array(documentLineSchema).min(1).max(300).optional(),
  });

export type UpdateQuotationInput = z.infer<typeof updateQuotationSchema>;

export const voidDocumentSchema = z.strictObject({
  reason: z.string().trim().min(1).max(500),
});

export type VoidDocumentInput = z.infer<typeof voidDocumentSchema>;
