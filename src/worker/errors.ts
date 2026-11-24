import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import type { ApiErrorBody, ApiErrorCode } from "@/shared/api";

/**
 * Every error response uses this shape (spec.json -> api.errors):
 * { error: { code, message, details? } }
 */
export function apiError(
  c: Context,
  status: ContentfulStatusCode,
  code: ApiErrorCode,
  message: string,
  details?: unknown,
) {
  const body: ApiErrorBody = {
    error: details === undefined ? { code, message } : { code, message, details },
  };
  return c.json(body, status);
}
