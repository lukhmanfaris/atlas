import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { describe, expect, it } from "vitest";

import type { DocumentType } from "@/shared/enums";
import { createDb } from "@/worker/db/client";
import { companies, customers, documents, numberSequences } from "@/worker/db/schema";
import { issueDocumentNumber } from "@/worker/services/numbering";

import { seedCompany, seedUser, uniqueEmail } from "./helpers";

async function setup() {
  const ownerId = await seedUser(await uniqueEmail("owner"));
  const companyId = await seedCompany("Alpha Sdn Bhd");
  return { ownerId, companyId };
}

async function seedCustomer(companyId: string): Promise<string> {
  const id = uuidv7();
  const now = Date.now();
  await createDb(env.DB)
    .insert(customers)
    .values({
      id,
      companyId,
      name: `Buyer ${id.slice(-4)}`,
      billingAddress: "1 Test Road",
      createdAt: now,
      updatedAt: now,
    });
  return id;
}

async function seedDraft(
  companyId: string,
  ownerId: string,
  type: DocumentType,
  issueDate = "2026-11-24",
  sourceDocumentId?: string,
): Promise<string> {
  const customerId = await seedCustomer(companyId);
  const id = uuidv7();
  const now = Date.now();

  await createDb(env.DB).insert(documents).values({
    id,
    companyId,
    type,
    status: "draft",
    customerId,
    issueDate,
    sourceDocumentId: sourceDocumentId ?? null,
    createdBy: ownerId,
    createdAt: now,
    updatedAt: now,
  });

  return id;
}

async function issue(
  companyId: string,
  documentId: string,
  ownerId: string,
  type: DocumentType = "invoice",
  issueDate = "2026-11-24",
) {
  return issueDocumentNumber(env.DB, {
    companyId,
    documentId,
    type,
    issueDate,
    issuedAt: Date.now(),
    issuedBy: ownerId,
  });
}

async function nextValue(companyId: string, type: DocumentType) {
  const [row] = await createDb(env.DB)
    .select({ nextValue: numberSequences.nextValue })
    .from(numberSequences)
    .where(
      and(
        eq(numberSequences.companyId, companyId),
        eq(numberSequences.docType, type),
      ),
    );
  return row?.nextValue ?? null;
}

describe("issuing a number", () => {
  it("starts at 1000 and then increments", async () => {
    const { companyId, ownerId } = await setup();
    const first = await seedDraft(companyId, ownerId, "invoice");
    const second = await seedDraft(companyId, ownerId, "invoice");

    await expect(issue(companyId, first, ownerId)).resolves.toEqual({
      number: "INV-1000",
      seq: 1000,
    });
    await expect(issue(companyId, second, ownerId)).resolves.toEqual({
      number: "INV-1001",
      seq: 1001,
    });
  });

  it("gives 20 parallel drafts 20 consecutive numbers", async () => {
    const { companyId, ownerId } = await setup();
    const ids = await Promise.all(
      Array.from({ length: 20 }, () => seedDraft(companyId, ownerId, "invoice")),
    );

    const results = await Promise.all(ids.map((id) => issue(companyId, id, ownerId)));
    const numbers = results.map((result) => result?.number).sort();

    expect(numbers).toEqual(
      Array.from({ length: 20 }, (_, index) => `INV-${1000 + index}`),
    );
    expect(new Set(numbers).size).toBe(20);
  });

  it("does not consume a number for drafts that are never issued", async () => {
    const { companyId, ownerId } = await setup();
    await seedDraft(companyId, ownerId, "invoice");
    await seedDraft(companyId, ownerId, "invoice");
    const issued = await seedDraft(companyId, ownerId, "invoice");

    await expect(issue(companyId, issued, ownerId)).resolves.toMatchObject({
      number: "INV-1000",
    });
  });

  it("keeps the number of a voided document and moves on", async () => {
    const { companyId, ownerId } = await setup();
    const first = await seedDraft(companyId, ownerId, "invoice");
    await issue(companyId, first, ownerId);

    await createDb(env.DB)
      .update(documents)
      .set({ status: "void" })
      .where(eq(documents.id, first));

    const second = await seedDraft(companyId, ownerId, "invoice");
    await expect(issue(companyId, second, ownerId)).resolves.toMatchObject({
      number: "INV-1001",
    });

    const [row] = await createDb(env.DB)
      .select({ number: documents.number, status: documents.status })
      .from(documents)
      .where(eq(documents.id, first));
    expect(row).toEqual({ number: "INV-1000", status: "void" });
  });

  it("returns null and leaves the sequence alone when the document is not a draft", async () => {
    const { companyId, ownerId } = await setup();
    const documentId = await seedDraft(companyId, ownerId, "invoice");

    await issue(companyId, documentId, ownerId);
    await expect(issue(companyId, documentId, ownerId)).resolves.toBeNull();
    expect(await nextValue(companyId, "invoice")).toBe(1001);

    const next = await seedDraft(companyId, ownerId, "invoice");
    await expect(issue(companyId, next, ownerId)).resolves.toMatchObject({
      number: "INV-1001",
    });
  });

  it("counts separately per document type and per company", async () => {
    const { companyId, ownerId } = await setup();
    const other = await setup();

    const invoice = await seedDraft(companyId, ownerId, "invoice");
    const quotation = await seedDraft(companyId, ownerId, "quotation");
    const otherInvoice = await seedDraft(other.companyId, other.ownerId, "invoice");

    await expect(issue(companyId, invoice, ownerId)).resolves.toMatchObject({
      number: "INV-1000",
    });
    await expect(issue(companyId, quotation, ownerId, "quotation")).resolves.toMatchObject({
      number: "QT-1000",
    });
    await expect(issue(other.companyId, otherInvoice, other.ownerId)).resolves.toMatchObject({
      number: "INV-1000",
    });
  });

  it("records the issue year but keeps it out of the number", async () => {
    const { companyId, ownerId } = await setup();
    const documentId = await seedDraft(companyId, ownerId, "invoice", "2027-01-05");

    await expect(issue(companyId, documentId, ownerId, "invoice", "2027-01-05")).resolves.toEqual({
      number: "INV-1000",
      seq: 1000,
    });

    const [row] = await createDb(env.DB)
      .select({ seqYear: documents.seqYear })
      .from(documents)
      .where(eq(documents.id, documentId));
    expect(row?.seqYear).toBe(2027);
  });

  it("uses the prefix from company settings", async () => {
    const { companyId, ownerId } = await setup();
    await createDb(env.DB)
      .update(companies)
      .set({ prefixInvoice: "ABC" })
      .where(eq(companies.id, companyId));

    const documentId = await seedDraft(companyId, ownerId, "invoice");
    await expect(issue(companyId, documentId, ownerId)).resolves.toMatchObject({
      number: "ABC-1000",
    });
  });
});

