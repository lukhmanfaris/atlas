import { env } from "cloudflare:workers";
import { uuidv7 } from "uuidv7";

import app from "@/worker";
import { createDb } from "@/worker/db/client";
import { companies, companyMembers, customers, users } from "@/worker/db/schema";

/** Builds the Worker env for one request, optionally switching the signed-in email. */
function bindings(overrides: Record<string, unknown>): Env {
  return {
    ...(env as unknown as Record<string, unknown>),
    ENVIRONMENT: "test",
    DEV_AUTH_EMAIL: "",
    ...overrides,
  } as unknown as Env;
}

export type CallOptions = {
  as?: string | null;
  companyId?: string;
  method?: string;
  body?: unknown;
  env?: Record<string, unknown>;
};

/** Calls the Hono app as a given email, without going through Access. */
export function call(path: string, options: CallOptions = {}) {
  const headers = new Headers({ Accept: "application/json" });
  if (options.companyId) {
    headers.set("X-Company-Id", options.companyId);
  }

  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    if (options.body instanceof FormData) {
      body = options.body;
    } else {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(options.body);
    }
  }

  return app.request(
    `http://localhost${path}`,
    { method: options.method ?? (body === undefined ? "GET" : "POST"), headers, body },
    bindings({
      ...(options.as ? { ENVIRONMENT: "development", DEV_AUTH_EMAIL: options.as } : {}),
      ...options.env,
    }),
  );
}

export async function seedCompany(name: string): Promise<string> {
  const id = uuidv7();
  const now = Date.now();
  await createDb(env.DB)
    .insert(companies)
    .values({
      id,
      name,
      registrationNo: `REG-${id.slice(0, 8)}`,
      addressLine1: "1 Test Street",
      postcode: "50000",
      city: "Kuala Lumpur",
      state: "Wilayah Persekutuan",
      createdAt: now,
      updatedAt: now,
    });
  return id;
}

export async function seedUser(
  email: string,
  options: { name?: string; isActive?: number } = {},
): Promise<string> {
  const id = uuidv7();
  await createDb(env.DB)
    .insert(users)
    .values({
      id,
      email,
      name: options.name ?? email.split("@")[0] ?? email,
      isActive: options.isActive ?? 1,
      createdAt: Date.now(),
    });
  return id;
}

export async function seedMembership(
  companyId: string,
  userId: string,
  role: "owner" | "staff",
): Promise<void> {
  await createDb(env.DB)
    .insert(companyMembers)
    .values({ companyId, userId, role, createdAt: Date.now() });
}

export async function seedCustomer(
  companyId: string,
  name = "Maju Jaya Sdn Bhd",
): Promise<string> {
  const id = uuidv7();
  const now = Date.now();
  await createDb(env.DB)
    .insert(customers)
    .values({
      id,
      companyId,
      name,
      billingAddress: "15 Jalan Perdagangan\n50000 Kuala Lumpur",
      createdAt: now,
      updatedAt: now,
    });
  return id;
}

export async function uniqueEmail(prefix: string): Promise<string> {
  return `${prefix}-${uuidv7().slice(-8)}@example.com`;
}
