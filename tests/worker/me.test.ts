import { describe, expect, it } from "vitest";

import { call, seedCompany, seedMembership, seedUser, uniqueEmail } from "./helpers";

describe("GET /api/me", () => {
  it("returns 403 with a clear message when the email is not a registered user", async () => {
    const email = await uniqueEmail("stranger");
    const response = await call("/api/me", { as: email });

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("forbidden");
    expect(body.error.message).toContain("not registered");
  });

  it("returns 403 when the user exists but is inactive", async () => {
    const email = await uniqueEmail("inactive");
    await seedUser(email, { isActive: 0 });

    const response = await call("/api/me", { as: email });

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.message).toContain("inactive");
  });

  it("returns the user and every company they belong to, with the role", async () => {
    const email = await uniqueEmail("owner");
    const userId = await seedUser(email, { name: "Demo Owner" });
    const first = await seedCompany("Alpha Sdn Bhd");
    const second = await seedCompany("Beta Sdn Bhd");
    const other = await seedCompany("Gamma Sdn Bhd");
    await seedMembership(first, userId, "owner");
    await seedMembership(second, userId, "staff");
    await seedMembership(other, await seedUser(await uniqueEmail("other")), "owner");

    const response = await call("/api/me", { as: email });
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      user: { email: string; name: string };
      companies: { id: string; name: string; role: string }[];
    };

    expect(body.user).toMatchObject({ email, name: "Demo Owner" });
    expect(body.companies.map((company) => company.name)).toEqual([
      "Alpha Sdn Bhd",
      "Beta Sdn Bhd",
    ]);
    expect(body.companies.map((company) => company.role)).toEqual(["owner", "staff"]);
  });
});

describe("company scoping", () => {
  it("rejects a request with no X-Company-Id header", async () => {
    const email = await uniqueEmail("owner");
    const userId = await seedUser(email);
    await seedMembership(await seedCompany("Alpha Sdn Bhd"), userId, "owner");

    const response = await call(`/api/companies/${crypto.randomUUID()}/members`, { as: email });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("validation_error");
  });

  it("returns 403 and no data for a company the user does not belong to", async () => {
    const email = await uniqueEmail("outsider");
    const userId = await seedUser(email);
    const mine = await seedCompany("Alpha Sdn Bhd");
    await seedMembership(mine, userId, "staff");

    const other = await seedCompany("Secret Sdn Bhd");
    const owner = await seedUser(await uniqueEmail("owner"));
    await seedMembership(other, owner, "owner");

    const response = await call(`/api/companies/${other}/members`, {
      as: email,
      companyId: other,
    });

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string }; members?: unknown };
    expect(body.error.code).toBe("forbidden");
    expect(body.members).toBeUndefined();
  });

  it("rejects a URL company that differs from the header", async () => {
    const email = await uniqueEmail("owner");
    const userId = await seedUser(email);
    const company = await seedCompany("Alpha Sdn Bhd");
    await seedMembership(company, userId, "owner");

    const response = await call(`/api/companies/${crypto.randomUUID()}/members`, {
      as: email,
      companyId: company,
    });

    expect(response.status).toBe(400);
  });
});
