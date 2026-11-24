import { and, eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import type { CreateCompanyInput, UpdateCompanyInput } from "@/shared/companies";

import type { Db } from "./client";
import { auditLog, companies, companyMembers, type Company } from "./schema";
import { auditValues } from "@/worker/services/audit";

export async function findCompany(db: Db, companyId: string): Promise<Company | null> {
  const rows = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  return rows[0] ?? null;
}

/** True when the user owns at least one company, which is what lets them create companies. */
export async function userOwnsAnyCompany(db: Db, userId: string): Promise<boolean> {
  const rows = await db
    .select({ companyId: companyMembers.companyId })
    .from(companyMembers)
    .where(and(eq(companyMembers.userId, userId), eq(companyMembers.role, "owner")))
    .limit(1);
  return rows.length > 0;
}

/**
 * Creates a company and makes the creator its owner, with an audit row, in one
 * batch (a single D1 transaction).
 */
export async function createCompany(
  db: Db,
  input: CreateCompanyInput,
  creatorId: string,
): Promise<string> {
  const id = uuidv7();
  const now = Date.now();

  await db.batch([
    db.insert(companies).values({
      id,
      name: input.name,
      registrationNo: input.registrationNo,
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2 ?? null,
      addressLine3: input.addressLine3 ?? null,
      postcode: input.postcode,
      city: input.city,
      state: input.state,
      country: input.country ?? "Malaysia",
      phone: input.phone ?? null,
      email: input.email ?? null,
      website: input.website ?? null,
      brandColor: input.brandColor ?? "#111827",
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(companyMembers).values({
      companyId: id,
      userId: creatorId,
      role: "owner",
      createdAt: now,
    }),
    db.insert(auditLog).values(
      auditValues({
        companyId: id,
        userId: creatorId,
        action: "company.create",
        entity: "company",
        entityId: id,
        detail: { name: input.name },
      }),
    ),
  ]);

  return id;
}

export async function updateCompany(
  db: Db,
  companyId: string,
  input: UpdateCompanyInput,
  actorId: string,
): Promise<void> {
  const updates: Record<string, unknown> = { updatedAt: Date.now() };

  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      updates[key] = value;
    }
  }

  await db.batch([
    db.update(companies).set(updates).where(eq(companies.id, companyId)),
    db.insert(auditLog).values(
      auditValues({
        companyId,
        userId: actorId,
        action: "company.update",
        entity: "company",
        entityId: companyId,
        detail: { fields: Object.keys(input) },
      }),
    ),
  ]);
}
