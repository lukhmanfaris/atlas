import { Hono } from "hono";

import type { MeResponse } from "@/shared/api";

import { requireIdentity, type AppEnv } from "@/worker/auth/middleware";

export const meRoutes = new Hono<AppEnv>();

meRoutes.use("*", requireIdentity);

meRoutes.get("/", (c) => {
  const { email } = c.get("identity");
  const body: MeResponse = { email };
  return c.json(body);
});
