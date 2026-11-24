import type { MiddlewareHandler } from "hono";

import { createDb } from "@/worker/db/client";
import { findMembership } from "@/worker/db/members";
import { userOwnsAnyCompany } from "@/worker/db/companies";
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

/**
 * Same check, but the company comes from the `:companyId` URL parameter. Used
 * for routes that address one company directly, such as its logo.
 */
export const requireCompanyParam: MiddlewareHandler<AppEnv> = async (c, next) => {
  const companyId = c.req.param("companyId");

  if (!companyId) {
    return apiError(c, 400, "validation_error", "A company id is required.");
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

/**
 * Creating a company is limited to someone who is already an owner of at least
 * one company, which today means the business owner.
 */
export const requireCompanyCreator: MiddlewareHandler<AppEnv> = async (c, next) => {
  const allowed = await userOwnsAnyCompany(createDb(c.env.DB), c.get("user").id);

  if (!allowed) {
    return apiError(c, 403, "forbidden", "Only a company owner can create a company.");
  }
  return next();
};
