import { drizzle } from "drizzle-orm/d1";

import * as schema from "./schema";

/**
 * The one Drizzle client. It needs the `DB` binding from the Worker env.
 */
export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type Db = ReturnType<typeof createDb>;

export * from "./schema";
