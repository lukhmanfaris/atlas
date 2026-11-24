import { describe, expect, it } from "vitest";

import { addDays, todayInMalaysia } from "@/worker/services/dates";

import { call, seedCompany, seedCustomer, seedMembership, seedUser, uniqueEmail } from "./helpers";

const LINES = [
  { description: "A4 Copier Paper", unit: "box", quantityMilli: 2500, unitPriceSen: 2350 },
  {
    description: "Delivery",
    unit: "trip",
    quantityMilli: 1000,
    unitPriceSen: 15000,
    discountSen: 500,
  },
];

async function setup(role: "owner" | "staff" = "owner") {
  const email = await uniqueEmail(role);
  const userId = await seedUser(email);
  const companyId = await seedCompany("Alpha Sdn Bhd");
  await seedMembership(companyId, userId, role);
  const customerId = await seedCustomer(companyId);
  return { email, userId, companyId, customerId };
}

async function createQuotation(
  email: string,
  companyId: string,
  customerId: string,
  overrides: Record<string, unknown> = {},
) {
  const response = await call("/api/documents", {
    as: email,
    companyId,
    body: {
      type: "quotation",
      customerId,
      issueDate: "2026-11-24",
      lines: LINES,
      ...overrides,
    },
  });
  if (!response.ok) {
    throw new Error(`quotation create failed: ${response.status} ${await response.text()}`);
  }
  const body = (await response.json()) as { document: { id: string } };
  return { response, id: body.document.id, body };
}

describe("POST /api/documents (quotation)", () => {
  it("creates a draft with totals, no number and the default validity", async () => {
    const { email, companyId, customerId } = await setup();

    const { response, body } = await createQuotation(email, companyId, customerId);
    expect(response.status).toBe(201);

    const document = (
      body as unknown as {
        document: {
          status: string;
          number: string | null;
          subtotalSen: number;
          totalSen: number;
          validUntil: string;
          lines: { lineTotalSen: number; lineNo: number }[];
        };
      }
    ).document;

    expect(document.status).toBe("draft");
    expect(document.number).toBeNull();
    expect(document.validUntil).toBe("2026-12-24"); // issue date + 30 days
    expect(document.subtotalSen).toBe(20375);
    expect(document.totalSen).toBe(20375);
    expect(document.lines.map((line) => line.lineTotalSen)).toEqual([5875, 14500]);
  });

  it("accepts item-based and free-text lines", async () => {
    const { email, companyId, customerId } = await setup();

    const itemResponse = await call("/api/items", {
      as: email,
      companyId,
      body: { name: "A4 Copier Paper", sku: "BOX-A4", unit: "box", unitPriceSen: 2350 },
    });
    const { item } = (await itemResponse.json()) as { item: { id: string } };

    const { response } = await createQuotation(email, companyId, customerId, {
      lines: [
        {
          itemId: item.id,
          sku: "BOX-A4",
          description: "A4 Copier Paper",
          unit: "box",
          quantityMilli: 1000,
          unitPriceSen: 2350,
        },
        { description: "Handwritten note", unit: "lot", quantityMilli: 1000, unitPriceSen: 500 },
      ],
    });

    expect(response.status).toBe(201);
  });

  it("rejects an archived or foreign customer", async () => {
    const { email, companyId } = await setup();
    const other = await setup();

    const response = await call("/api/documents", {
      as: email,
      companyId,
      body: {
        type: "quotation",
        customerId: other.customerId,
        issueDate: "2026-11-24",
        lines: LINES,
      },
    });

    expect(response.status).toBe(400);
  });
});

