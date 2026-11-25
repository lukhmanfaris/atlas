import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { describe, expect, it, vi } from "vitest";

import { createDb } from "@/worker/db/client";
import { customers, documents } from "@/worker/db/schema";
import { renderDocumentHtml, type PdfModel } from "@/worker/pdf";
import {
  ensurePaidPdf,
  ensureStoredPdf,
  ensureVoidPdf,
  renderUnstoredPdf,
} from "@/worker/services/pdf";

import { seedCompany, seedUser, uniqueEmail } from "./helpers";

const COMPANY_SNAPSHOT = {
  name: "Atlas Trading Sdn Bhd",
  registrationNo: "202601000001 (1234567-A)",
  addressLines: ["12 Jalan Contoh Satu", "50450 Kuala Lumpur", "Wilayah Persekutuan", "Malaysia"],
  phone: "03-1234 5678",
  email: "hello@atlas-trading.example",
  logoKey: null,
  brandColor: "#111827",
  bankName: "Maybank",
  bankAccountName: "Atlas Trading Sdn Bhd",
  bankAccountNo: "5140 1234 5678",
  sstRegistered: false,
  paymentInstructions: null,
  stampKey: null,
};

const CUSTOMER_SNAPSHOT = {
  name: "Maju Jaya Sdn Bhd",
  registrationNo: "202001000011",
  billingAddress: "15 Jalan Perdagangan\n50000 Kuala Lumpur",
  contactPerson: "Aminah",
  phone: "03-2222 3333",
};

function model(overrides: Partial<PdfModel> = {}): PdfModel {
  return {
    variant: "normal",
    type: "invoice",
    number: "INV-1000",
    issueDate: "2026-11-24",
    dueDate: "2026-12-24",
    validUntil: null,
    deliveryDate: null,
    terms: null,
    notes: null,
    deliveryAddress: null,
    vehicleNo: null,
    driverName: null,
    receivedBy: null,
    company: { ...COMPANY_SNAPSHOT, logoUrl: null },
    customer: CUSTOMER_SNAPSHOT,
    lines: [
      {
        lineNo: 1,
        sku: "BOX-A4",
        description: "A4 Copier Paper",
        unit: "box",
        quantityMilli: 2500,
        unitPriceSen: 2350,
        discountSen: 0,
        lineTotalSen: 5875,
      },
    ],
    subtotalSen: 5875,
    discountSen: 0,
    taxSen: 0,
    totalSen: 5875,
    amountInWords: "RINGGIT MALAYSIA FIFTY EIGHT AND SEN SEVENTY FIVE ONLY",
    sourceNumber: null,
    ...overrides,
  };
}

