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

/** Typed free text: reused when the name matches an existing customer exactly. */
export const documentCustomerSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  billingAddress: z.string().trim().max(1000).optional(),
  contactPerson: z.string().trim().max(120).nullish(),
  phone: z.string().trim().max(40).nullish(),
  email: z.union([z.email().max(200), z.literal("")]).nullish(),
});

export type DocumentCustomerInput = z.infer<typeof documentCustomerSchema>;

const documentFields = {
  customerId: z.string().trim().min(1).optional(),
  customer: documentCustomerSchema.optional(),
  issueDate: dateString,
  validUntil: dateString.optional(),
  dueDate: dateString.optional(),
  notes: nullableText(2000),
  terms: nullableText(4000),
  discountSen: z.number().int().min(0).max(100_000_000).optional(),
  lines: z.array(documentLineSchema).min(1).max(300),
};

const oneCustomer = {
  message: "Provide either customerId or customer, not both.",
  path: ["customer"],
};

export const createQuotationSchema = z
  .strictObject({ type: z.literal("quotation"), ...documentFields })
  .refine((value) => Boolean(value.customerId) !== Boolean(value.customer), oneCustomer);

export const createInvoiceSchema = z
  .strictObject({ type: z.literal("invoice"), ...documentFields })
  .refine((value) => Boolean(value.customerId) !== Boolean(value.customer), oneCustomer);

export type CreateQuotationInput = z.infer<typeof createQuotationSchema>;

export const updateQuotationSchema = z
  .strictObject({
    customerId: z.string().trim().min(1).optional(),
    customer: documentCustomerSchema.optional(),
    issueDate: dateString.optional(),
    validUntil: dateString.nullable().optional(),
    dueDate: dateString.nullable().optional(),
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

export type DocumentLineDto = {
  id: string;
  lineNo: number;
  itemId: string | null;
  sku: string | null;
  description: string;
  unit: string;
  quantityMilli: number;
  unitPriceSen: number | null;
  discountSen: number;
  lineTotalSen: number | null;
};

/** What the API returns for one document, plus its lines. */
export type DocumentDto = {
  id: string;
  type: "quotation" | "invoice" | "delivery_order";
  status: string;
  number: string | null;
  customerId: string;
  issueDate: string;
  validUntil: string | null;
  dueDate: string | null;
  notes: string | null;
  terms: string | null;
  subtotalSen: number;
  discountSen: number;
  taxSen: number;
  totalSen: number;
  amountInWords: string | null;
  expired: boolean;
  pdfR2Key: string | null;
  voidPdfR2Key: string | null;
  voidReason: string | null;
  sourceDocumentId: string | null;
  sourceNumber?: string | null;
  linkedInvoices?: { id: string; number: string | null; status: string }[];
  lines: DocumentLineDto[];
};

export type DocumentListRow = {
  id: string;
  status: string;
  number: string | null;
  issueDate: string;
  validUntil: string | null;
  dueDate: string | null;
  totalSen: number;
  customerName: string;
  expired: boolean;
};
