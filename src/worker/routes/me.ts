import { Hono } from "hono";

import type { MeResponse } from "@/shared/api";

import { requireIdentity, type AppEnv } from "@/worker/auth/middleware";
import { requireUser } from "@/worker/auth/user";
import { createDb } from "@/worker/db/client";
import { listCompaniesForUser } from "@/worker/db/members";

export const meRoutes = new Hono<AppEnv>();

meRoutes.use("*", requireIdentity, requireUser);

meRoutes.get("/", async (c) => {
  const user = c.get("user");
  const companies = await listCompaniesForUser(createDb(c.env.DB), user.id);

  const body: MeResponse = {
    user: { id: user.id, email: user.email, name: user.name },
    companies,
  };

  return c.json(body);
});
