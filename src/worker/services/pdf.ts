import { renderDocumentHtml } from "@/worker/pdf";

import { loadDocument } from "./documents";

export type PdfRenderer = (
  html: string,
  options?: { footerNote?: string },
) => Promise<Uint8Array>;

const GENERATED_NOTE =
  "This is a computer-generated document. No signature is required.";

function footerNoteFor(model: { type: string }): string {
  return model.type === "delivery_order" ? "" : GENERATED_NOTE;
}

export type PdfDeps = {
  d1: D1Database;
  r2: R2Bucket;
  render: PdfRenderer;
};

/** {company_id}/{type}/{year}/{number}.pdf (spec.json -> compliance.record_keeping). */
export function pdfKey(companyId: string, type: string, year: number, number: string): string {
  return `${companyId}/${type}/${year}/${number}.pdf`;
}

export function voidPdfKey(companyId: string, type: string, year: number, number: string): string {
  return `${companyId}/${type}/${year}/${number}-void.pdf`;
}

export function paidPdfKey(companyId: string, type: string, year: number, number: string): string {
  return `${companyId}/${type}/${year}/${number}-paid.pdf`;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generates an issued document's PDF once, stores it in R2 and records its
 * SHA-256. Later calls reuse the stored file and never overwrite it.
 */
export async function ensureStoredPdf(
  deps: PdfDeps,
  input: { companyId: string; documentId: string },
): Promise<{ key: string; created: boolean } | null> {
  const loaded = await loadDocument(deps.d1, deps.r2, input.companyId, input.documentId);
  if (!loaded) {
    return null;
  }

  const { row, model } = loaded;

  // Drafts are previews only and are never stored.
  if (row.status === "draft" || !row.number) {
    return null;
  }

  const number = row.number;

  if (row.pdf_r2_key) {
    return { key: row.pdf_r2_key, created: false };
  }

  const bytes = await deps.render(renderDocumentHtml(model).toString(), {
    footerNote: footerNoteFor(model),
  });
  const year = Number(row.issue_date.slice(0, 4));
  const key = pdfKey(input.companyId, row.type, year, number);
  const sha256 = await sha256Hex(bytes);

  await deps.r2.put(key, bytes, {
    httpMetadata: { contentType: "application/pdf" },
    customMetadata: { sha256 },
  });

  await deps.d1
    .prepare(
      "UPDATE documents SET pdf_r2_key = ?, pdf_sha256 = ?, updated_at = ? WHERE id = ? AND company_id = ?",
    )
    .bind(key, sha256, Date.now(), input.documentId, input.companyId)
    .run();

  return { key, created: true };
}

/**
 * Stores a separate VOID-watermarked copy. The original file is never touched.
 */
export async function ensureVoidPdf(
  deps: PdfDeps,
  input: { companyId: string; documentId: string },
): Promise<{ key: string; created: boolean } | null> {
  const loaded = await loadDocument(deps.d1, deps.r2, input.companyId, input.documentId);
  if (!loaded || !loaded.row.number) {
    return null;
  }

  const { row, model } = loaded;
  const number = row.number;
  if (row.status !== "void" || !number) {
    return null;
  }
  if (row.void_pdf_r2_key) {
    return { key: row.void_pdf_r2_key, created: false };
  }

  const bytes = await deps.render(
    renderDocumentHtml({ ...model, variant: "void" }).toString(),
    { footerNote: footerNoteFor(model) },
  );
  const year = Number(row.issue_date.slice(0, 4));
  const key = voidPdfKey(input.companyId, row.type, year, number);
  const sha256 = await sha256Hex(bytes);

  await deps.r2.put(key, bytes, {
    httpMetadata: { contentType: "application/pdf" },
    customMetadata: { sha256 },
  });

  await deps.d1
    .prepare(
      "UPDATE documents SET void_pdf_r2_key = ?, updated_at = ? WHERE id = ? AND company_id = ?",
    )
    .bind(key, Date.now(), input.documentId, input.companyId)
    .run();

  return { key, created: true };
}

/**
 * A separate copy carrying the company stamp, generated when an invoice is
 * marked paid. The issued PDF is never touched.
 */
export async function ensurePaidPdf(
  deps: PdfDeps,
  input: { companyId: string; documentId: string },
): Promise<{ key: string; created: boolean } | null> {
  const loaded = await loadDocument(deps.d1, deps.r2, input.companyId, input.documentId);
  if (!loaded) {
    return null;
  }

  const { row, model } = loaded;
  const number = row.number;
  if (!number || row.status === "void" || row.status === "draft" || row.paid_at === null) {
    return null;
  }
  if (row.paid_pdf_r2_key) {
    return { key: row.paid_pdf_r2_key, created: false };
  }

  const bytes = await deps.render(renderDocumentHtml({ ...model, paid: true }).toString(), {
    footerNote: footerNoteFor(model),
  });
  const year = Number(row.issue_date.slice(0, 4));
  const key = paidPdfKey(input.companyId, row.type, year, number);
  const sha256 = await sha256Hex(bytes);

  await deps.r2.put(key, bytes, {
    httpMetadata: { contentType: "application/pdf" },
    customMetadata: { sha256 },
  });

  await deps.d1
    .prepare(
      "UPDATE documents SET paid_pdf_r2_key = ?, updated_at = ? WHERE id = ? AND company_id = ?",
    )
    .bind(key, Date.now(), input.documentId, input.companyId)
    .run();

  return { key, created: true };
}

/** Renders a draft preview (or a fresh copy) without storing anything. */
export async function renderUnstoredPdf(
  deps: PdfDeps,
  input: { companyId: string; documentId: string },
): Promise<Uint8Array | null> {
  const loaded = await loadDocument(deps.d1, deps.r2, input.companyId, input.documentId);
  if (!loaded) {
    return null;
  }
  return deps.render(renderDocumentHtml(loaded.model).toString(), {
    footerNote: footerNoteFor(loaded.model),
  });
}

/**
 * Browser Run renderer. Kept separate so tests can inject a stub, and so a
 * Browser Run outage never blocks issuing a document.
 */
export function puppeteerRenderer(env: Env): PdfRenderer {
  return async (html, options) => {
    const { default: puppeteer } = await import("@cloudflare/puppeteer");
    const browser = await puppeteer.launch(env.BROWSER);

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load" });
      const buffer = await page.pdf({
        format: "A4",
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate: `<div style="width:100%;padding:0 15mm;font-size:8px;color:#6b7280;display:flex;justify-content:space-between">
          <span>${options?.footerNote ?? ""}</span>
          <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
        </div>`,
        margin: { top: "15mm", right: "15mm", bottom: "18mm", left: "15mm" },
      });
      return new Uint8Array(buffer);
    } finally {
      await browser.close();
    }
  };
}
