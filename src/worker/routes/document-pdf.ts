import { eq } from "drizzle-orm";
import { Hono, type Context } from "hono";

import { createDb } from "@/worker/db/client";
import { findMembership } from "@/worker/db/members";
import { documents } from "@/worker/db/schema";
import type { AppEnv } from "@/worker/auth/middleware";
import { apiError } from "@/worker/errors";
import { renderDocumentHtml } from "@/worker/pdf";
import { loadDocument } from "@/worker/services/documents";
import {
  ensureStoredPdf,
  ensureVoidPdf,
  puppeteerRenderer,
  renderUnstoredPdf,
  type PdfDeps,
} from "@/worker/services/pdf";

export const documentPdfRoutes = new Hono<AppEnv>();

/**
 * Browser navigations (a plain link to the PDF) cannot send headers, so the
 * company is resolved from the document itself and membership is checked here.
 */
async function authorizeDocument(c: Context<AppEnv>) {
  const documentId = c.req.param("documentId") ?? "";
  const db = createDb(c.env.DB);

  const [row] = await db
    .select({ id: documents.id, companyId: documents.companyId })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);

  if (!row) {
    return { error: apiError(c, 404, "not_found", "Document not found.") } as const;
  }

  const membership = await findMembership(db, row.companyId, c.get("user").id);
  if (!membership) {
    return { error: apiError(c, 403, "forbidden", "You are not a member of this company.") } as const;
  }

  return { companyId: row.companyId, documentId: row.id } as const;
}

function deps(c: { env: Env }): PdfDeps {
  return { d1: c.env.DB, r2: c.env.FILES, render: puppeteerRenderer(c.env) };
}

/** HTML preview. The same template feeds the PDF, so they cannot drift apart. */
documentPdfRoutes.get("/:documentId/preview", async (c) => {
  const access = await authorizeDocument(c);
  if ("error" in access) return access.error;

  const loaded = await loadDocument(c.env.DB, c.env.FILES, access.companyId, access.documentId);

  if (!loaded) {
    return apiError(c, 404, "not_found", "Document not found.");
  }

  return c.html(renderDocumentHtml(loaded.model));
});

documentPdfRoutes.get("/:documentId/pdf", async (c) => {
  const access = await authorizeDocument(c);
  if ("error" in access) return access.error;

  const { companyId, documentId } = access;
  const loaded = await loadDocument(c.env.DB, c.env.FILES, companyId, documentId);
  if (!loaded) {
    return apiError(c, 404, "not_found", "Document not found.");
  }

  const pdfDeps = deps(c);

  // Drafts get a fresh preview with a DRAFT watermark and are never stored.
  if (loaded.row.status === "draft") {
    try {
      const bytes = await renderUnstoredPdf(pdfDeps, { companyId, documentId });
      if (!bytes) {
        return apiError(c, 404, "not_found", "Document not found.");
      }
      return pdfResponse(bytes, `${loaded.model.number ?? "draft"}.pdf`, false);
    } catch {
      return pdfRetryable(c);
    }
  }

  try {
    const stored =
      loaded.row.status === "void"
        ? await ensureVoidPdf(pdfDeps, { companyId, documentId })
        : await ensureStoredPdf(pdfDeps, { companyId, documentId });

    if (!stored) {
      return apiError(c, 404, "not_found", "Document not found.");
    }

    const object = await c.env.FILES.get(stored.key);
    if (!object) {
      throw new Error("Stored PDF missing from R2");
    }

    return new Response(object.body, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="${loaded.model.number ?? "document"}.pdf"`,
        "cache-control": "private, max-age=300",
      },
    });
  } catch {
    return pdfRetryable(c);
  }
});

function pdfResponse(bytes: Uint8Array, filename: string, cache: boolean) {
  return new Response(bytes, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${filename}"`,
      "cache-control": cache ? "private, max-age=300" : "no-store",
    },
  });
}

/**
 * Browser Run being down must not look like a broken app: issuing already
 * succeeded, so the download can simply be retried (F-06 acceptance criteria).
 */
function pdfRetryable(c: Parameters<typeof apiError>[0]) {
  return apiError(
    c,
    503,
    "unavailable",
    "The PDF could not be prepared just now. Please try again in a moment.",
  );
}
