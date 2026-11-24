import { z } from "zod";

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #111827");

const optionalText = (max: number) => z.string().trim().max(max).optional();
const nullableText = (max: number) => z.string().trim().max(max).nullish();

export const createCompanySchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  registrationNo: z.string().trim().min(1).max(60),
  addressLine1: z.string().trim().min(1).max(200),
  addressLine2: z.string().trim().max(200).optional(),
  addressLine3: z.string().trim().max(200).optional(),
  postcode: z.string().trim().min(1).max(10),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(1).max(100),
  country: z.string().trim().min(1).max(100).optional(),
  phone: optionalText(40),
  email: z.email().max(200).optional(),
  website: optionalText(200),
  brandColor: hexColor.optional(),
});

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;

export const updateCompanySchema = z.strictObject({
  name: z.string().trim().min(1).max(200).optional(),
  registrationNo: z.string().trim().min(1).max(60).optional(),
  addressLine1: z.string().trim().min(1).max(200).optional(),
  addressLine2: nullableText(200),
  addressLine3: nullableText(200),
  postcode: z.string().trim().min(1).max(10).optional(),
  city: z.string().trim().min(1).max(100).optional(),
  state: z.string().trim().min(1).max(100).optional(),
  country: z.string().trim().min(1).max(100).optional(),
  phone: nullableText(40),
  email: z.union([z.email().max(200), z.literal(""), z.null()]).optional(),
  website: nullableText(200),
  brandColor: hexColor.optional(),
  bankName: nullableText(120),
  bankAccountName: nullableText(120),
  bankAccountNo: nullableText(60),
  defaultPaymentTermsDays: z.number().int().min(0).max(365).optional(),
  quotationValidityDays: z.number().int().min(1).max(365).optional(),
  prefixQuotation: z.string().trim().min(1).max(10).optional(),
  prefixInvoice: z.string().trim().min(1).max(10).optional(),
  prefixDeliveryOrder: z.string().trim().min(1).max(10).optional(),
  quotationTerms: nullableText(4000),
  invoiceNotes: nullableText(4000),
  deliveryOrderNotes: nullableText(4000),
  paymentInstructions: nullableText(2000),
  sstRegistered: z.union([z.literal(0), z.literal(1)]).optional(),
  sstNo: nullableText(60),
  tin: nullableText(60),
  msicCode: nullableText(20),
});

export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;

/** What the client receives. Timestamps are Unix ms. */
export type CompanyDto = {
  id: string;
  name: string;
  registrationNo: string;
  addressLine1: string;
  addressLine2: string | null;
  addressLine3: string | null;
  postcode: string;
  city: string;
  state: string;
  country: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  logoR2Key: string | null;
  brandColor: string;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNo: string | null;
  defaultPaymentTermsDays: number;
  quotationValidityDays: number;
  prefixQuotation: string;
  prefixInvoice: string;
  prefixDeliveryOrder: string;
  quotationTerms: string | null;
  invoiceNotes: string | null;
  deliveryOrderNotes: string | null;
  paymentInstructions: string | null;
  sstRegistered: boolean;
  sstNo: string | null;
  tin: string | null;
  msicCode: string | null;
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
};

export const MAX_LOGO_BYTES = 1_000_000;
export const ALLOWED_LOGO_TYPES = ["image/png", "image/jpeg"] as const;
