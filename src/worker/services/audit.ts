import { uuidv7 } from "uuidv7";

import type { NewAuditLogRow } from "@/worker/db/schema";

/**
 * Builds an audit_log row. Callers insert it in the same db.batch as the change
 * it describes (CLAUDE.md hard rule 11).
 */
export function auditValues(input: {
  companyId: string | null;
  userId: string;
  action: string;
  entity: string;
  entityId: string;
  detail?: unknown;
}): NewAuditLogRow {
  return {
    id: uuidv7(),
    companyId: input.companyId,
    userId: input.userId,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId,
    detail: input.detail === undefined ? null : JSON.stringify(input.detail),
    at: Date.now(),
  };
}
