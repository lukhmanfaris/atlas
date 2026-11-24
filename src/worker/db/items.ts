import { and, eq, like, or } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import type { CreateItemInput, UpdateItemInput } from "@/shared/items";

import type { Db } from "./client";
import { items, type Item } from "./schema";

function searchTerm(q: string): string {
  return q.replace(/[%_]/g, "").trim();
}

function cleanSku(sku: string | null | undefined): string | null {
  const trimmed = sku?.trim();
  return trimmed ? trimmed : null;
}

export async function listItems(
  db: Db,
  companyId: string,
  options: { q?: string; includeArchived?: boolean } = {},
): Promise<Item[]> {
  const filters = [eq(items.companyId, companyId)];

  if (!options.includeArchived) {
    filters.push(eq(items.isArchived, 0));
  }

  const term = options.q ? searchTerm(options.q) : "";
  if (term) {
    const pattern = `%${term}%`;
    const match = or(like(items.name, pattern), like(items.sku, pattern));
    if (match) {
      filters.push(match);
    }
  }

  return db
    .select()
    .from(items)
    .where(and(...filters))
    .orderBy(items.name)
    .limit(200);
}

export async function findItem(
  db: Db,
  companyId: string,
  itemId: string,
): Promise<Item | null> {
  const rows = await db
    .select()
    .from(items)
    .where(and(eq(items.companyId, companyId), eq(items.id, itemId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function findItemBySku(
  db: Db,
  companyId: string,
  sku: string,
): Promise<Item | null> {
  const rows = await db
    .select()
    .from(items)
    .where(and(eq(items.companyId, companyId), eq(items.sku, sku)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createItem(
  db: Db,
  companyId: string,
  input: CreateItemInput,
): Promise<string> {
  const id = uuidv7();
  const now = Date.now();

  await db.insert(items).values({
    id,
    companyId,
    sku: cleanSku(input.sku),
    name: input.name,
    description: input.description ?? null,
    unit: input.unit ?? "pcs",
    unitPriceSen: input.unitPriceSen ?? 0,
    classificationCode: input.classificationCode ?? null,
    isArchived: 0,
    createdAt: now,
    updatedAt: now,
  });

  return id;
}

export async function updateItem(
  db: Db,
  companyId: string,
  itemId: string,
  input: UpdateItemInput,
): Promise<void> {
  const updates: Record<string, unknown> = { updatedAt: Date.now() };

  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      updates[key] = key === "sku" ? cleanSku(value as string | null) : value;
    }
  }

  await db
    .update(items)
    .set(updates)
    .where(and(eq(items.companyId, companyId), eq(items.id, itemId)));
}
