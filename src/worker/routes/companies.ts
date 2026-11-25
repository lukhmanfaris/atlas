import { eq } from "drizzle-orm";
import { Hono, type Context } from "hono";
import type { ZodError } from "zod";

import {
  ALLOWED_LOGO_TYPES,
  MAX_LOGO_BYTES,
  createCompanySchema,
  updateCompanySchema,
  type CompanyDto,
} from "@/shared/companies";

import { requireCompanyCreator, requireCompanyParam, requireOwner } from "@/worker/auth/company";
import type { AppEnv } from "@/worker/auth/middleware";
import { createDb } from "@/worker/db/client";
import { createCompany, findCompany, updateCompany } from "@/worker/db/companies";
import { auditLog, companies, type Company } from "@/worker/db/schema";
import { apiError } from "@/worker/errors";
import { auditValues } from "@/worker/services/audit";

export const companyRoutes = new Hono<AppEnv>();

function toDto(company: Company): CompanyDto {
  return {
    ...company,
    sstRegistered: company.sstRegistered === 1,
    isArchived: company.isArchived === 1,
  };
}

function validationDetails(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

async function readJson(c: Context<AppEnv>): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

companyRoutes.post("/", requireCompanyCreator, async (c) => {
  const parsed = createCompanySchema.safeParse(await readJson(c));
  if (!parsed.success) {
    return apiError(
      c,
      400,
      "validation_error",
      "Check the company details and try again.",
      validationDetails(parsed.error),
    );
  }

  const db = createDb(c.env.DB);
  const id = await createCompany(db, parsed.data, c.get("user").id);
  const company = await findCompany(db, id);

  if (!company) {
    return apiError(c, 500, "internal_error", "The company could not be read back.");
  }

  return c.json({ company: toDto(company) }, 201);
});

companyRoutes.get("/:companyId", requireCompanyParam, async (c) => {
  const company = await findCompany(createDb(c.env.DB), c.get("company").id);

  if (!company) {
    return apiError(c, 404, "not_found", "Company not found.");
  }

  return c.json({ company: toDto(company) });
});

companyRoutes.patch("/:companyId", requireCompanyParam, requireOwner, async (c) => {
  const parsed = updateCompanySchema.safeParse(await readJson(c));
  if (!parsed.success) {
    return apiError(
      c,
      400,
      "validation_error",
      "Check the company details and try again.",
      validationDetails(parsed.error),
    );
  }

  if (Object.keys(parsed.data).length === 0) {
    return apiError(c, 400, "validation_error", "Nothing to update.");
  }

  const db = createDb(c.env.DB);
  const companyId = c.get("company").id;
  await updateCompany(db, companyId, parsed.data, c.get("user").id);
  const company = await findCompany(db, companyId);

  if (!company) {
    return apiError(c, 500, "internal_error", "The company could not be read back.");
  }

  return c.json({ company: toDto(company) });
});

function logoKind(bytes: Uint8Array): { contentType: string; extension: string } | null {
  const isPng =
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (isPng) return { contentType: "image/png", extension: "png" };

  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (isJpeg) return { contentType: "image/jpeg", extension: "jpg" };

  return null;
}

companyRoutes.put("/:companyId/logo", requireCompanyParam, requireOwner, async (c) => {
  let body: Record<string, unknown>;
  try {
    body = await c.req.parseBody();
  } catch {
    return apiError(c, 400, "validation_error", "Send the logo as a file upload.");
  }

  const file = body["logo"];
  if (!(file instanceof File)) {
    return apiError(c, 400, "validation_error", "Attach the logo in a field named logo.");
  }

  if (file.size > MAX_LOGO_BYTES) {
    return apiError(c, 400, "validation_error", "The logo must be 1 MB or smaller.");
  }

  const declaredType = file.type.toLowerCase();
  if (!ALLOWED_LOGO_TYPES.includes(declaredType as (typeof ALLOWED_LOGO_TYPES)[number])) {
    return apiError(c, 400, "validation_error", "The logo must be a PNG or JPEG image.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = logoKind(bytes);
  if (!kind) {
    return apiError(c, 400, "validation_error", "That file is not a PNG or JPEG image.");
  }

  const companyId = c.get("company").id;
  const key = `${companyId}/logo.${kind.extension}`;

  await c.env.FILES.put(key, bytes, {
    httpMetadata: { contentType: kind.contentType },
  });

  const db = createDb(c.env.DB);
  await db.batch([
    db
      .update(companies)
      .set({ logoR2Key: key, updatedAt: Date.now() })
      .where(eq(companies.id, companyId)),
    db.insert(auditLog).values(
      auditValues({
        companyId,
        userId: c.get("user").id,
        action: "company.logo",
        entity: "company",
        entityId: companyId,
        detail: { contentType: kind.contentType, bytes: bytes.byteLength },
      }),
    ),
  ]);

  const company = await findCompany(db, companyId);
  if (!company) {
    return apiError(c, 500, "internal_error", "The company could not be read back.");
  }

  return c.json({ company: toDto(company) });
});

companyRoutes.get("/:companyId/logo", requireCompanyParam, async (c) => {
  const company = await findCompany(createDb(c.env.DB), c.get("company").id);

  if (!company?.logoR2Key) {
    return apiError(c, 404, "not_found", "This company has no logo.");
  }

  const object = await c.env.FILES.get(company.logoR2Key);
  if (!object) {
    return apiError(c, 404, "not_found", "This company has no logo.");
  }

  return new Response(object.body, {
    headers: {
      "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "cache-control": "private, max-age=60",
    },
  });
});

companyRoutes.put("/:companyId/stamp", requireCompanyParam, requireOwner, async (c) => {
  let body: Record<string, unknown>;
  try {
    body = await c.req.parseBody();
  } catch {
    return apiError(c, 400, "validation_error", "Send the stamp as a file upload.");
  }

  const file = body["stamp"];
  if (!(file instanceof File)) {
    return apiError(c, 400, "validation_error", "Attach the stamp in a field named stamp.");
  }
  if (file.size > MAX_LOGO_BYTES) {
    return apiError(c, 400, "validation_error", "The stamp must be 1 MB or smaller.");
  }
  if (file.type.toLowerCase() !== "image/png") {
    return apiError(c, 400, "validation_error", "The stamp must be a PNG with a transparent background.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!(bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)) {
    return apiError(c, 400, "validation_error", "That file is not a PNG image.");
  }

  const companyId = c.get("company").id;
  const key = `${companyId}/stamp.png`;

  await c.env.FILES.put(key, bytes, { httpMetadata: { contentType: "image/png" } });

  const db = createDb(c.env.DB);
  await db.batch([
    db
      .update(companies)
      .set({ stampR2Key: key, updatedAt: Date.now() })
      .where(eq(companies.id, companyId)),
    db.insert(auditLog).values(
      auditValues({
        companyId,
        userId: c.get("user").id,
        action: "company.stamp",
        entity: "company",
        entityId: companyId,
        detail: { bytes: bytes.byteLength },
      }),
    ),
  ]);

  const company = await findCompany(db, companyId);
  if (!company) {
    return apiError(c, 500, "internal_error", "The company could not be read back.");
  }
  return c.json({ company: toDto(company) });
});

companyRoutes.get("/:companyId/stamp", requireCompanyParam, async (c) => {
  const company = await findCompany(createDb(c.env.DB), c.get("company").id);
  if (!company?.stampR2Key) {
    return apiError(c, 404, "not_found", "This company has no stamp.");
  }
  const object = await c.env.FILES.get(company.stampR2Key);
  if (!object) {
    return apiError(c, 404, "not_found", "This company has no stamp.");
  }
  return new Response(object.body, {
    headers: {
      "content-type": object.httpMetadata?.contentType ?? "image/png",
      "cache-control": "private, max-age=60",
    },
  });
});
