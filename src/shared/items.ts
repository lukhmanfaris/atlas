import { z } from "zod";

const nullableText = (max: number) => z.string().trim().max(max).nullish();

export const createItemSchema = z.strictObject({
  sku: nullableText(60),
  name: z.string().trim().min(1).max(200),
  description: nullableText(1000),
  unit: z.string().trim().min(1).max(20).optional(),
  unitPriceSen: z.number().int().min(0).max(100_000_000).optional(),
  classificationCode: nullableText(40),
});

export type CreateItemInput = z.infer<typeof createItemSchema>;

export const updateItemSchema = createItemSchema.partial().extend({
  isArchived: z.union([z.literal(0), z.literal(1)]).optional(),
});

export type UpdateItemInput = z.infer<typeof updateItemSchema>;

export type ItemDto = {
  id: string;
  sku: string | null;
  name: string;
  description: string | null;
  unit: string;
  unitPriceSen: number;
  classificationCode: string | null;
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
};

/**
 * "12.5" -> 1250. Returns null when the text is not a non-negative amount with
 * at most two decimal places. Never uses floating point for the result.
 */
export function ringgitToSen(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return null;
  }
  const [whole, fraction = ""] = trimmed.split(".");
  const sen = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(sen) ? sen : null;
}

/** 1250 -> "12.50" */
export function senToRinggit(sen: number): string {
  return (sen / 100).toFixed(2);
}

/** 1250 -> "RM 1,250.00" (display only; the value stays integer sen). */
export function formatRinggit(sen: number): string {
  const formatted = new Intl.NumberFormat("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(sen / 100);
  return `RM ${formatted}`;
}
