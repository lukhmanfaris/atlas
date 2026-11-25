import { html } from "hono/html";

import {
  customerBlock,
  stampBlock,
  documentShell,
  formatDate,
  header,
  lineRows,
  totals,
  type PdfModel,
} from "./layout";

/** Never "TAX INVOICE" while the company is not SST-registered (spec.json -> compliance.sst). */
export function renderInvoice(model: PdfModel) {
  const terms = model.dueDate ? `${daysBetween(model.issueDate, model.dueDate)} days` : null;

  return documentShell({
    model,
    title: "INVOICE",
    body: html`${header(model, "INVOICE", [
        { label: "Invoice No.", value: model.number ?? "DRAFT" },
        { label: "Date", value: formatDate(model.issueDate) },
        { label: "Terms", value: terms },
        { label: "Due Date", value: formatDate(model.dueDate) },
        { label: "Quotation No.", value: model.sourceNumber },
      ])}
      ${customerBlock(model)}
      <table class="lines">
        <thead>
          <tr>
            <th>No.</th>
            <th>Description</th>
            <th class="qty">Qty</th>
            <th class="num">Unit Price (RM)</th>
            <th class="num">Amount (RM)</th>
          </tr>
        </thead>
        <tbody>
          ${lineRows(model, true)}
        </tbody>
      </table>
      ${totals(model)}
      ${model.amountInWords
        ? html`<div class="words"><strong>Amount in words:</strong> ${model.amountInWords}</div>`
        : ""}
      ${model.notes
        ? html`<section class="extra"><h2>Notes</h2><p>${model.notes}</p></section>`
        : ""}
      <div class="bottom">
        ${model.company.bankName || model.company.bankAccountNo || model.company.paymentInstructions
          ? html`<section class="extra">
              <h2>Payment details</h2>
              <p>${[model.company.bankName, model.company.bankAccountName, model.company.bankAccountNo]
                .filter(Boolean)
                .join("\n")}</p>
              ${model.company.paymentInstructions
                ? html`<p style="margin-top:2mm">${model.company.paymentInstructions}</p>`
                : ""}
            </section>`
          : ""}
        ${model.variant === "draft"
          ? html`<div class="draft-note">DRAFT — not yet issued. This preview is not a valid invoice.</div>`
          : ""}
        ${stampBlock(model)}
        <div class="generated">This is a computer-generated document. No signature is required.</div>
      </div>`,
  });
}

function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.round((end - start) / 86_400_000);
}
