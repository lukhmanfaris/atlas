import { and, eq, like } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import type { CreateCustomerInput, UpdateCustomerInput } from "@/shared/customers";

import type { Db } from "./client";
import { customers, type Customer } from "./schema";

/** SQLite LIKE treats these as wildcards; strip them so a search is literal. */
function searchTerm(q: string): string {
  return q.replace(/[%_]/g, "").trim();
}

export async function listCustomers(
  db: Db,
  companyId: string,
  options: { q?: string; includeArchived?: boolean } = {},
): Promise<Customer[]> {
  const filters = [eq(customers.companyId, companyId)];

  if (!options.includeArchived) {
    filters.push(eq(customers.isArchived, 0));
  }

  const term = options.q ? searchTerm(options.q) : "";
  if (term) {
    filters.push(like(customers.name, `%${term}%`));
  }

  return db
    .select()
    .from(customers)
    .where(and(...filters))
    .orderBy(customers.name)
    .limit(200);
}

export async function findCustomer(
  db: Db,
  companyId: string,
  customerId: string,
): Promise<Customer | null> {
  const rows = await db
    .select()
    .from(customers)
    .where(and(eq(customers.companyId, companyId), eq(customers.id, customerId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createCustomer(
  db: Db,
  companyId: string,
  input: CreateCustomerInput,
): Promise<string> {
  const id = uuidv7();
  const now = Date.now();

  await db.insert(customers).values({
    id,
    companyId,
    name: input.name,
    registrationNo: input.registrationNo ?? null,
    contactPerson: input.contactPerson ?? null,
    phone: input.phone ?? null,
    email: input.email === "" ? null : (input.email ?? null),
    billingAddress: input.billingAddress,
    deliveryAddress: input.deliveryAddress ?? null,
    paymentTermsDays: input.paymentTermsDays ?? null,
    notes: input.notes ?? null,
    tin: input.tin ?? null,
    isArchived: 0,
    createdAt: now,
    updatedAt: now,
  });

  return id;
}

export async function updateCustomer(
  db: Db,
  companyId: string,
  customerId: string,
  input: UpdateCustomerInput,
): Promise<void> {
  const updates: Record<string, unknown> = { updatedAt: Date.now() };

  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      updates[key] = key === "email" && value === "" ? null : value;
    }
  }

  await db
    .update(customers)
    .set(updates)
    .where(and(eq(customers.companyId, companyId), eq(customers.id, customerId)));
}
