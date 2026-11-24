import { describe, expect, it } from "vitest";

import { call, seedCompany, seedMembership, seedUser, uniqueEmail } from "./helpers";

async function setup(role: "owner" | "staff" = "staff") {
  const email = await uniqueEmail(role);
  const userId = await seedUser(email);
  const companyId = await seedCompany("Alpha Sdn Bhd");
  await seedMembership(companyId, userId, role);
  return { email, userId, companyId };
}

describe("POST /api/items", () => {
  it("creates an item with defaults", async () => {
    const { email, companyId } = await setup();

    const response = await call("/api/items", {
      as: email,
      companyId,
      body: { name: "A4 Copier Paper" },
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      item: { unit: string; unitPriceSen: number; sku: string | null; isArchived: boolean };
    };
    expect(body.item).toMatchObject({ unit: "pcs", unitPriceSen: 0, sku: null, isArchived: false });
  });

  it("stores the price as whole sen", async () => {
    const { email, companyId } = await setup();

    const response = await call("/api/items", {
      as: email,
      companyId,
      body: { name: "Delivery", unit: "trip", unitPriceSen: 1250 },
    });

    const body = (await response.json()) as { item: { unitPriceSen: number } };
    expect(body.item.unitPriceSen).toBe(1250);
  });

  it("rejects a duplicate SKU within the same company, naming the field", async () => {
    const { email, companyId } = await setup();

    await call("/api/items", { as: email, companyId, body: { name: "Paper", sku: "BOX-A4" } });
    const duplicate = await call("/api/items", {
      as: email,
      companyId,
      body: { name: "Other paper", sku: "BOX-A4" },
    });

    expect(duplicate.status).toBe(400);
    const body = (await duplicate.json()) as {
      error: { code: string; details: { path: string }[] };
    };
    expect(body.error.code).toBe("validation_error");
    expect(body.error.details[0]?.path).toBe("sku");
  });

  it("allows the same SKU in a different company", async () => {
    const first = await setup();
    const second = await setup();

    await call("/api/items", {
      as: first.email,
      companyId: first.companyId,
      body: { name: "Paper", sku: "BOX-A4" },
    });
    const response = await call("/api/items", {
      as: second.email,
      companyId: second.companyId,
      body: { name: "Paper", sku: "BOX-A4" },
    });

    expect(response.status).toBe(201);
  });

  it("allows several items with no SKU", async () => {
    const { email, companyId } = await setup();

    const first = await call("/api/items", { as: email, companyId, body: { name: "One" } });
    const second = await call("/api/items", { as: email, companyId, body: { name: "Two" } });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
  });

  it("rejects unknown fields", async () => {
    const { email, companyId } = await setup();

    const response = await call("/api/items", {
      as: email,
      companyId,
      body: { name: "Paper", isArchived: 1 },
    });

    expect(response.status).toBe(400);
  });

  it("returns 403 for a company the user does not belong to", async () => {
    const { email } = await setup();
    const other = await setup();

    const response = await call("/api/items", {
      as: email,
      companyId: other.companyId,
      body: { name: "Paper" },
    });

    expect(response.status).toBe(403);
  });
});

describe("GET /api/items", () => {
  it("searches by name or SKU", async () => {
    const { email, companyId } = await setup();
    await call("/api/items", {
      as: email,
      companyId,
      body: { name: "A4 Copier Paper", sku: "BOX-A4" },
    });
    await call("/api/items", {
      as: email,
      companyId,
      body: { name: "Delivery Service", sku: "SVC-DEL" },
    });

    const byName = (await (
      await call("/api/items?q=paper", { as: email, companyId })
    ).json()) as { items: { name: string }[] };
    expect(byName.items.map((item) => item.name)).toEqual(["A4 Copier Paper"]);

    const bySku = (await (
      await call("/api/items?q=svc", { as: email, companyId })
    ).json()) as { items: { name: string }[] };
    expect(bySku.items.map((item) => item.name)).toEqual(["Delivery Service"]);
  });

  it("hides archived items unless asked", async () => {
    const { email, companyId } = await setup();
    const created = await call("/api/items", {
      as: email,
      companyId,
      body: { name: "Old Item" },
    });
    const { item } = (await created.json()) as { item: { id: string } };

    await call(`/api/items/${item.id}`, {
      as: email,
      companyId,
      method: "PATCH",
      body: { isArchived: 1 },
    });

    const hidden = (await (await call("/api/items", { as: email, companyId })).json()) as {
      items: unknown[];
    };
    expect(hidden.items).toHaveLength(0);

    const shown = (await (
      await call("/api/items?include_archived=1", { as: email, companyId })
    ).json()) as { items: { isArchived: boolean }[] };
    expect(shown.items[0]?.isArchived).toBe(true);
  });

  it("only lists the current company's items", async () => {
    const { email, companyId } = await setup();
    const other = await setup();
    await call("/api/items", { as: email, companyId, body: { name: "Mine" } });
    await call("/api/items", {
      as: other.email,
      companyId: other.companyId,
      body: { name: "Theirs" },
    });

    const body = (await (await call("/api/items", { as: email, companyId })).json()) as {
      items: { name: string }[];
    };
    expect(body.items.map((item) => item.name)).toEqual(["Mine"]);
  });
});

describe("PATCH /api/items/:id", () => {
  it("lets staff edit an item", async () => {
    const { email, companyId } = await setup("staff");
    const created = await call("/api/items", {
      as: email,
      companyId,
      body: { name: "Paper", unitPriceSen: 1000 },
    });
    const { item } = (await created.json()) as { item: { id: string } };

    const response = await call(`/api/items/${item.id}`, {
      as: email,
      companyId,
      method: "PATCH",
      body: { name: "A4 Paper", unitPriceSen: 2350 },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { item: { name: string; unitPriceSen: number } };
    expect(body.item).toMatchObject({ name: "A4 Paper", unitPriceSen: 2350 });
  });

  it("rejects changing to a SKU another item already uses", async () => {
    const { email, companyId } = await setup();
    await call("/api/items", { as: email, companyId, body: { name: "One", sku: "SKU-1" } });
    const second = await call("/api/items", {
      as: email,
      companyId,
      body: { name: "Two", sku: "SKU-2" },
    });
    const { item } = (await second.json()) as { item: { id: string } };

    const response = await call(`/api/items/${item.id}`, {
      as: email,
      companyId,
      method: "PATCH",
      body: { sku: "SKU-1" },
    });

    expect(response.status).toBe(400);
  });

  it("returns 404 for an item in another company", async () => {
    const { email, companyId } = await setup();
    const other = await setup();
    const created = await call("/api/items", {
      as: other.email,
      companyId: other.companyId,
      body: { name: "Theirs" },
    });
    const { item } = (await created.json()) as { item: { id: string } };

    const response = await call(`/api/items/${item.id}`, {
      as: email,
      companyId,
      method: "PATCH",
      body: { name: "Hijacked" },
    });

    expect(response.status).toBe(404);
  });
});
