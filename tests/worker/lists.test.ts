import { env } from "cloudflare:workers";
import { uuidv7 } from "uuidv7";
import { describe, expect, it } from "vitest";

import { createDb } from "@/worker/db/client";
import { documents } from "@/worker/db/schema";

import { call, seedCompany, seedCustomer, seedMembership, seedUser, uniqueEmail } from "./helpers";

async function setup() {
  const email = await uniqueEmail("owner");
  const userId = await seedUser(email);
  const companyId = await seedCompany("Alpha Sdn Bhd");
  await seedMembership(companyId, userId, "owner");
  const customerA = await seedCustomer(companyId, "Alpha Buyer Sdn Bhd");
  const customerB = await seedCustomer(companyId, "Beta Buyer Sdn Bhd");
  return { email, userId, companyId, customerA, customerB };
}

const LINE = { description: "Item", unit: "pcs", quantityMilli: 1000, unitPriceSen: 1000 };

describe("document lists", () => {
  it("filters by customer and date range", async () => {
    const { email, companyId, customerA, customerB } = await setup();

    await call("/api/documents", {
      as: email,
      companyId,
      body: { type: "quotation", customerId: customerA, issueDate: "2026-01-10", lines: [LINE] },
    });
    await call("/api/documents", {
      as: email,
      companyId,
      body: { type: "quotation", customerId: customerB, issueDate: "2026-06-10", lines: [LINE] },
    });

    const byCustomer = (await (
      await call(`/api/documents?type=quotation&customer_id=${customerA}`, { as: email, companyId })
    ).json()) as { documents: unknown[] };
    expect(byCustomer.documents).toHaveLength(1);

    const byRange = (await (
      await call("/api/documents?type=quotation&from=2026-06-01&to=2026-06-30", {
        as: email,
        companyId,
      })
    ).json()) as { documents: unknown[] };
    expect(byRange.documents).toHaveLength(1);

    const none = (await (
      await call("/api/documents?type=quotation&from=2027-01-01", { as: email, companyId })
    ).json()) as { documents: unknown[] };
    expect(none.documents).toHaveLength(0);
  });

  it("pages at 50 rows", async () => {
    const { companyId, customerA, userId } = await setup();
    const db = createDb(env.DB);
    const now = Date.now();

    const rows = Array.from({ length: 51 }, (_, index) => ({
      id: uuidv7(),
      companyId,
      type: "quotation" as const,
      status: "draft",
      customerId: customerA,
      issueDate: "2026-11-24",
      createdBy: userId,
      createdAt: now + index,
      updatedAt: now + index,
    }));
    // D1 allows 100 bound parameters per statement; 39 columns per row.
    for (let index = 0; index < rows.length; index += 2) {
      await db.insert(documents).values(rows.slice(index, index + 2));
    }

    const email = await uniqueEmail("pager");
    const pagerId = await seedUser(email);
    await seedMembership(companyId, pagerId, "owner");

    const first = (await (
      await call("/api/documents?type=quotation&page=1", { as: email, companyId })
    ).json()) as { documents: unknown[]; hasMore: boolean; page: number };
    expect(first.documents).toHaveLength(50);
    expect(first.hasMore).toBe(true);
    expect(first.page).toBe(1);

    const second = (await (
      await call("/api/documents?type=quotation&page=2", { as: email, companyId })
    ).json()) as { documents: unknown[]; hasMore: boolean };
    expect(second.documents).toHaveLength(1);
    expect(second.hasMore).toBe(false);
  });
});

describe("dashboard", () => {
  it("returns drafts, the latest issued documents and undelivered invoices", async () => {
    const { email, companyId, customerA } = await setup();

    await call("/api/documents", {
      as: email,
      companyId,
      body: { type: "quotation", customerId: customerA, issueDate: "2026-11-24", lines: [LINE] },
    });

    const invoice = await call("/api/documents", {
      as: email,
      companyId,
      body: { type: "invoice", customerId: customerA, issueDate: "2026-11-24", lines: [LINE] },
    });
    const invoiceId = ((await invoice.json()) as { document: { id: string } }).document.id;
    await call(`/api/documents/${invoiceId}/issue`, {
      as: email,
      companyId,
      method: "POST",
    });

    const dashboard = (await (
      await call("/api/documents/dashboard", { as: email, companyId })
    ).json()) as {
      drafts: { type: string }[];
      latest: { number: string }[];
      awaitingDelivery: { number: string; remainingLines: number }[];
    };

    expect(dashboard.drafts).toHaveLength(1);
    expect(dashboard.drafts[0]?.type).toBe("quotation");
    expect(dashboard.latest.map((row) => row.number)).toEqual(["INV-1000"]);
    expect(dashboard.awaitingDelivery).toEqual([
      expect.objectContaining({ number: "INV-1000", remainingLines: 1 }),
    ]);
  });
});
