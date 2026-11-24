import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { describe, expect, it } from "vitest";

import { createDb } from "@/worker/db/client";
import { documents } from "@/worker/db/schema";

import { call, seedCompany, seedCustomer, seedMembership, seedUser, uniqueEmail } from "./helpers";

const LINES = [
  { description: "A4 Copier Paper", unit: "box", quantityMilli: 1000, unitPriceSen: 2350 },
];

async function setup(options: { terms?: number } = {}) {
  const email = await uniqueEmail("owner");
  const userId = await seedUser(email);
  const companyId = await seedCompany("Alpha Sdn Bhd");
  await seedMembership(companyId, userId, "owner");
  const customerId = await seedCustomer(companyId);

  if (options.terms !== undefined) {
    await call(`/api/customers/${customerId}`, {
      as: email,
      companyId,
      method: "PATCH",
      body: { paymentTermsDays: options.terms },
    });
  }

  return { email, userId, companyId, customerId };
}

function createInvoice(
  email: string,
  companyId: string,
  customerId: string,
  overrides: Record<string, unknown> = {},
) {
  return call("/api/documents", {
    as: email,
    companyId,
    body: {
      type: "invoice",
      customerId,
      issueDate: "2026-11-24",
      lines: LINES,
      ...overrides,
    },
  });
}

async function issueDocument(email: string, companyId: string, id: string) {
  return call(`/api/documents/${id}/issue`, { as: email, companyId, method: "POST" });
}

describe("invoices", () => {
  it("defaults the due date to the customer's terms, then the company default", async () => {
    const withTerms = await setup({ terms: 14 });
    const first = await createInvoice(withTerms.email, withTerms.companyId, withTerms.customerId);
    const firstBody = (await first.json()) as { document: { dueDate: string; validUntil: null } };
    expect(firstBody.document.dueDate).toBe("2026-12-08"); // + 14 days
    expect(firstBody.document.validUntil).toBeNull();

    const defaultTerms = await setup();
    const second = await createInvoice(
      defaultTerms.email,
      defaultTerms.companyId,
      defaultTerms.customerId,
    );
    expect(((await second.json()) as { document: { dueDate: string } }).document.dueDate).toBe(
      "2026-12-24", // company default 30 days
    );
  });

  it("issues with an INV number, totals frozen and words set", async () => {
    const { email, companyId, customerId } = await setup();
    const created = await createInvoice(email, companyId, customerId);
    const { document } = (await created.json()) as { document: { id: string } };

    const issued = await issueDocument(email, companyId, document.id);
    expect(issued.status).toBe(200);

    const body = (await issued.json()) as {
      document: {
        status: string;
        number: string;
        amountInWords: string;
        customerSnapshot: string;
        pdfR2Key: string | null;
      };
    };

    expect(body.document.number).toBe("INV-1000");
    expect(body.document.status).toBe("issued");
    expect(body.document.amountInWords).toContain("RINGGIT MALAYSIA");
    expect(JSON.parse(body.document.customerSnapshot)).toMatchObject({ name: "Maju Jaya Sdn Bhd" });
    // Browser Run is off in tests; issuing still succeeds.
    expect(body.document.pdfR2Key).toBeNull();
  });

  it("cannot be edited once issued", async () => {
    const { email, companyId, customerId } = await setup();
    const created = await createInvoice(email, companyId, customerId);
    const { document } = (await created.json()) as { document: { id: string } };
    await issueDocument(email, companyId, document.id);

    const response = await call(`/api/documents/${document.id}`, {
      as: email,
      companyId,
      method: "PATCH",
      body: { notes: "changed" },
    });

    expect(response.status).toBe(409);
  });

  it("blocks voiding while a non-void delivery order exists", async () => {
    const { email, userId, companyId, customerId } = await setup();
    const created = await createInvoice(email, companyId, customerId);
    const { document } = (await created.json()) as { document: { id: string } };
    await issueDocument(email, companyId, document.id);

    const db = createDb(env.DB);
    const deliveryOrderId = uuidv7();
    await db.insert(documents).values({
      id: deliveryOrderId,
      companyId,
      type: "delivery_order",
      status: "issued",
      customerId,
      sourceDocumentId: document.id,
      issueDate: "2026-11-24",
      createdBy: userId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const blocked = await call(`/api/documents/${document.id}/void`, {
      as: email,
      companyId,
      method: "POST",
      body: { reason: "Wrong amount" },
    });
    expect(blocked.status).toBe(409);

    await db.update(documents).set({ status: "void" }).where(eq(documents.id, deliveryOrderId));

    const allowed = await call(`/api/documents/${document.id}/void`, {
      as: email,
      companyId,
      method: "POST",
      body: { reason: "Wrong amount" },
    });
    expect(allowed.status).toBe(200);
  });

  it("keeps invoices and quotations in separate lists and counters", async () => {
    const { email, companyId, customerId } = await setup();
    const invoice = await createInvoice(email, companyId, customerId);
    const quotation = await call("/api/documents", {
      as: email,
      companyId,
      body: {
        type: "quotation",
        customerId,
        issueDate: "2026-11-24",
        lines: LINES,
      },
    });

    expect(invoice.status).toBe(201);
    expect(quotation.status).toBe(201);

    const invoices = (await (
      await call("/api/documents?type=invoice", { as: email, companyId })
    ).json()) as { documents: unknown[] };
    const quotations = (await (
      await call("/api/documents?type=quotation", { as: email, companyId })
    ).json()) as { documents: unknown[] };

    expect(invoices.documents).toHaveLength(1);
    expect(quotations.documents).toHaveLength(1);
  });
});

describe("mark as paid", () => {
  it("records a chosen date and can be undone", async () => {
    const { email, companyId, customerId } = await setup();
    const created = await createInvoice(email, companyId, customerId);
    const { document } = (await created.json()) as { document: { id: string } };
    await issueDocument(email, companyId, document.id);

    const paid = await call(`/api/documents/${document.id}/mark-paid`, {
      as: email,
      companyId,
      method: "POST",
      body: { paid: true, paidOn: "2026-11-20" },
    });

    expect(paid.status).toBe(200);
    expect(
      ((await paid.json()) as { document: { paidAt: number } }).document.paidAt,
    ).toBe(Date.parse("2026-11-20T00:00:00+08:00"));

    const unpaid = await call(`/api/documents/${document.id}/mark-paid`, {
      as: email,
      companyId,
      method: "POST",
      body: { paid: false },
    });
    expect(((await unpaid.json()) as { document: { paidAt: number | null } }).document.paidAt).toBeNull();
  });

  it("refuses drafts and non-invoices", async () => {
    const { email, companyId, customerId } = await setup();
    const draft = await createInvoice(email, companyId, customerId);
    const { document } = (await draft.json()) as { document: { id: string } };

    const response = await call(`/api/documents/${document.id}/mark-paid`, {
      as: email,
      companyId,
      method: "POST",
      body: { paid: true },
    });
    expect(response.status).toBe(409);
  });

  it("lets staff mark an issued invoice paid", async () => {
    const email = await uniqueEmail("staff");
    const userId = await seedUser(email);
    const companyId = await seedCompany("Gamma Sdn Bhd");
    await seedMembership(companyId, userId, "staff");
    const customerId = await seedCustomer(companyId);

    const created = await createInvoice(email, companyId, customerId);
    const { document } = (await created.json()) as { document: { id: string } };
    await issueDocument(email, companyId, document.id);

    const paid = await call(`/api/documents/${document.id}/mark-paid`, {
      as: email,
      companyId,
      method: "POST",
      body: { paid: true },
    });
    expect(paid.status).toBe(200);
  });
});
