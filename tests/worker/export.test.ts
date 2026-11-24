import { describe, expect, it } from "vitest";

import { call, seedCompany, seedCustomer, seedMembership, seedUser, uniqueEmail } from "./helpers";

const LINES = [{ description: "Item", unit: "pcs", quantityMilli: 2000, unitPriceSen: 2350 }];

describe("CSV export", () => {
  it("writes Malaysian dates and two-decimal totals for the owner", async () => {
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

    const response = await call("/api/export/documents.csv?type=invoice", {
      as: email,
      companyId,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");

    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder().decode(bytes).replace(/^\uFEFF/, "");
    expect(text).toContain('"Number","Date","Customer","Status","Total (RM)"');
    expect(text).toContain('"INV-1000","24/11/2026","Maju Jaya Sdn Bhd","issued","47.00"');
  });

  it("accepts the company from the query string, for plain download links", async () => {
    const email = await uniqueEmail("owner");
    const userId = await seedUser(email);
    const companyId = await seedCompany("Delta Sdn Bhd");
    await seedMembership(companyId, userId, "owner");

    const response = await call(`/api/export/documents.csv?company_id=${companyId}&type=invoice`, {
      as: email,
    });

    expect(response.status).toBe(200);
  });

  it("is owner-only", async () => {
    const email = await uniqueEmail("staff");
    const userId = await seedUser(email);
    const companyId = await seedCompany("Beta Sdn Bhd");
    await seedMembership(companyId, userId, "staff");

    const response = await call("/api/export/documents.csv?type=invoice", {
      as: email,
      companyId,
    });
    expect(response.status).toBe(403);
  });

  it("filters by date range", async () => {
    const email = await uniqueEmail("owner");
    const userId = await seedUser(email);
    const companyId = await seedCompany("Gamma Sdn Bhd");
    await seedMembership(companyId, userId, "owner");
    const customerId = await seedCustomer(companyId);

    for (const issueDate of ["2026-01-10", "2026-06-10"]) {
      const created = await call("/api/documents", {
        as: email,
        companyId,
        body: { type: "invoice", customerId, issueDate, lines: LINES },
      });
      const { document } = (await created.json()) as { document: { id: string } };
      await call(`/api/documents/${document.id}/issue`, {
        as: email,
        companyId,
        method: "POST",
      });
    }

    const response = await call("/api/export/documents.csv?type=invoice&from=2026-06-01", {
      as: email,
      companyId,
    });
    const text = await response.text();

    expect(text).toContain('"INV-1001"');
    expect(text).not.toContain('"INV-1000"');
  });
});