describe("editing drafts", () => {
  it("replaces lines and recomputes totals", async () => {
    const { email, companyId, customerId } = await setup();
    const { id } = await createQuotation(email, companyId, customerId);

    const response = await call(`/api/documents/${id}`, {
      as: email,
      companyId,
      method: "PATCH",
      body: {
        lines: [{ description: "Only line", unit: "pcs", quantityMilli: 1000, unitPriceSen: 1000 }],
        discountSen: 250,
      },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      document: { subtotalSen: number; totalSen: number; lines: unknown[] };
    };
    expect(body.document.subtotalSen).toBe(1000);
    expect(body.document.totalSen).toBe(750);
    expect(body.document.lines).toHaveLength(1);
  });

  it("deletes a draft", async () => {
    const { email, companyId, customerId } = await setup();
    const { id } = await createQuotation(email, companyId, customerId);

    const deleted = await call(`/api/documents/${id}`, { as: email, companyId, method: "DELETE" });
    expect(deleted.status).toBe(204);

    const gone = await call(`/api/documents/${id}`, { as: email, companyId });
    expect(gone.status).toBe(404);
  });
});

describe("issuing", () => {
  it("assigns a number, freezes snapshots and words, and survives a PDF failure", async () => {
    const { email, companyId, customerId } = await setup();
    const { id } = await createQuotation(email, companyId, customerId);

    const response = await call(`/api/documents/${id}/issue`, {
      as: email,
      companyId,
      method: "POST",
    });

    expect(response.status).toBe(200);
    const document = (
      (await response.json()) as {
        document: {
          status: string;
          number: string;
          amountInWords: string;
          customerSnapshot: string;
          companySnapshot: string;
          pdfR2Key: string | null;
        };
      }
    ).document;

    expect(document.status).toBe("issued");
    expect(document.number).toBe("QT-1000");
    expect(document.amountInWords).toBe(
      "RINGGIT MALAYSIA TWO HUNDRED THREE AND SEN SEVENTY FIVE ONLY",
    );
    expect(JSON.parse(document.customerSnapshot)).toMatchObject({ name: "Maju Jaya Sdn Bhd" });
    expect(JSON.parse(document.companySnapshot)).toMatchObject({ name: "Alpha Sdn Bhd" });
    // Browser Run is not available in tests; issuing must still succeed.
    expect(document.pdfR2Key).toBeNull();
  });

  it("refuses to edit an issued quotation", async () => {
    const { email, companyId, customerId } = await setup();
    const { id } = await createQuotation(email, companyId, customerId);
    await call(`/api/documents/${id}/issue`, { as: email, companyId, method: "POST" });

    const response = await call(`/api/documents/${id}`, {
      as: email,
      companyId,
      method: "PATCH",
      body: { notes: "CHANGED" },
    });

    expect(response.status).toBe(409);
  });

  it("refuses to issue twice", async () => {
    const { email, companyId, customerId } = await setup();
    const { id } = await createQuotation(email, companyId, customerId);

    await call(`/api/documents/${id}/issue`, { as: email, companyId, method: "POST" });
    const again = await call(`/api/documents/${id}/issue`, {
      as: email,
      companyId,
      method: "POST",
    });

    expect(again.status).toBe(409);
  });
});

describe("quotation states", () => {
  it("only an owner can void, and a reason is required", async () => {
    const staff = await setup("staff");
    const { id } = await createQuotation(staff.email, staff.companyId, staff.customerId);
    await call(`/api/documents/${id}/issue`, {
      as: staff.email,
      companyId: staff.companyId,
      method: "POST",
    });

    const forbidden = await call(`/api/documents/${id}/void`, {
      as: staff.email,
      companyId: staff.companyId,
      method: "POST",
      body: { reason: "Wrong amount" },
    });
    expect(forbidden.status).toBe(403);

    const owner = await setup("owner");
    const owned = await createQuotation(owner.email, owner.companyId, owner.customerId);
    await call(`/api/documents/${owned.id}/issue`, {
      as: owner.email,
      companyId: owner.companyId,
      method: "POST",
    });

    const noReason = await call(`/api/documents/${owned.id}/void`, {
      as: owner.email,
      companyId: owner.companyId,
      method: "POST",
      body: {},
    });
    expect(noReason.status).toBe(400);

    const voided = await call(`/api/documents/${owned.id}/void`, {
      as: owner.email,
      companyId: owner.companyId,
      method: "POST",
      body: { reason: "Wrong amount" },
    });
    expect(voided.status).toBe(200);
    expect(((await voided.json()) as { document: { status: string; voidReason: string } }).document)
      .toMatchObject({ status: "void", voidReason: "Wrong amount" });
  });

  it("labels an issued quotation as expired after its validity date", async () => {
    const { email, companyId, customerId } = await setup();
    const { id } = await createQuotation(email, companyId, customerId, {
      issueDate: "2020-01-01",
      validUntil: "2020-02-01",
    });
    await call(`/api/documents/${id}/issue`, { as: email, companyId, method: "POST" });

    const list = await call("/api/documents?type=quotation", { as: email, companyId });
    const documents = ((await list.json()) as { documents: { id: string; expired: boolean }[] })
      .documents;

    expect(documents.find((entry) => entry.id === id)?.expired).toBe(true);
  });
});

describe("company scoping", () => {
  it("returns 404 for a quotation from another company", async () => {
    const mine = await setup();
    const other = await setup();
    const { id } = await createQuotation(other.email, other.companyId, other.customerId);

    const response = await call(`/api/documents/${id}`, {
      as: mine.email,
      companyId: mine.companyId,
    });

    expect(response.status).toBe(404);
  });

  it("hides quotations from another company in the list", async () => {
    const mine = await setup();
    const other = await setup();
    await createQuotation(other.email, other.companyId, other.customerId);
    await createQuotation(mine.email, mine.companyId, mine.customerId);

    const list = await call("/api/documents?type=quotation", {
      as: mine.email,
      companyId: mine.companyId,
    });
    const documents = ((await list.json()) as { documents: unknown[] }).documents;

    expect(documents).toHaveLength(1);
  });
});

describe("free-text customers", () => {
  it("creates a customer from typed details and reuses it on the exact name", async () => {
    const { email, companyId } = await setup();
    const base = {
      type: "quotation",
      issueDate: "2026-11-24",
      lines: LINES,
      customer: { name: "Baru Sdn Bhd", billingAddress: "1 Jalan Baru" },
    };

    const first = await call("/api/documents", { as: email, companyId, body: base });
    expect(first.status).toBe(201);

    const second = await call("/api/documents", {
      as: email,
      companyId,
      body: { ...base, customer: { name: "baru sdn bhd", billingAddress: "ignored" } },
    });
    expect(second.status).toBe(201);

    const list = (await (await call("/api/customers", { as: email, companyId })).json()) as {
      customers: { name: string }[];
    };
    expect(
      list.customers.filter((customer) => customer.name.toLowerCase() === "baru sdn bhd"),
    ).toHaveLength(1);
  });

  it("requires an address for a brand new customer", async () => {
    const { email, companyId } = await setup();

    const response = await call("/api/documents", {
      as: email,
      companyId,
      body: {
        type: "quotation",
        issueDate: "2026-11-24",
        lines: LINES,
        customer: { name: "No Address Sdn Bhd" },
      },
    });

    expect(response.status).toBe(400);
  });
});

describe("convert to invoice", () => {
  async function issuedQuotation(role: "owner" | "staff" = "staff") {
    const setupData = await setup(role);
    const { id } = await createQuotation(
      setupData.email,
      setupData.companyId,
      setupData.customerId,
    );
    await call(`/api/documents/${id}/issue`, {
      as: setupData.email,
      companyId: setupData.companyId,
      method: "POST",
    });
    return { ...setupData, quotationId: id };
  }

  it("copies the quotation into a linked draft invoice and accepts the quotation", async () => {
    const { email, companyId, quotationId } = await issuedQuotation();

    const response = await call(`/api/documents/${quotationId}/convert-to-invoice`, {
      as: email,
      companyId,
      method: "POST",
    });
    expect(response.status).toBe(201);

    const invoice = ((await response.json()) as {
      document: {
        id: string;
        type: string;
        status: string;
        sourceDocumentId: string;
        dueDate: string;
        subtotalSen: number;
        lines: { description: string; sourceLineId: string | null }[];
      };
    }).document;

    expect(invoice.type).toBe("invoice");
    expect(invoice.status).toBe("draft");
    expect(invoice.sourceDocumentId).toBe(quotationId);
    expect(invoice.subtotalSen).toBe(20375);
    expect(invoice.dueDate).toBe(addDays(todayInMalaysia(), 30));
    expect(invoice.lines.every((line) => line.sourceLineId !== null)).toBe(true);

    const quotation = await call(`/api/documents/${quotationId}`, { as: email, companyId });
    const body = (await quotation.json()) as {
      document: { status: string; linkedInvoices: { id: string }[] };
    };
    expect(body.document.status).toBe("accepted");
    expect(body.document.linkedInvoices[0]?.id).toBe(invoice.id);
  });

  it("refuses a second conversion while the invoice is live", async () => {
    const { email, companyId, quotationId } = await issuedQuotation();
    await call(`/api/documents/${quotationId}/convert-to-invoice`, {
      as: email,
      companyId,
      method: "POST",
    });

    const second = await call(`/api/documents/${quotationId}/convert-to-invoice`, {
      as: email,
      companyId,
      method: "POST",
    });

    expect(second.status).toBe(409);
  });

  it("refuses to convert a draft quotation", async () => {
    const { email, companyId, customerId } = await setup("staff");
    const { id } = await createQuotation(email, companyId, customerId);

    const response = await call(`/api/documents/${id}/convert-to-invoice`, {
      as: email,
      companyId,
      method: "POST",
    });

    expect(response.status).toBe(409);
  });
});
