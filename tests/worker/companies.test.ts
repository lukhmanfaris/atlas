import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { createDb } from "@/worker/db/client";
import { auditLog, companies } from "@/worker/db/schema";

import { call, seedCompany, seedMembership, seedUser, uniqueEmail } from "./helpers";

const PNG_1PX = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (character) => character.charCodeAt(0),
);

function pngFile(bytes: Uint8Array = PNG_1PX, name = "logo.png") {
  return new File([bytes], name, { type: "image/png" });
}

function formWithLogo(file: File) {
  const form = new FormData();
  form.append("logo", file);
  return form;
}

const NEW_COMPANY = {
  name: "Gamma Holdings Sdn Bhd",
  registrationNo: "202601000003 (3333333-C)",
  addressLine1: "5 Jalan Ketiga",
  postcode: "41300",
  city: "Klang",
  state: "Selangor",
};

describe("POST /api/companies", () => {
  it("creates the company and makes the creator its owner", async () => {
    const email = await uniqueEmail("owner");
    const userId = await seedUser(email);
    const existing = await seedCompany("Alpha Sdn Bhd");
    await seedMembership(existing, userId, "owner");

    const response = await call("/api/companies", { as: email, body: NEW_COMPANY });
    expect(response.status).toBe(201);

    const body = (await response.json()) as { company: { id: string; name: string } };
    expect(body.company.name).toBe(NEW_COMPANY.name);

    const me = (await (await call("/api/me", { as: email })).json()) as {
      companies: { id: string; role: string }[];
    };
    expect(me.companies).toContainEqual(
      expect.objectContaining({ id: body.company.id, role: "owner" }),
    );
  });

  it("refuses a staff user who owns no company", async () => {
    const email = await uniqueEmail("staff");
    const userId = await seedUser(email);
    const company = await seedCompany("Alpha Sdn Bhd");
    await seedMembership(company, userId, "staff");

    const response = await call("/api/companies", { as: email, body: NEW_COMPANY });
    expect(response.status).toBe(403);
  });

  it("writes an audit row for the new company", async () => {
    const email = await uniqueEmail("owner");
    const userId = await seedUser(email);
    const existing = await seedCompany("Alpha Sdn Bhd");
    await seedMembership(existing, userId, "owner");

    const response = await call("/api/companies", { as: email, body: NEW_COMPANY });
    const body = (await response.json()) as { company: { id: string } };

    const rows = await createDb(env.DB)
      .select()
      .from(auditLog)
      .where(eq(auditLog.companyId, body.company.id));

    expect(rows.map((row) => row.action)).toEqual(["company.create"]);
  });

  it("rejects unknown fields", async () => {
    const email = await uniqueEmail("owner");
    const userId = await seedUser(email);
    await seedMembership(await seedCompany("Alpha Sdn Bhd"), userId, "owner");

    const response = await call("/api/companies", {
      as: email,
      body: { ...NEW_COMPANY, sstRegistered: 1 },
    });

    expect(response.status).toBe(400);
  });
});

