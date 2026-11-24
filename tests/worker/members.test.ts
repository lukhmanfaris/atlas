import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { createDb } from "@/worker/db/client";
import { auditLog } from "@/worker/db/schema";

import { call, seedCompany, seedMembership, seedUser, uniqueEmail } from "./helpers";

async function setupOwner() {
  const ownerEmail = await uniqueEmail("owner");
  const ownerId = await seedUser(ownerEmail, { name: "Demo Owner" });
  const companyId = await seedCompany("Alpha Sdn Bhd");
  await seedMembership(companyId, ownerId, "owner");
  return { ownerEmail, ownerId, companyId };
}

describe("owner-only access to member management", () => {
  it("forbids staff from listing members", async () => {
    const { companyId } = await setupOwner();
    const staffEmail = await uniqueEmail("staff");
    await seedMembership(companyId, await seedUser(staffEmail), "staff");

    const response = await call(`/api/companies/${companyId}/members`, {
      as: staffEmail,
      companyId,
    });

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("forbidden");
  });

  it("forbids staff from adding members", async () => {
    const { companyId } = await setupOwner();
    const staffEmail = await uniqueEmail("staff");
    await seedMembership(companyId, await seedUser(staffEmail), "staff");

    const response = await call(`/api/companies/${companyId}/members`, {
      as: staffEmail,
      companyId,
      body: { email: await uniqueEmail("new"), role: "staff" },
    });

    expect(response.status).toBe(403);
  });

  it("lets an owner list the members of their company", async () => {
    const { ownerEmail, companyId } = await setupOwner();
    const staffEmail = await uniqueEmail("staff");
    await seedMembership(companyId, await seedUser(staffEmail, { name: "Second Person" }), "staff");

    const response = await call(`/api/companies/${companyId}/members`, {
      as: ownerEmail,
      companyId,
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      members: { email: string; role: string; name: string; isActive: boolean }[];
    };
    expect(body.members).toHaveLength(2);
    expect(body.members.map((member) => member.role).sort()).toEqual(["owner", "staff"]);
    expect(body.members.every((member) => member.isActive)).toBe(true);
  });
});

describe("POST /api/companies/:id/members", () => {
  it("adds a brand new person and creates their user row", async () => {
    const { ownerEmail, companyId } = await setupOwner();
    const newEmail = await uniqueEmail("newcomer");

    const response = await call(`/api/companies/${companyId}/members`, {
      as: ownerEmail,
      companyId,
      body: { email: newEmail, role: "staff", name: "New Comer" },
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      member: { userId: string; email: string; name: string; role: string };
    };
    expect(body.member).toMatchObject({ email: newEmail, name: "New Comer", role: "staff" });

    const listed = (await (
      await call(`/api/companies/${companyId}/members`, { as: ownerEmail, companyId })
    ).json()) as { members: { email: string }[] };
    expect(listed.members.some((member) => member.email === newEmail)).toBe(true);
  });

  it("adds an existing user to a second company", async () => {
    const { ownerEmail, companyId } = await setupOwner();
    const existingEmail = await uniqueEmail("existing");
    await seedUser(existingEmail, { name: "Existing Person" });

    const response = await call(`/api/companies/${companyId}/members`, {
      as: ownerEmail,
      companyId,
      body: { email: existingEmail, role: "owner" },
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as { member: { name: string; role: string } };
    expect(body.member).toMatchObject({ name: "Existing Person", role: "owner" });
  });

  it("lowercases the email and refuses a duplicate membership", async () => {
    const { ownerEmail, companyId } = await setupOwner();
    const newEmail = await uniqueEmail("dup");

    const first = await call(`/api/companies/${companyId}/members`, {
      as: ownerEmail,
      companyId,
      body: { email: newEmail.toUpperCase(), role: "staff" },
    });
    expect(first.status).toBe(201);

    const second = await call(`/api/companies/${companyId}/members`, {
      as: ownerEmail,
      companyId,
      body: { email: newEmail, role: "staff" },
    });
    expect(second.status).toBe(409);
  });

  it("rejects unknown fields in the body", async () => {
    const { ownerEmail, companyId } = await setupOwner();

    const response = await call(`/api/companies/${companyId}/members`, {
      as: ownerEmail,
      companyId,
      body: { email: await uniqueEmail("new"), role: "staff", isActive: 1 },
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("validation_error");
  });

  it("writes an audit_log row for the change", async () => {
    const { ownerEmail, ownerId, companyId } = await setupOwner();
    const newEmail = await uniqueEmail("audited");

    const response = await call(`/api/companies/${companyId}/members`, {
      as: ownerEmail,
      companyId,
      body: { email: newEmail, role: "staff" },
    });
    expect(response.status).toBe(201);

    const rows = await createDb(env.DB)
      .select()
      .from(auditLog)
      .where(eq(auditLog.companyId, companyId));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "member.add", entity: "company_member", userId: ownerId });
  });
});

describe("PATCH /api/companies/:id/members/:userId", () => {
  it("changes the role of an existing member", async () => {
    const { ownerEmail, companyId } = await setupOwner();
    const staffEmail = await uniqueEmail("promoted");
    const staffId = await seedUser(staffEmail);
    await seedMembership(companyId, staffId, "staff");

    const response = await call(`/api/companies/${companyId}/members/${staffId}`, {
      as: ownerEmail,
      companyId,
      method: "PATCH",
      body: { role: "owner" },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as { member: { role: string } };
    expect(body.member.role).toBe("owner");
  });

  it("refuses to demote the only owner", async () => {
    const { ownerEmail, ownerId, companyId } = await setupOwner();

    const response = await call(`/api/companies/${companyId}/members/${ownerId}`, {
      as: ownerEmail,
      companyId,
      method: "PATCH",
      body: { role: "staff" },
    });

    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("invalid_state");
    expect(body.error.message).toContain("at least one owner");
  });

  it("allows demoting an owner when another owner remains", async () => {
    const { ownerEmail, companyId } = await setupOwner();
    const secondOwnerId = await seedUser(await uniqueEmail("owner2"));
    await seedMembership(companyId, secondOwnerId, "owner");

    const response = await call(`/api/companies/${companyId}/members/${secondOwnerId}`, {
      as: ownerEmail,
      companyId,
      method: "PATCH",
      body: { role: "staff" },
    });

    expect(response.status).toBe(200);
  });

  it("returns 404 for someone who is not a member", async () => {
    const { ownerEmail, companyId } = await setupOwner();
    const outsiderId = await seedUser(await uniqueEmail("outsider"));

    const response = await call(`/api/companies/${companyId}/members/${outsiderId}`, {
      as: ownerEmail,
      companyId,
      method: "PATCH",
      body: { role: "staff" },
    });

    expect(response.status).toBe(404);
  });
});
