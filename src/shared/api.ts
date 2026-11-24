import { z } from "zod";

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
  internal: "internal_error",
} as const;

export type ApiErrorCode = (typeof apiErrorCodes)[keyof typeof apiErrorCodes];

/**
 * GET /api/me. Grows in F-01 with the user's companies and roles.
 */
export const meResponseSchema = z.strictObject({
  email: z.string(),
});

export type MeResponse = z.infer<typeof meResponseSchema>;
