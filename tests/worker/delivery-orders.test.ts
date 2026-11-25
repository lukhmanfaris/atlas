import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { createDb } from "@/worker/db/client";
import { documentLines } from "@/worker/db/schema";

import { call, seedCompany, seedCustomer, seedMembership, seedUser, uniqueEmail } from "./helpers";

const LINES = [
  { description: "A4 Copier Paper", unit: "box", quantityMilli: 2000, unitPriceSen: 2350 },
  { description: "Delivery", unit: "trip", quantityMilli: 1000, unitPriceSen: 15000 },
];

async function issuedInvoice() {
  const email = await uniqueEmail("owner");
  const userId = await seedUser(email);
  const companyId = await seedCompany("Alpha Sdn Bhd");
  await seedMembership(companyId, userId, "owner");
  const customerId = await seedCustomer(companyId);

  const created = await call("/api/documents", {
    as: email,
    companyId,
    body: { type: "invoice", customerId, issueDate: "2026-11-24", lines: LINES },
  });
  const { document } = (await created.json()) as { document: { id: string } };

  await call(`/api/documents/${document.id}/issue`, {
    as: email,
    companyId,
    method: "POST",
  });

  return { email, userId, companyId, customerId, invoiceId: document.id };
}

function createDeliveryOrder(email: string, companyId: string, invoiceId: string) {
  return call(`/api/documents/${invoiceId}/delivery-orders`, {
    as: email,
    companyId,
    method: "POST",
  });
}

