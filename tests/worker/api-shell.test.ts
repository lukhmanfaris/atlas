import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const worker = exports.default as {
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
};

describe("API shell", () => {
  it("answers the health check without a token", async () => {
    const response = await worker.fetch("http://example.com/api/health");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("returns the standard 404 error shape for unknown API routes", async () => {
    const response = await worker.fetch("http://example.com/api/nope");
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: { code: "not_found", message: "Not found." },
    });
  });
});

describe("GET /api/me without a Cloudflare Access token", () => {
  it("returns 401 and the standard error shape when the header is missing", async () => {
    const response = await worker.fetch("http://example.com/api/me");
    expect(response.status).toBe(401);

    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("unauthorized");
    expect(body.error.message).toEqual(expect.any(String));
  });

  it("returns 401 when the header is not a JWT", async () => {
    const response = await worker.fetch("http://example.com/api/me", {
      headers: { "Cf-Access-Jwt-Assertion": "not-a-jwt" },
    });
    expect(response.status).toBe(401);
  });
});
