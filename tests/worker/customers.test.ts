import { describe, expect, it } from "vitest";

import { call, seedCompany, seedMembership, seedUser, uniqueEmail } from "./helpers";

async function setup(role: "owner" | "staff" = "owner") {
  const email = await uniqueEmail(role);
  const userId = await seedUser(email);
  const companyId = await seedCompany("Alpha Sdn Bhd");
  await seedMembership(companyId, userId, role);
  return { email, userId, companyId };
}

const BASE_CUSTOMER = {
  name: "Maju Jaya Sdn Bhd",
  billingAddress: "15 Jalan Perdagangan\n50000 Kuala Lumpur",
};

async function createCustomer(
  email: string,
  companyId: string,
  body: Record<string, unknown> = {},
) {
  return call("/api/customers", {
    as: email,
    companyId,
    body: { ...BASE_CUSTOMER, ...body },
  });
}

describe("POST /api/customers", () => {
  it("creates a customer with only the required fields", async () => {
    const { email, companyId } = await setup("staff");

    const response = await createCustomer(email, companyId);
    expect(response.status).toBe(201);

    const body = (await response.json()) as {
      customer: { name: string; isArchived: boolean; deliveryAddress: string | null };
    };
    expect(body.customer).toMatchObject({
      name: BASE_CUSTOMER.name,
      isArchived: false,
      deliveryAddress: null,
    });
  });

  it("requires a name and a billing address", async () => {
    const { email, companyId } = await setup();

    const noName = await call("/api/customers", {
      as: email,
      companyId,
      body: { billingAddress: "Somewhere" },
    });
    expect(noName.status).toBe(400);

    const noAddress = await call("/api/customers", {
      as: email,
      companyId,
      body: { name: "Someone" },
    });
    expect(noAddress.status).toBe(400);
  });

  it("validates the email when present and stores an empty one as null", async () => {
    const { email, companyId } = await setup();

    const invalid = await createCustomer(email, companyId, { email: "not-an-email" });
    expect(invalid.status).toBe(400);

    const blank = await createCustomer(email, companyId, { email: "" });
    expect(blank.status).toBe(201);
    const body = (await blank.json()) as { customer: { email: string | null } };
    expect(body.customer.email).toBeNull();
  });

  it("rejects unknown fields", async () => {
    const { email, companyId } = await setup();

    const response = await createCustomer(email, companyId, { isArchived: 1 });
    expect(response.status).toBe(400);
  });
});

describe("GET /api/customers", () => {
  it("only returns customers of the current company", async () => {
    const { email, companyId } = await setup();
    const other = await setup();
    await createCustomer(email, companyId, { name: "Mine Sdn Bhd" });
    await createCustomer(other.email, other.companyId, { name: "Theirs Sdn Bhd" });

    const response = await call("/api/customers", { as: email, companyId });
    expect(response.status).toBe(200);

    const body = (await response.json()) as { customers: { name: string }[] };
    expect(body.customers.map((customer) => customer.name)).toEqual(["Mine Sdn Bhd"]);
  });

  it("searches by name", async () => {
    const { email, companyId } = await setup();
    await createCustomer(email, companyId, { name: "Alpha Trading" });
    await createCustomer(email, companyId, { name: "Beta Services" });

    const response = await call("/api/customers?q=beta", { as: email, companyId });
    const body = (await response.json()) as { customers: { name: string }[] };

    expect(body.customers.map((customer) => customer.name)).toEqual(["Beta Services"]);
  });

  it("hides archived customers unless asked for them", async () => {
    const { email, companyId } = await setup();
    const created = await createCustomer(email, companyId, { name: "Gone Sdn Bhd" });
    const { customer } = (await created.json()) as { customer: { id: string } };

    await call(`/api/customers/${customer.id}`, {
      as: email,
      companyId,
      method: "PATCH",
      body: { isArchived: 1 },
    });

    const withoutArchived = await call("/api/customers", { as: email, companyId });
    const hidden = (await withoutArchived.json()) as { customers: unknown[] };
    expect(hidden.customers).toHaveLength(0);

    const withArchived = await call("/api/customers?include_archived=1", { as: email, companyId });
    const shown = (await withArchived.json()) as { customers: { isArchived: boolean }[] };
    expect(shown.customers).toHaveLength(1);
    expect(shown.customers[0]?.isArchived).toBe(true);
  });

  it("returns 403 for a company the user does not belong to", async () => {
    const { email } = await setup();
    const other = await setup();

    const response = await call("/api/customers", { as: email, companyId: other.companyId });
    expect(response.status).toBe(403);
  });
});

describe("PATCH /api/customers/:id", () => {
  it("lets staff edit a customer", async () => {
    const { email, companyId } = await setup("staff");
    const created = await createCustomer(email, companyId);
    const { customer } = (await created.json()) as { customer: { id: string } };

    const response = await call(`/api/customers/${customer.id}`, {
      as: email,
      companyId,
      method: "PATCH",
      body: { contactPerson: "Aminah", paymentTermsDays: 14 },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      customer: { contactPerson: string; paymentTermsDays: number };
    };
    expect(body.customer).toMatchObject({ contactPerson: "Aminah", paymentTermsDays: 14 });
  });

  it("returns 404 for a customer belonging to another company", async () => {
    const { email, companyId } = await setup();
    const other = await setup();
    const created = await createCustomer(other.email, other.companyId);
    const { customer } = (await created.json()) as { customer: { id: string } };

    const response = await call(`/api/customers/${customer.id}`, {
      as: email,
      companyId,
      method: "PATCH",
      body: { name: "Hijacked" },
    });

    expect(response.status).toBe(404);
  });

  it("rejects an empty patch", async () => {
    const { email, companyId } = await setup();
    const created = await createCustomer(email, companyId);
    const { customer } = (await created.json()) as { customer: { id: string } };

    const response = await call(`/api/customers/${customer.id}`, {
      as: email,
      companyId,
      method: "PATCH",
      body: {},
    });

    expect(response.status).toBe(400);
  });
});
