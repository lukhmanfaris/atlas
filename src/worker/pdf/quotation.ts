import { html } from "hono/html";

import {
  customerBlock,
  documentShell,
  formatDate,
  header,
  lineRows,
  totals,
  type PdfModel,
} from "./layout";

export function renderQuotation(model: PdfModel) {
  return documentShell({
    model,
    title: "QUOTATION",
    body: html`${header(model, "QUOTATION", [
        { label: "Quotation No.", value: model.number ?? "DRAFT" },
        { label: "Date", value: formatDate(model.issueDate) },
        { label: "Valid Until", value: formatDate(model.validUntil) },
      ])}
      ${customerBlock(model)}
      <table class="lines with-prices">
        <thead>
          <tr>
            <th>No.</th>
            <th>Description</th>
            <th class="price">U.Price (RM)</th>
            <th class="qty">Qty</th>
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
      ${model.terms
        ? html`<section class="extra"><h2>Terms and conditions</h2><p>${model.terms}</p></section>`
        : ""}
      ${model.variant === "draft"
        ? html`<div class="draft-note">DRAFT — not yet issued. This preview is not a valid quotation.</div>`
        : ""}
      <div class="bottom">
        <div class="signatures">
          <div>Issued by: name, signature and date</div>
          <div>Accepted by: name, signature, company stamp and date</div>
        </div>
        <div class="generated">This is a computer-generated document. No signature is required.</div>
      </div>`,
  });
}
