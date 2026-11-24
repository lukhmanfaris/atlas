import type { MiddlewareHandler } from "hono";

import { createDb } from "@/worker/db/client";
import { findMembership } from "@/worker/db/members";
import { apiError } from "@/worker/errors";

import type { AppEnv } from "./middleware";

/**
 * Company scope. The company comes from the X-Company-Id header, and the user
 * must be a member of it (spec.json -> conventions.company_scope).
 */
export const requireCompany: MiddlewareHandler<AppEnv> = async (c, next) => {
  const companyId = c.req.header("X-Company-Id")?.trim();

  if (!companyId) {
    return apiError(c, 400, "validation_error", "The X-Company-Id header is required.");
  }

  const membership = await findMembership(createDb(c.env.DB), companyId, c.get("user").id);

  if (!membership) {
    return apiError(c, 403, "forbidden", "You are not a member of this company.");
  }

  c.set("company", { id: companyId, role: membership.role });
  return next();
};

/** Owner-only actions: settings, members, voiding, export. */
export const requireOwner: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get("company").role !== "owner") {
    return apiError(c, 403, "forbidden", "Only a company owner can do this.");
  }
  return next();
};