describe("delivery order numbers", () => {
  async function issuedInvoice(companyId: string, ownerId: string) {
    const id = await seedDraft(companyId, ownerId, "invoice");
    await issue(companyId, id, ownerId);
    return id;
  }

  function draftDo(companyId: string, ownerId: string, sourceId?: string) {
    return seedDraft(companyId, ownerId, "delivery_order", "2026-11-24", sourceId);
  }

  it("takes the invoice digits", async () => {
    const { companyId, ownerId } = await setup();
    const invoice = await issuedInvoice(companyId, ownerId);
    const delivery = await draftDo(companyId, ownerId, invoice);

    await expect(issue(companyId, delivery, ownerId, "delivery_order")).resolves.toEqual({
      number: "DO-1000",
      seq: 1000,
    });
  });

  it("suffixes later delivery orders for the same invoice", async () => {
    const { companyId, ownerId } = await setup();
    const invoice = await issuedInvoice(companyId, ownerId);
    const results = [];
    for (let i = 0; i < 3; i++) {
      const delivery = await draftDo(companyId, ownerId, invoice);
      results.push(await issue(companyId, delivery, ownerId, "delivery_order"));
    }
    expect(results.map((r) => r?.number)).toEqual(["DO-1000", "DO-1000-2", "DO-1000-3"]);
  });

  it("counts a voided delivery order", async () => {
    const { companyId, ownerId } = await setup();
    const invoice = await issuedInvoice(companyId, ownerId);
    const first = await draftDo(companyId, ownerId, invoice);
    await issue(companyId, first, ownerId, "delivery_order");
    await createDb(env.DB)
      .update(documents)
      .set({ status: "void" })
      .where(eq(documents.id, first));

    const second = await draftDo(companyId, ownerId, invoice);
    await expect(issue(companyId, second, ownerId, "delivery_order")).resolves.toMatchObject({
      number: "DO-1000-2",
    });
  });

  it("refuses a delivery order without an issued invoice", async () => {
    const { companyId, ownerId } = await setup();
    const bare = await draftDo(companyId, ownerId);
    await expect(issue(companyId, bare, ownerId, "delivery_order")).resolves.toBeNull();

    const draftInvoice = await seedDraft(companyId, ownerId, "invoice");
    const fromDraft = await draftDo(companyId, ownerId, draftInvoice);
    await expect(issue(companyId, fromDraft, ownerId, "delivery_order")).resolves.toBeNull();
  });

  it("uses the delivery order prefix and the invoice seq", async () => {
    const { companyId, ownerId } = await setup();
    await createDb(env.DB)
      .update(companies)
      .set({ prefixInvoice: "ABC", prefixDeliveryOrder: "XDO" })
      .where(eq(companies.id, companyId));
    const invoice = await seedDraft(companyId, ownerId, "invoice");
    await expect(issue(companyId, invoice, ownerId)).resolves.toMatchObject({ number: "ABC-1000" });

    const delivery = await draftDo(companyId, ownerId, invoice);
    await expect(issue(companyId, delivery, ownerId, "delivery_order")).resolves.toMatchObject({
      number: "XDO-1000",
    });
  });

  it("does not advance a delivery order counter", async () => {
    const { companyId, ownerId } = await setup();
    const invoice = await issuedInvoice(companyId, ownerId);
    const delivery = await draftDo(companyId, ownerId, invoice);
    await issue(companyId, delivery, ownerId, "delivery_order");

    expect(await nextValue(companyId, "delivery_order")).toBeNull();
  });
});
