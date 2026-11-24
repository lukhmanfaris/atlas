import { describe, expect, it } from "vitest";

import { resolveDevIdentity } from "@/worker/auth/access";

describe("local development sign-in bypass", () => {
  it("returns the configured email while ENVIRONMENT is development", () => {
    expect(
      resolveDevIdentity({ ENVIRONMENT: "development", DEV_AUTH_EMAIL: "Owner@Example.com" }),
    ).toEqual({ email: "owner@example.com" });
  });

  it.each(["staging", "production", "test"])(
    "never applies while ENVIRONMENT is %s, even if DEV_AUTH_EMAIL is set",
    (environment) => {
      expect(
        resolveDevIdentity({ ENVIRONMENT: environment, DEV_AUTH_EMAIL: "owner@example.com" }),
      ).toBeNull();
    },
  );

  it("does nothing when no development email is configured", () => {
    expect(resolveDevIdentity({ ENVIRONMENT: "development", DEV_AUTH_EMAIL: "" })).toBeNull();
  });
});
