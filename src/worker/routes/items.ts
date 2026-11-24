import { Hono, type Context } from "hono";
import type { ZodError } from "zod";

import { createItemSchema, updateItemSchema, type ItemDto } from "@/shared/items";

import { requireCompany } from "@/worker/auth/company";
import type { AppEnv } from "@/worker/auth/middleware";
import { createDb } from "@/worker/db/client";
import { createItem, findItem, findItemBySku, listItems, updateItem } from "@/worker/db/items";
import type { Item } from "@/worker/db/schema";
import { apiError } from "@/worker/errors";

export const itemRoutes = new Hono<AppEnv>();

function toDto(item: Item): ItemDto {
  return { ...item, isArchived: item.isArchived === 1 };
}

function validationDetails(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

function skuTaken() {
  return {
    path: "sku",
    message: "That SKU is already used by another item in this company.",
  };
}

async function readJson(c: Context<AppEnv>): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

itemRoutes.get("/", requireCompany, async (c) => {
  const q = c.req.query("q")?.trim();
  const includeArchived = ["1", "true", "yes"].includes(
    (c.req.query("include_archived") ?? "").toLowerCase(),
  );

  const rows = await listItems(createDb(c.env.DB), c.get("company").id, {
    q: q || undefined,
    includeArchived,
  });

  return c.json({ items: rows.map(toDto) });
});

itemRoutes.post("/", requireCompany, async (c) => {
  const parsed = createItemSchema.safeParse(await readJson(c));
  if (!parsed.success) {
    return apiError(
      c,
      400,
      "validation_error",
      "Check the item details and try again.",
      validationDetails(parsed.error),
    );
  }

  const db = createDb(c.env.DB);
  const companyId = c.get("company").id;
  const sku = parsed.data.sku?.trim();

  if (sku && (await findItemBySku(db, companyId, sku))) {
    return apiError(c, 400, "validation_error", "That SKU is already used.", [skuTaken()]);
  }

  let id: string;
  try {
    id = await createItem(db, companyId, parsed.data);
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      return apiError(c, 400, "validation_error", "That SKU is already used.", [skuTaken()]);
    }
    throw error;
  }

  const item = await findItem(db, companyId, id);
  if (!item) {
    return apiError(c, 500, "internal_error", "The item could not be read back.");
  }

  return c.json({ item: toDto(item) }, 201);
});

itemRoutes.patch("/:itemId", requireCompany, async (c) => {
  const parsed = updateItemSchema.safeParse(await readJson(c));
  if (!parsed.success) {
    return apiError(
      c,
      400,
      "validation_error",
      "Check the item details and try again.",
      validationDetails(parsed.error),
    );
  }

  if (Object.keys(parsed.data).length === 0) {
    return apiError(c, 400, "validation_error", "Nothing to update.");
  }

  const db = createDb(c.env.DB);
  const companyId = c.get("company").id;
  const itemId = c.req.param("itemId");

  if (!(await findItem(db, companyId, itemId))) {
    return apiError(c, 404, "not_found", "Item not found.");
  }

  const sku = parsed.data.sku?.trim();
  if (sku) {
    const existing = await findItemBySku(db, companyId, sku);
    if (existing && existing.id !== itemId) {
      return apiError(c, 400, "validation_error", "That SKU is already used.", [skuTaken()]);
    }
  }

  try {
    await updateItem(db, companyId, itemId, parsed.data);
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      return apiError(c, 400, "validation_error", "That SKU is already used.", [skuTaken()]);
    }
    throw error;
  }

  const item = await findItem(db, companyId, itemId);
  if (!item) {
    return apiError(c, 500, "internal_error", "The item could not be read back.");
  }

  return c.json({ item: toDto(item) });
});