describe("document templates", () => {
  it("renders an invoice without SST wording", () => {
    const html = renderDocumentHtml(model()).toString();

    expect(html).toContain("INVOICE");
    expect(html).toContain("INV-1000");
    expect(html).toContain("Maju Jaya Sdn Bhd");
    expect(html).toContain("A4 Copier Paper");
    expect(html).toContain("58.75");
    expect(html).toContain("Amount in words");
    expect(html).not.toContain("TAX INVOICE");
    expect(html).not.toContain("SST");
  });

  it("shows no prices anywhere on a delivery order", () => {
    const html = renderDocumentHtml(
      model({ type: "delivery_order", number: "DO-1000", sourceNumber: "INV-1000" }),
    ).toString();

    expect(html).toContain("DELIVERY ORDER");
    expect(html).toContain("Item Code");
    expect(html).toContain("Received in good order");
    expect(html).not.toContain("Unit Price");
    expect(html).not.toContain("Total (RM)");
    expect(html).not.toContain("23.50");
    expect(html).not.toContain("58.75");
  });

  it("marks a draft and says it is not valid", () => {
    const html = renderDocumentHtml(model({ variant: "draft", number: null })).toString();

    expect(html).toContain("DRAFT");
    expect(html).toContain("not yet issued");
  });

  it("prints payment instructions under the bank details", () => {
    const html = renderDocumentHtml(
      model({
        company: {
          ...COMPANY_SNAPSHOT,
          logoUrl: null,
          paymentInstructions: "DuitNow to 5140 1234 5678, ref the invoice number.",
        },
      }),
    ).toString();

    expect(html).toContain("Payment details");
    expect(html).toContain("DuitNow to 5140 1234 5678");
  });

  it("drops the Unit and Discount columns", () => {
    const invoice = renderDocumentHtml(model()).toString();
    expect(invoice).not.toContain("Discount (RM)");
    expect(invoice).not.toContain("<th>Unit</th>");

    const delivery = renderDocumentHtml(model({ type: "delivery_order" })).toString();
    expect(delivery).not.toContain("<th>Unit</th>");
  });

  it("prints the company stamp on paid invoices and on delivery orders", () => {
    const company = {
      ...COMPANY_SNAPSHOT,
      logoUrl: null,
      stampUrl: "data:image/png;base64,AAAA",
    };

    expect(renderDocumentHtml(model({ company, paid: true })).toString()).toContain('class="stamp"');
    expect(
      renderDocumentHtml(model({ company, type: "delivery_order" })).toString(),
    ).toContain('class="stamp"');
    expect(renderDocumentHtml(model({ company })).toString()).not.toContain('class="stamp"');
  });

  it("prints item details under the description", () => {
    const html = renderDocumentHtml(
      model({
        lines: [
          {
            lineNo: 1,
            sku: "BOX-A4",
            description: "Flyer",
            details: "2-colour print, 250 gsm art card, front and back",
            unit: "lot",
            quantityMilli: 1000,
            unitPriceSen: 1000,
            discountSen: 0,
            lineTotalSen: 1000,
          },
        ],
      }),
    ).toString();

    expect(html).toContain('class="line-details"');
    expect(html).toContain("2-colour print");
  });

  it("shows the stamp on an invoice draft as well", () => {
    const company = { ...COMPANY_SNAPSHOT, logoUrl: null, stampUrl: "data:image/png;base64,AAAA" };
    const html = renderDocumentHtml(
      model({ company, variant: "draft", number: null }),
    ).toString();

    expect(html).toContain('class="stamp"');
    expect(html).toContain("DRAFT");
  });

  it("watermarks a void copy", () => {
    const html = renderDocumentHtml(model({ variant: "void" })).toString();
    expect(html).toContain("VOID");
  });

  it("escapes user text", () => {
    const html = renderDocumentHtml(
      model({
        customer: { ...CUSTOMER_SNAPSHOT, name: '<script>alert("x")</script>' },
      }),
    ).toString();

    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain('<script>alert("x")</script>');
  });

  it("repeats the table header and keeps every line for a 30-line document", () => {
    const lines = Array.from({ length: 30 }, (_, index) => ({
      lineNo: index + 1,
      sku: `SKU-${index + 1}`,
      description: `Line item ${index + 1}`,
      unit: "pcs",
      quantityMilli: 1000,
      unitPriceSen: 1000,
      discountSen: 0,
      lineTotalSen: 1000,
    }));

    const html = renderDocumentHtml(model({ lines })).toString();

    expect(html).toContain("display: table-header-group");
    expect(html).toContain("Line item 1");
    expect(html).toContain("Line item 30");
    expect(html).toContain("page-break-inside: avoid");
  });
});

async function seedDocument(options: {
  status: "draft" | "issued" | "void";
  number: string | null;
}) {
  const db = createDb(env.DB);
  const ownerId = await seedUser(await uniqueEmail("owner"));
  const companyId = await seedCompany("Atlas Trading Sdn Bhd");
  const customerId = uuidv7();
  const now = Date.now();

  await db.insert(customers).values({
    id: customerId,
    companyId,
    name: CUSTOMER_SNAPSHOT.name,
    billingAddress: CUSTOMER_SNAPSHOT.billingAddress,
    createdAt: now,
    updatedAt: now,
  });

  const documentId = uuidv7();
  await db.insert(documents).values({
    id: documentId,
    companyId,
    type: "invoice",
    status: options.status,
    number: options.number,
    seq: options.number ? 1000 : null,
    seqYear: options.number ? 2026 : null,
    customerId,
    customerSnapshot: JSON.stringify(CUSTOMER_SNAPSHOT),
    companySnapshot: JSON.stringify(COMPANY_SNAPSHOT),
    issueDate: "2026-11-24",
    dueDate: "2026-12-24",
    subtotalSen: 5875,
    totalSen: 5875,
    amountInWords: "RINGGIT MALAYSIA FIFTY EIGHT AND SEN SEVENTY FIVE ONLY",
    issuedAt: options.status === "draft" ? null : now,
    issuedBy: options.status === "draft" ? null : ownerId,
    createdBy: ownerId,
    createdAt: now,
    updatedAt: now,
  });

  await env.DB.prepare(
    `INSERT INTO document_lines (id, document_id, line_no, sku, description, unit,
       quantity_milli, unit_price_sen, discount_sen, tax_rate_bp, line_total_sen)
     VALUES (?, ?, 1, 'BOX-A4', 'A4 Copier Paper', 'box', 2500, 2350, 0, 0, 5875)`,
  )
    .bind(uuidv7(), documentId)
    .run();

  return { companyId, documentId, db };
}

