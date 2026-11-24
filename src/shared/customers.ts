import { z } from "zod";

const nullableText = (max: number) => z.string().trim().max(max).nullish();
const emailValue = z.union([z.email().max(200), z.literal(""), z.null()]);

export const createCustomerSchema = z.strictObject({
  name: z.string().trim().min(1).max(200),
  registrationNo: nullableText(60),
  contactPerson: nullableText(120),
  phone: nullableText(40),
  email: emailValue.optional(),
  billingAddress: z.string().trim().min(1).max(1000),
  deliveryAddress: nullableText(1000),
  paymentTermsDays: z.number().int().min(0).max(365).nullish(),
  notes: nullableText(2000),
  tin: nullableText(60),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = createCustomerSchema.partial().extend({
  isArchived: z.union([z.literal(0), z.literal(1)]).optional(),
});

export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

/** What the client receives. Timestamps are Unix ms. */
export type CustomerDto = {
  id: string;
  name: string;
  registrationNo: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  billingAddress: string;
  deliveryAddress: string | null;
  paymentTermsDays: number | null;
  notes: string | null;
  tin: string | null;
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
};
