import { z } from "zod";

export const companyRoleSchema = z.enum(["owner", "staff"]);
export type CompanyRole = z.infer<typeof companyRoleSchema>;

export const documentTypeSchema = z.enum(["quotation", "invoice", "delivery_order"]);
export type DocumentType = z.infer<typeof documentTypeSchema>;

export const quotationStatusSchema = z.enum(["draft", "issued", "accepted", "rejected", "void"]);
export type QuotationStatus = z.infer<typeof quotationStatusSchema>;

export const invoiceStatusSchema = z.enum(["draft", "issued", "void"]);
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;

export const deliveryOrderStatusSchema = z.enum(["draft", "issued", "delivered", "void"]);
export type DeliveryOrderStatus = z.infer<typeof deliveryOrderStatusSchema>;

export const documentStatusSchema = z.enum([
  "draft",
  "issued",
  "accepted",
  "rejected",
  "delivered",
  "void",
]);
export type DocumentStatus = z.infer<typeof documentStatusSchema>;