describe("PDF storage", () => {
  it("generates an issued PDF once and reuses the stored file", async () => {
    const { companyId, documentId, db } = await seedDocument({
      status: "issued",
      number: "INV-1000",
    });
    const render = vi.fn(async () => new Uint8Array([37, 80, 68, 70]));
    const deps = { d1: env.DB, r2: env.FILES, render };

    const first = await ensureStoredPdf(deps, { companyId, documentId });
    expect(first).toEqual({ key: `${companyId}/invoice/2026/INV-1000.pdf`, created: true });

    const second = await ensureStoredPdf(deps, { companyId, documentId });
    expect(second).toEqual({ key: `${companyId}/invoice/2026/INV-1000.pdf`, created: false });
    expect(render).toHaveBeenCalledTimes(1);

    const [row] = await db
      .select({ key: documents.pdfR2Key, sha: documents.pdfSha256 })
      .from(documents)
      .where(eq(documents.id, documentId));
    expect(row?.key).toBe(`${companyId}/invoice/2026/INV-1000.pdf`);
    expect(row?.sha).toMatch(/^[0-9a-f]{64}$/);
  });

  it("never stores a draft PDF", async () => {
    const { companyId, documentId } = await seedDocument({ status: "draft", number: null });
    const render = vi.fn(async () => new Uint8Array([1, 2, 3]));
    const deps = { d1: env.DB, r2: env.FILES, render };

    await expect(ensureStoredPdf(deps, { companyId, documentId })).resolves.toBeNull();
    expect(render).not.toHaveBeenCalled();

    const preview = await renderUnstoredPdf(deps, { companyId, documentId });
    expect(preview).toBeInstanceOf(Uint8Array);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("keeps the original when storing a VOID copy", async () => {
    const { companyId, documentId, db } = await seedDocument({
      status: "issued",
      number: "INV-1000",
    });
    const render = vi.fn(async () => new Uint8Array([9]));
    const deps = { d1: env.DB, r2: env.FILES, render };

    await ensureStoredPdf(deps, { companyId, documentId });
    await db
      .update(documents)
      .set({ status: "void", voidedAt: Date.now(), voidReason: "Wrong amount" })
      .where(eq(documents.id, documentId));

    const original = await env.FILES.get(`${companyId}/invoice/2026/INV-1000.pdf`);
    const originalBody = await original?.arrayBuffer();

    const voidCopy = await ensureVoidPdf(deps, { companyId, documentId });
    expect(voidCopy).toEqual({
      key: `${companyId}/invoice/2026/INV-1000-void.pdf`,
      created: true,
    });

    const stillThere = await env.FILES.get(`${companyId}/invoice/2026/INV-1000.pdf`);
    expect(await stillThere?.arrayBuffer()).toEqual(originalBody);
  });

  it("stores a paid copy without touching the issued file", async () => {
    const { companyId, documentId, db } = await seedDocument({
      status: "issued",
      number: "INV-1002",
    });
    const render = vi.fn(async () => new Uint8Array([7]));
    const deps = { d1: env.DB, r2: env.FILES, render };

    await ensureStoredPdf(deps, { companyId, documentId });
    const original = await env.FILES.get(`${companyId}/invoice/2026/INV-1002.pdf`);
    const before = await original?.arrayBuffer();

    await db.update(documents).set({ paidAt: Date.now() }).where(eq(documents.id, documentId));

    const paid = await ensurePaidPdf(deps, { companyId, documentId });
    expect(paid).toEqual({
      key: `${companyId}/invoice/2026/INV-1002-paid.pdf`,
      created: true,
    });

    const still = await env.FILES.get(`${companyId}/invoice/2026/INV-1002.pdf`);
    expect(await still?.arrayBuffer()).toEqual(before);
  });

  it("fails loudly without recording a PDF when Browser Run fails", async () => {
    const { companyId, documentId, db } = await seedDocument({
      status: "issued",
      number: "INV-1001",
    });
    const deps = {
      d1: env.DB,
      r2: env.FILES,
      render: async () => {
        throw new Error("Browser Run unavailable");
      },
    };

    await expect(ensureStoredPdf(deps, { companyId, documentId })).rejects.toThrow(
      "Browser Run unavailable",
    );

    const [row] = await db
      .select({ key: documents.pdfR2Key })
      .from(documents)
      .where(eq(documents.id, documentId));
    expect(row?.key).toBeNull();
  });
});