describe("PATCH /api/companies/:id", () => {
  it("lets an owner edit the company", async () => {
    const email = await uniqueEmail("owner");
    const userId = await seedUser(email);
    const companyId = await seedCompany("Alpha Sdn Bhd");
    await seedMembership(companyId, userId, "owner");

    const response = await call(`/api/companies/${companyId}`, {
      as: email,
      method: "PATCH",
      body: { brandColor: "#0f172a", defaultPaymentTermsDays: 45, bankName: "Maybank" },
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      company: { brandColor: string; defaultPaymentTermsDays: number; bankName: string };
    };
    expect(body.company).toMatchObject({
      brandColor: "#0f172a",
      defaultPaymentTermsDays: 45,
      bankName: "Maybank",
    });
  });

  it("refuses a staff member", async () => {
    const email = await uniqueEmail("staff");
    const userId = await seedUser(email);
    const companyId = await seedCompany("Alpha Sdn Bhd");
    await seedMembership(companyId, userId, "staff");

    const response = await call(`/api/companies/${companyId}`, {
      as: email,
      method: "PATCH",
      body: { name: "Renamed Sdn Bhd" },
    });

    expect(response.status).toBe(403);
  });

  it("rejects an invalid colour", async () => {
    const email = await uniqueEmail("owner");
    const userId = await seedUser(email);
    const companyId = await seedCompany("Alpha Sdn Bhd");
    await seedMembership(companyId, userId, "owner");

    const response = await call(`/api/companies/${companyId}`, {
      as: email,
      method: "PATCH",
      body: { brandColor: "dark blue" },
    });

    expect(response.status).toBe(400);
  });

  it("returns 403 for a company the user is not a member of", async () => {
    const email = await uniqueEmail("outsider");
    await seedUser(email);
    const other = await seedCompany("Secret Sdn Bhd");

    const response = await call(`/api/companies/${other}`, { as: email });
    expect(response.status).toBe(403);
  });
});

describe("company logo", () => {
  it("stores a PNG, serves it back, and records the key", async () => {
    const email = await uniqueEmail("owner");
    const userId = await seedUser(email);
    const companyId = await seedCompany("Alpha Sdn Bhd");
    await seedMembership(companyId, userId, "owner");

    const upload = await call(`/api/companies/${companyId}/logo`, {
      as: email,
      method: "PUT",
      body: formWithLogo(pngFile()),
    });

    expect(upload.status).toBe(200);
    const uploaded = (await upload.json()) as { company: { logoR2Key: string | null } };
    expect(uploaded.company.logoR2Key).toBe(`${companyId}/logo.png`);

    const [row] = await createDb(env.DB)
      .select()
      .from(companies)
      .where(eq(companies.id, companyId));
    expect(row?.logoR2Key).toBe(`${companyId}/logo.png`);

    const image = await call(`/api/companies/${companyId}/logo`, { as: email });
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toBe("image/png");
  });

  it("rejects a non-image file", async () => {
    const email = await uniqueEmail("owner");
    const userId = await seedUser(email);
    const companyId = await seedCompany("Alpha Sdn Bhd");
    await seedMembership(companyId, userId, "owner");

    const response = await call(`/api/companies/${companyId}/logo`, {
      as: email,
      method: "PUT",
      body: formWithLogo(new File(["hello"], "notes.txt", { type: "text/plain" })),
    });

    expect(response.status).toBe(400);
  });

  it("rejects a file that claims to be PNG but is not", async () => {
    const email = await uniqueEmail("owner");
    const userId = await seedUser(email);
    const companyId = await seedCompany("Alpha Sdn Bhd");
    await seedMembership(companyId, userId, "owner");

    const response = await call(`/api/companies/${companyId}/logo`, {
      as: email,
      method: "PUT",
      body: formWithLogo(new File(["not really a png"], "fake.png", { type: "image/png" })),
    });

    expect(response.status).toBe(400);
  });

  it("rejects a file larger than 1 MB", async () => {
    const email = await uniqueEmail("owner");
    const userId = await seedUser(email);
    const companyId = await seedCompany("Alpha Sdn Bhd");
    await seedMembership(companyId, userId, "owner");

    const oversized = new Uint8Array(1_000_001);
    oversized.set(PNG_1PX);

    const response = await call(`/api/companies/${companyId}/logo`, {
      as: email,
      method: "PUT",
      body: formWithLogo(pngFile(oversized)),
    });

    expect(response.status).toBe(400);
  });

  it("returns 404 when the company has no logo", async () => {
    const email = await uniqueEmail("owner");
    const userId = await seedUser(email);
    const companyId = await seedCompany("Alpha Sdn Bhd");
    await seedMembership(companyId, userId, "owner");

    const response = await call(`/api/companies/${companyId}/logo`, { as: email });
    expect(response.status).toBe(404);
  });
});
