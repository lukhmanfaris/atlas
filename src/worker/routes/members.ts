import { and, eq } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { uuidv7 } from "uuidv7";
import type { ZodError } from "zod";

import { addMemberSchema, updateMemberSchema, type Member, type MemberList } from "@/shared/members";

import { requireCompany, requireOwner } from "@/worker/auth/company";
import type { AppEnv } from "@/worker/auth/middleware";
import { createDb } from "@/worker/db/client";
import {
  countOwners,
  findMember,
  findMembership,
  findUserByEmail,
  listMembers,
} from "@/worker/db/members";
import { auditLog, companyMembers, users } from "@/worker/db/schema";
import { apiError } from "@/worker/errors";
import { auditValues } from "@/worker/services/audit";

export const memberRoutes = new Hono<AppEnv>();

// Member management is owner-only (spec.json -> roles). Identity is applied
// once for /api/companies/* in src/worker/index.ts.

type MemberRow = {
  userId: string;
  email: string;
  name: string;
  role: "owner" | "staff";
  isActive: number;
};

function toMember(row: MemberRow): Member {
  return {
    userId: row.userId,
    email: row.email,
    name: row.name,
    role: row.role,
    isActive: row.isActive === 1,
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

/** The URL company must be the company the request is scoped to. */
function companyMismatch(c: Context<AppEnv>): ReturnType<typeof apiError> | null {
  if (c.req.param("companyId") !== c.get("company").id) {
    return apiError(
      c,
      400,
      "validation_error",
      "The company in the URL does not match the X-Company-Id header.",
    );
  }
  return null;
}

function defaultName(email: string): string {
  return email.split("@")[0] ?? email;
}

memberRoutes.get("/:companyId/members", requireCompany, requireOwner, async (c) => {
  const mismatch = companyMismatch(c);
  if (mismatch) return mismatch;

  const rows = await listMembers(createDb(c.env.DB), c.get("company").id);
  return c.json({ members: rows.map(toMember) } satisfies MemberList);
});

memberRoutes.post("/:companyId/members", requireCompany, requireOwner, async (c) => {
  const mismatch = companyMismatch(c);
  if (mismatch) return mismatch;

  const parsed = addMemberSchema.safeParse(await readJson(c));
  if (!parsed.success) {
    return apiError(
      c,
      400,
      "validation_error",
      "Check the member details and try again.",
      validationDetails(parsed.error),
    );
  }

  const db = createDb(c.env.DB);
  const companyId = c.get("company").id;
  const actor = c.get("user");
  const { email, role, name } = parsed.data;

  const existingUser = await findUserByEmail(db, email);
  if (existingUser && (await findMembership(db, companyId, existingUser.id))) {
    return apiError(c, 409, "conflict", "That person is already a member of this company.");
  }

  const userId = existingUser?.id ?? uuidv7();
  const now = Date.now();

  if (!existingUser) {
    await db.insert(users).values({
      id: userId,
      email,
      name: name ?? defaultName(email),
      isActive: 1,
      createdAt: now,
    });
  }

  await db.batch([
    db.insert(companyMembers).values({ companyId, userId, role, createdAt: now }),
    db.insert(auditLog).values(
      auditValues({
        companyId,
        userId: actor.id,
        action: "member.add",
        entity: "company_member",
        entityId: userId,
        detail: { email, role },
      }),
    ),
  ]);

  const member = await findMember(db, companyId, userId);
  if (!member) {
    return apiError(c, 500, "internal_error", "The member could not be read back.");
  }

  return c.json({ member: toMember(member) }, 201);
});

memberRoutes.patch("/:companyId/members/:userId", requireCompany, requireOwner, async (c) => {
  const mismatch = companyMismatch(c);
  if (mismatch) return mismatch;

  const parsed = updateMemberSchema.safeParse(await readJson(c));
  if (!parsed.success) {
    return apiError(
      c,
      400,
      "validation_error",
      "Choose a valid role.",
      validationDetails(parsed.error),
    );
  }

  const db = createDb(c.env.DB);
  const companyId = c.get("company").id;
  const targetId = c.req.param("userId");

  const target = await findMembership(db, companyId, targetId);
  if (!target) {
    return apiError(c, 404, "not_found", "That person is not a member of this company.");
  }

  if (target.role === "owner" && parsed.data.role !== "owner") {
    const owners = await countOwners(db, companyId);
    if (owners <= 1) {
      return apiError(c, 409, "invalid_state", "A company must keep at least one owner.");
    }
  }

  await db.batch([
    db
      .update(companyMembers)
      .set({ role: parsed.data.role })
      .where(and(eq(companyMembers.companyId, companyId), eq(companyMembers.userId, targetId))),
    db.insert(auditLog).values(
      auditValues({
        companyId,
        userId: c.get("user").id,
        action: "member.role_change",
        entity: "company_member",
        entityId: targetId,
        detail: { from: target.role, to: parsed.data.role },
      }),
    ),
  ]);

  const member = await findMember(db, companyId, targetId);
  if (!member) {
    return apiError(c, 500, "internal_error", "The member could not be read back.");
  }

  return c.json({ member: toMember(member) });
});
