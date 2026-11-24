import { describe, expect, it } from "vitest";

import { call, seedCompany, seedCustomer, seedMembership, seedUser, uniqueEmail } from "./helpers";

const LINES = [{ description: "Item", unit: "pcs", quantityMilli: 1000, unitPriceSen: 1000 }];

describe("audit log", () => {
  it("is owner-only", async () => {
    const email = await uniqueEmail("staff");
    const userId = await seedUser(email);
    const companyId = await seedCompany("Alpha Sdn Bhd");
    await seedMembership(companyId, userId, "staff");

    const response = await call("/api/audit-log", { as: email, companyId });
    expect(response.status).toBe(403);
  });

  it("shows an issue newest first with who did it", async () => {
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
    await call(`/api/documents/${document.id}/issue`, { as: email, companyId, method: "POST" });
    await call(`/api/documents/${document.id}/void`, {
      as: email,
      companyId,
      method: "POST",
      body: { reason: "Wrong amount" },
    });

    const response = await call("/api/audit-log", { as: email, companyId });
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      entries: { action: string; entityId: string; userEmail: string }[];
    };

    expect(body.entries[0]?.action).toBe("document.void");
    expect(body.entries[1]?.action).toBe("document.issue");
    expect(body.entries[1]?.entityId).toBe(document.id);
    expect(body.entries[1]?.userEmail).toBe(email);
  });
});
