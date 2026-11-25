import { html } from "hono/html";

import {
  documentShell,
  formatDate,
  header,
  lineRows,
  stampBlock,
  type PdfModel,
} from "./layout";

/** Delivery orders never show prices, discounts or totals (spec.json -> pdf_layouts.delivery_order). */
export function renderDeliveryOrder(model: PdfModel) {
  const deliverTo = model.deliveryAddress || model.customer.billingAddress;

  return documentShell({
    model,
    title: "DELIVERY ORDER",
    body: html`${header(model, "DELIVERY ORDER", [
        { label: "DO No.", value: model.number ?? "DRAFT" },
        { label: "Date", value: formatDate(model.issueDate) },
        { label: "Delivery Date", value: formatDate(model.deliveryDate) },
        { label: "Vehicle No.", value: model.vehicleNo },
        { label: "Driver", value: model.driverName },
      ])}
      <div class="customer-block">
        <div>
          <div class="block-title">Bill To</div>
          <div><strong>${model.customer.name}</strong></div>
          ${model.customer.registrationNo
            ? html`<div class="company-meta">${model.customer.registrationNo}</div>`
            : ""}
          <div class="address">${model.customer.billingAddress}</div>
        </div>
        <div>
          <div class="block-title">Deliver To</div>
          <div class="address">${deliverTo}</div>
        </div>
      </div>
      <table class="lines no-prices ${model.lines.length > 1 ? "multi" : "single"}">
        <thead>
          <tr>
            <th>No.</th>
            <th>Item Code</th>
            <th>Description</th>
            <th class="qty">Qty</th>
          </tr>
        </thead>
        <tbody>
          ${lineRows(model, false)}
        </tbody>
      </table>
      ${model.notes
        ? html`<section class="extra"><h2>Notes</h2><p>${model.notes}</p></section>`
        : ""}
      <div class="bottom">
        ${model.variant === "draft"
          ? html`<div class="draft-note">DRAFT — not yet issued. This preview is not a valid delivery order.</div>`
          : ""}
        ${stampBlock(model)}
      </div>`,
  });
}
