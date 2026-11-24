import { Hono, type Context } from "hono";
import type { ZodError } from "zod";

import { createItemSchema, updateItemSchema, type ItemDto } from "@/shared/items";

import { requireCompany } from "@/worker/auth/company";
import type { AppEnv } from "@/worker/auth/middleware";
import { createDb } from "@/worker/db/client";
import {
  allocateSku,
  createItem,
  findItem,
  findItemBySku,
  listItems,
  updateItem,
} from "@/worker/db/items";
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
  const manualSku = parsed.data.sku?.trim() || null;
  const category = parsed.data.category ?? null;

  if (manualSku && (await findItemBySku(db, companyId, manualSku))) {
    return apiError(c, 400, "validation_error", "That SKU is already used.", [skuTaken()]);
  }

  // With a category and no typed SKU, the number is assigned here.
  let id: string | null = null;
  for (let attempt = 0; attempt < 3 && id === null; attempt += 1) {
    const sku = manualSku ?? (category ? await allocateSku(db, companyId, category) : null);

    try {
      id = await createItem(db, companyId, { ...parsed.data, sku });
    } catch (error) {
      const conflict = error instanceof Error && error.message.includes("UNIQUE");
      if (!conflict) throw error;
      if (manualSku) {
        return apiError(c, 400, "validation_error", "That SKU is already used.", [skuTaken()]);
      }
      // Generated SKU collided with a typed one: take the next number.
    }
  }

  if (id === null) {
    return apiError(
      c,
      409,
      "conflict",
      "Could not assign a SKU just now. Please try again.",
    );
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
