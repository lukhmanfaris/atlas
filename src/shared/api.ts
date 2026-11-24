import { z } from "zod";

import { companyRoleSchema, type CompanyRole } from "./enums";

/**
 * Every API error uses this shape (spec.json -> api.errors):
 * { error: { code, message, details? } }
 */
export const apiErrorSchema = z.strictObject({
  error: z.strictObject({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export type ApiErrorBody = z.infer<typeof apiErrorSchema>;

export const apiErrorCodes = {
  validation: "validation_error",
  unauthorized: "unauthorized",
  forbidden: "forbidden",
  notFound: "not_found",
  invalidState: "invalid_state",
  conflict: "conflict",
  unavailable: "unavailable",
  internal: "internal_error",
} as const;

export type ApiErrorCode = (typeof apiErrorCodes)[keyof typeof apiErrorCodes];

export const meUserSchema = z.strictObject({
  id: z.string(),
  email: z.string(),
  name: z.string(),
});

export const meCompanySchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  role: companyRoleSchema,
  logoR2Key: z.string().nullable(),
});

/**
 * GET /api/me: the signed-in staff member and the companies they can work in.
 */
export const meResponseSchema = z.strictObject({
  user: meUserSchema,
  companies: z.array(meCompanySchema),
});

export type MeUser = z.infer<typeof meUserSchema>;
export type MeCompany = z.infer<typeof meCompanySchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;

export type { CompanyRole };
