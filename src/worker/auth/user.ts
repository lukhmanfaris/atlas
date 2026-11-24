import type { MiddlewareHandler } from "hono";

import { createDb } from "@/worker/db/client";
import { findUserByEmail } from "@/worker/db/members";
import { apiError } from "@/worker/errors";

import type { AppEnv } from "./middleware";

/**
 * Turns the Access-verified email into an app user. A verified email that is
 * not in `users`, or whose account is switched off, gets 403 (F-01).
 */
export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const { email } = c.get("identity");
  const user = await findUserByEmail(createDb(c.env.DB), email);

  if (!user) {
    return apiError(
      c,
      403,
      "forbidden",
      "This email is not registered in the app. Ask an owner to add you.",
    );
  }

  if (user.isActive !== 1) {
    return apiError(c, 403, "forbidden", "Your account is inactive. Ask an owner to reactivate it.");
  }

  c.set("user", user);
  return next();
};