describe("delivery orders", () => {
  it("creates a draft with the remaining quantities and no prices", async () => {
    const { email, companyId, invoiceId } = await issuedInvoice();

    const response = await createDeliveryOrder(email, companyId, invoiceId);
    expect(response.status).toBe(201);

    const document = ((await response.json()) as {
      document: Record<string, unknown> & {
        type: string;
        status: string;
        sourceDocumentId: string;
        deliveryAddress: string;
        lines: Record<string, unknown>[];
      };
    }).document;

    expect(document.type).toBe("delivery_order");
    expect(document.status).toBe("draft");
    expect(document.sourceDocumentId).toBe(invoiceId);
    expect(document.deliveryAddress).toContain("Jalan Perdagangan");
    expect(document.lines.map((line) => line.quantityMilli)).toEqual([2000, 1000]);

    // No money anywhere in a delivery order response.
    const json = JSON.stringify(document);
    expect(json).not.toContain("unitPriceSen");
    expect(json).not.toContain("lineTotalSen");
    expect(json).not.toContain("subtotalSen");
    expect(json).not.toContain("totalSen");
  });

  it("allows several partial deliveries and tracks the remainder", async () => {
    const { email, companyId, invoiceId } = await issuedInvoice();
    const first = await createDeliveryOrder(email, companyId, invoiceId);
    const firstDocument = ((await first.json()) as { document: { id: string } }).document;

    const invoiceLines = (await (
      await call(`/api/documents/${invoiceId}/delivery-remaining`, { as: email, companyId })
    ).json()) as { lines: { lineId: string; description: string }[] };
    const sourceLineId = invoiceLines.lines[0]?.lineId;
    const secondSourceLineId = invoiceLines.lines[1]?.lineId;

    // Reduce the first delivery to 500 of the 2000 boxes.
    await call(`/api/documents/${firstDocument.id}`, {
      as: email,
      companyId,
      method: "PATCH",
      body: {
        lines: [
          {
            sourceLineId,
            description: "A4 Copier Paper",
            unit: "box",
            quantityMilli: 500,
            unitPriceSen: 0,
          },
          {
            sourceLineId: secondSourceLineId,
            description: "Delivery",
            unit: "trip",
            quantityMilli: 1000,
            unitPriceSen: 0,
          },
        ],
      },
    });

    const remaining = (await (
      await call(`/api/documents/${invoiceId}/delivery-remaining`, { as: email, companyId })
    ).json()) as { lines: { description: string; remainingMilli: number }[] };

    expect(remaining.lines[0]?.remainingMilli).toBe(1500);
    expect(remaining.lines[1]?.remainingMilli).toBe(0);

    const issuedFirst = await call(`/api/documents/${firstDocument.id}/issue`, {
      as: email,
      companyId,
      method: "POST",
    });
    expect(((await issuedFirst.json()) as { document: { number: string } }).document.number).toBe(
      "DO-1000",
    );

    const after = (await (
      await call(`/api/documents/${invoiceId}/delivery-remaining`, { as: email, companyId })
    ).json()) as { lines: { remainingMilli: number }[] };
    expect(after.lines[0]?.remainingMilli).toBe(1500);

    const second = await createDeliveryOrder(email, companyId, invoiceId);
    expect(second.status).toBe(201);
    const secondDocument = ((await second.json()) as {
      document: { id: string; lines: { quantityMilli: number }[] };
    }).document;
    expect(secondDocument.lines.map((line) => line.quantityMilli)).toEqual([1500]);

    const issuedSecond = await call(`/api/documents/${secondDocument.id}/issue`, {
      as: email,
      companyId,
      method: "POST",
    });
    expect(((await issuedSecond.json()) as { document: { number: string } }).document.number).toBe(
      "DO-1000-2",
    );

    const invoiceView = (await (
      await call(`/api/documents/${invoiceId}`, { as: email, companyId })
    ).json()) as { document: { linkedDeliveryOrders: { number: string }[] } };
    expect(invoiceView.document.linkedDeliveryOrders.map((d) => d.number)).toEqual([
      "DO-1000",
      "DO-1000-2",
    ]);
  });

  it("rejects a quantity above the remainder on save and on issue", async () => {
    const { email, companyId, invoiceId } = await issuedInvoice();
    const created = await createDeliveryOrder(email, companyId, invoiceId);
    const document = ((await created.json()) as { document: { id: string } }).document;
    const remaining = (await (
      await call(`/api/documents/${invoiceId}/delivery-remaining`, { as: email, companyId })
    ).json()) as { lines: { lineId: string }[] };

    const tooMany = await call(`/api/documents/${document.id}`, {
      as: email,
      companyId,
      method: "PATCH",
      body: {
        lines: [
          {
            sourceLineId: remaining.lines[0]?.lineId,
            description: "A4 Copier Paper",
            unit: "box",
            quantityMilli: 5000,
            unitPriceSen: 0,
          },
        ],
      },
    });
    expect(tooMany.status).toBe(400);

    // Simulate a race that slipped past the API, then try to issue.
    await createDb(env.DB)
      .update(documentLines)
      .set({ quantityMilli: 9999 })
      .where(eq(documentLines.documentId, document.id));

    const issued = await call(`/api/documents/${document.id}/issue`, {
      as: email,
      companyId,
      method: "POST",
    });
    expect(issued.status).toBe(409);
  });

  it("refuses drafts and void invoices", async () => {
    const email = await uniqueEmail("owner");
    const userId = await seedUser(email);
    const companyId = await seedCompany("Beta Sdn Bhd");
    await seedMembership(companyId, userId, "owner");
    const customerId = await seedCustomer(companyId);

    const draft = await call("/api/documents", {
      as: email,
      companyId,
      body: { type: "invoice", customerId, issueDate: "2026-11-24", lines: LINES },
    });
    const draftId = ((await draft.json()) as { document: { id: string } }).document.id;

    const fromDraft = await createDeliveryOrder(email, companyId, draftId);
    expect(fromDraft.status).toBe(409);

    await call(`/api/documents/${draftId}/issue`, { as: email, companyId, method: "POST" });
    await call(`/api/documents/${draftId}/void`, {
      as: email,
      companyId,
      method: "POST",
      body: { reason: "Wrong" },
    });

    const fromVoid = await createDeliveryOrder(email, companyId, draftId);
    expect(fromVoid.status).toBe(409);
  });

  it("backdates a draft delivery order and keeps the date through issue", async () => {
    const { email, companyId, invoiceId } = await issuedInvoice();
    const created = await createDeliveryOrder(email, companyId, invoiceId);
    const documentId = ((await created.json()) as { document: { id: string } }).document.id;

    const patched = await call(`/api/documents/${documentId}`, {
      as: email,
      companyId,
      method: "PATCH",
      body: { issueDate: "2026-11-01" },
    });
    expect(patched.status).toBe(200);

    const draft = (await (await call(`/api/documents/${documentId}`, { as: email, companyId })).json()) as {
      document: { issueDate: string; deliveryDate: string | null };
    };
    expect(draft.document).toMatchObject({ issueDate: "2026-11-01", deliveryDate: "2026-11-01" });

    const issued = await call(`/api/documents/${documentId}/issue`, {
      as: email,
      companyId,
      method: "POST",
    });
    expect(
      ((await issued.json()) as { document: { issueDate: string; deliveryDate: string | null } })
        .document,
    ).toMatchObject({ issueDate: "2026-11-01", deliveryDate: "2026-11-01" });
  });

  it("marks delivered and returns the quantities when voided", async () => {
    const { email, companyId, invoiceId } = await issuedInvoice();
    const created = await createDeliveryOrder(email, companyId, invoiceId);
    const document = ((await created.json()) as { document: { id: string } }).document;

    await call(`/api/documents/${document.id}/issue`, {
      as: email,
      companyId,
      method: "POST",
    });

    const delivered = await call(`/api/documents/${document.id}/mark-delivered`, {
      as: email,
      companyId,
      method: "POST",
      body: { receivedBy: "Aminah" },
    });
    expect(delivered.status).toBe(200);
    expect(
      ((await delivered.json()) as { document: { status: string; receivedBy: string } }).document,
    ).toMatchObject({ status: "delivered", receivedBy: "Aminah" });

    const depleted = (await (
      await call(`/api/documents/${invoiceId}/delivery-remaining`, { as: email, companyId })
    ).json()) as { lines: { remainingMilli: number }[] };
    expect(depleted.lines[0]?.remainingMilli).toBe(0);

    await call(`/api/documents/${document.id}/void`, {
      as: email,
      companyId,
      method: "POST",
      body: { reason: "Returned" },
    });

    const restored = (await (
      await call(`/api/documents/${invoiceId}/delivery-remaining`, { as: email, companyId })
    ).json()) as { lines: { remainingMilli: number }[] };
    expect(restored.lines[0]?.remainingMilli).toBe(2000);
  });
});
