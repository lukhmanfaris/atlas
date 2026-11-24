import { and, count, eq } from "drizzle-orm";

import type { CompanyRole } from "@/shared/enums";

import type { Db } from "./client";
import { companies, companyMembers, users, type User } from "./schema";

export async function findUserByEmail(db: Db, email: string): Promise<User | null> {
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return rows[0] ?? null;
}

export async function listCompaniesForUser(db: Db, userId: string) {
  return db
    .select({
      id: companies.id,
      name: companies.name,
      role: companyMembers.role,
    })
    .from(companyMembers)
    .innerJoin(companies, eq(companies.id, companyMembers.companyId))
    .where(eq(companyMembers.userId, userId))
    .orderBy(companies.name);
}

export async function findMembership(
  db: Db,
  companyId: string,
  userId: string,
): Promise<{ role: CompanyRole } | null> {
  const rows = await db
    .select({ role: companyMembers.role })
    .from(companyMembers)
    .where(and(eq(companyMembers.companyId, companyId), eq(companyMembers.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listMembers(db: Db, companyId: string) {
  return db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      role: companyMembers.role,
      isActive: users.isActive,
    })
    .from(companyMembers)
    .innerJoin(users, eq(users.id, companyMembers.userId))
    .where(eq(companyMembers.companyId, companyId))
    .orderBy(users.name);
}

export async function findMember(db: Db, companyId: string, userId: string) {
  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      role: companyMembers.role,
      isActive: users.isActive,
    })
    .from(companyMembers)
    .innerJoin(users, eq(users.id, companyMembers.userId))
    .where(and(eq(companyMembers.companyId, companyId), eq(companyMembers.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function countOwners(db: Db, companyId: string): Promise<number> {
  const rows = await db
    .select({ total: count() })
    .from(companyMembers)
    .where(and(eq(companyMembers.companyId, companyId), eq(companyMembers.role, "owner")));
  return rows[0]?.total ?? 0;
}
