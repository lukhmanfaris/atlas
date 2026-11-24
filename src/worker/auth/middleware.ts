import type { MiddlewareHandler } from "hono";

import type { CompanyRole } from "@/shared/enums";
import type { User } from "@/worker/db/schema";

import { apiError } from "@/worker/errors";

import { resolveDevIdentity, verifyAccessToken, type AccessIdentity } from "./access";

export type CompanyScope = {
  id: string;
  role: CompanyRole;
};

export type AppEnv = {
  Bindings: Env;
  Variables: {
    identity: AccessIdentity;
    user: User;
    company: CompanyScope;
  };
};

/**
 * Every /api route sits behind this. It validates the Cloudflare Access
 * token on every request (spec.json -> non_functional.security).
 */
export const requireIdentity: MiddlewareHandler<AppEnv> = async (c, next) => {
  const devIdentity = resolveDevIdentity(c.env);
  if (devIdentity) {
    c.set("identity", devIdentity);
    return next();
  }

  const token = c.req.header("Cf-Access-Jwt-Assertion");
  if (!token) {
    return apiError(c, 401, "unauthorized", "Sign in through Cloudflare Access to continue.");
  }

  try {
    const identity = await verifyAccessToken(token, {
      teamDomain: c.env.ACCESS_TEAM_DOMAIN,
      audience: c.env.ACCESS_AUD,
    });
    c.set("identity", identity);
  } catch {
    return apiError(c, 401, "unauthorized", "Your Cloudflare Access session is not valid.");
  }

  return next();
};
