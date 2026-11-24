import { Hono, type Context } from "hono";
import type { ZodError } from "zod";

import { createCustomerSchema, updateCustomerSchema, type CustomerDto } from "@/shared/customers";

import { requireCompany } from "@/worker/auth/company";
import type { AppEnv } from "@/worker/auth/middleware";
import { createDb } from "@/worker/db/client";
import {
  createCustomer,
  findCustomer,
  listCustomers,
  updateCustomer,
} from "@/worker/db/customers";
import type { Customer } from "@/worker/db/schema";
import { apiError } from "@/worker/errors";

export const customerRoutes = new Hono<AppEnv>();

function toDto(customer: Customer): CustomerDto {
  return { ...customer, isArchived: customer.isArchived === 1 };
}

function validationDetails(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

async function readJson(c: Context<AppEnv>): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

customerRoutes.get("/", requireCompany, async (c) => {
  const q = c.req.query("q")?.trim();
  const includeArchived = ["1", "true", "yes"].includes(
    (c.req.query("include_archived") ?? "").toLowerCase(),
  );

  const rows = await listCustomers(createDb(c.env.DB), c.get("company").id, {
    q: q || undefined,
    includeArchived,
  });

  return c.json({ customers: rows.map(toDto) });
});

customerRoutes.post("/", requireCompany, async (c) => {
  const parsed = createCustomerSchema.safeParse(await readJson(c));
  if (!parsed.success) {
    return apiError(
      c,
      400,
      "validation_error",
      "Check the customer details and try again.",
      validationDetails(parsed.error),
    );
  }

  const db = createDb(c.env.DB);
  const companyId = c.get("company").id;
  const id = await createCustomer(db, companyId, parsed.data);
  const customer = await findCustomer(db, companyId, id);

  if (!customer) {
    return apiError(c, 500, "internal_error", "The customer could not be read back.");
  }

  return c.json({ customer: toDto(customer) }, 201);
});

customerRoutes.get("/:customerId", requireCompany, async (c) => {
  const customer = await findCustomer(
    createDb(c.env.DB),
    c.get("company").id,
    c.req.param("customerId"),
  );

  if (!customer) {
    return apiError(c, 404, "not_found", "Customer not found.");
  }

  return c.json({ customer: toDto(customer) });
});

customerRoutes.patch("/:customerId", requireCompany, async (c) => {
  const parsed = updateCustomerSchema.safeParse(await readJson(c));
  if (!parsed.success) {
    return apiError(
      c,
      400,
      "validation_error",
      "Check the customer details and try again.",
      validationDetails(parsed.error),
    );
  }

  if (Object.keys(parsed.data).length === 0) {
    return apiError(c, 400, "validation_error", "Nothing to update.");
  }

  const db = createDb(c.env.DB);
  const companyId = c.get("company").id;
  const customerId = c.req.param("customerId");

  if (!(await findCustomer(db, companyId, customerId))) {
    return apiError(c, 404, "not_found", "Customer not found.");
  }

  await updateCustomer(db, companyId, customerId, parsed.data);
  const customer = await findCustomer(db, companyId, customerId);

  if (!customer) {
    return apiError(c, 500, "internal_error", "The customer could not be read back.");
  }

  return c.json({ customer: toDto(customer) });
});
