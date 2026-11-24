import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWK,
} from "jose";
import { beforeAll, describe, expect, it } from "vitest";

import { verifyAccessToken } from "@/worker/auth/access";

const TEAM_DOMAIN = "https://example-team.cloudflareaccess.com";
const AUDIENCE = "test-audience-tag";

let signingKey: CryptoKey;
let jwks: ReturnType<typeof createLocalJWKSet>;

async function makeToken(options: {
  email?: string | null;
  issuer?: string;
  audience?: string;
  expiresInSeconds?: number;
}) {
  let token = new SignJWT(options.email === null ? {} : { email: options.email ?? "staff@example.com" })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(options.issuer ?? TEAM_DOMAIN)
    .setAudience(options.audience ?? AUDIENCE)
    .setIssuedAt();

  const expiresIn = options.expiresInSeconds ?? 300;
  token = token.setExpirationTime(Math.floor(Date.now() / 1000) + expiresIn);

  return token.sign(signingKey);
}

beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  signingKey = pair.privateKey;
  const publicJwk: JWK = await exportJWK(pair.publicKey);
  jwks = createLocalJWKSet({
    keys: [{ ...publicJwk, alg: "RS256", kid: "test-key", use: "sig" }],
  });
});

describe("Cloudflare Access token validation", () => {
  it("accepts a correctly signed token and lowercases the email", async () => {
    const token = await makeToken({ email: "Owner@Example.com" });

    await expect(verifyAccessToken(token, { teamDomain: TEAM_DOMAIN, audience: AUDIENCE, jwks }))
      .resolves.toEqual({ email: "owner@example.com" });
  });

  it("rejects a token issued for a different audience", async () => {
    const token = await makeToken({ audience: "someone-elses-app" });

    await expect(
      verifyAccessToken(token, { teamDomain: TEAM_DOMAIN, audience: AUDIENCE, jwks }),
    ).rejects.toThrow();
  });

  it("rejects a token from a different issuer", async () => {
    const token = await makeToken({ issuer: "https://attacker.cloudflareaccess.com" });

    await expect(
      verifyAccessToken(token, { teamDomain: TEAM_DOMAIN, audience: AUDIENCE, jwks }),
    ).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    const token = await makeToken({ expiresInSeconds: -120 });

    await expect(
      verifyAccessToken(token, { teamDomain: TEAM_DOMAIN, audience: AUDIENCE, jwks }),
    ).rejects.toThrow();
  });

  it("rejects a token with no email claim", async () => {
    const token = await makeToken({ email: null });

    await expect(
      verifyAccessToken(token, { teamDomain: TEAM_DOMAIN, audience: AUDIENCE, jwks }),
    ).rejects.toThrow("email");
  });

  it("rejects a token signed with a different key", async () => {
    const other = await generateKeyPair("RS256", { extractable: true });
    const token = await new SignJWT({ email: "staff@example.com" })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(TEAM_DOMAIN)
      .setAudience(AUDIENCE)
      .setExpirationTime("5m")
      .sign(other.privateKey);

    await expect(
      verifyAccessToken(token, { teamDomain: TEAM_DOMAIN, audience: AUDIENCE, jwks }),
    ).rejects.toThrow();
  });

  it("fails closed when the audience is not configured", async () => {
    const token = await makeToken({});

    await expect(
      verifyAccessToken(token, { teamDomain: TEAM_DOMAIN, audience: "  ", jwks }),
    ).rejects.toThrow("ACCESS_AUD");
  });
});
