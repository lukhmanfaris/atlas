import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export type AccessIdentity = {
  email: string;
};

export type VerifyOptions = {
  teamDomain: string;
  audience: string;
  /** Injectable for tests. Defaults to the team's remote JWKS. */
  jwks?: JWTVerifyGetKey;
};

const jwksCache = new Map<string, JWTVerifyGetKey>();

function normalizeTeamDomain(teamDomain: string): string {
  const trimmed = teamDomain.trim().replace(/\/+$/, "");
  if (!trimmed) {
    throw new Error("ACCESS_TEAM_DOMAIN is not configured");
  }
  return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
}

function remoteJwks(teamDomain: string): JWTVerifyGetKey {
  const issuer = normalizeTeamDomain(teamDomain);
  const existing = jwksCache.get(issuer);
  if (existing) {
    return existing;
  }
  const jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`), {
    cooldownDuration: 30_000,
    cacheMaxAge: 600_000,
  });
  jwksCache.set(issuer, jwks);
  return jwks;
}

/**
 * Validates the Cloudflare Access application token: signature, issuer,
 * audience and expiry. Returns the verified staff email in lowercase.
 */
export async function verifyAccessToken(
  token: string,
  options: VerifyOptions,
): Promise<AccessIdentity> {
  const issuer = normalizeTeamDomain(options.teamDomain);
  const audience = options.audience.trim();
  if (!audience) {
    throw new Error("ACCESS_AUD is not configured");
  }

  const { payload } = await jwtVerify(token, options.jwks ?? remoteJwks(issuer), {
    issuer,
    audience,
    algorithms: ["RS256"],
    clockTolerance: 5,
  });

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!email) {
    throw new Error("Access token has no email claim");
  }

  return { email };
}

/**
 * Local development only. Returns an identity when running under
 * `npm run dev`, which is the only configuration with ENVIRONMENT set to
 * "development". Staging and production never set DEV_AUTH_EMAIL, so this
 * cannot switch off Access there.
 */
export function resolveDevIdentity(env: {
  ENVIRONMENT?: string;
  DEV_AUTH_EMAIL?: string;
}): AccessIdentity | null {
  if (env.ENVIRONMENT !== "development") {
    return null;
  }
  const email = env.DEV_AUTH_EMAIL?.trim().toLowerCase();
  return email ? { email } : null;
}
