import { html, raw } from "hono/html";

export type PdfVariant = "draft" | "normal" | "void";

export type PdfCompany = {
  name: string;
  registrationNo: string;
  addressLines: string[];
  phone?: string | null;
  email?: string | null;
  logoUrl?: string | null;
  brandColor: string;
  bankName?: string | null;
  bankAccountName?: string | null;
  bankAccountNo?: string | null;
  sstRegistered: boolean;
};

export type PdfCustomer = {
  name: string;
  registrationNo?: string | null;
  billingAddress: string;
  contactPerson?: string | null;
  phone?: string | null;
};

export type PdfLine = {
  lineNo: number;
  sku?: string | null;
  description: string;
  unit: string;
  quantityMilli: number;
  unitPriceSen?: number | null;
  discountSen?: number | null;
  lineTotalSen?: number | null;
};

export type PdfModel = {
  variant: PdfVariant;
  type: "quotation" | "invoice" | "delivery_order";
  number: string | null;
  issueDate: string;
  dueDate?: string | null;
  validUntil?: string | null;
  deliveryDate?: string | null;
  reference?: string | null;
  terms?: string | null;
  notes?: string | null;
  deliveryAddress?: string | null;
  vehicleNo?: string | null;
  driverName?: string | null;
  receivedBy?: string | null;
  company: PdfCompany;
  customer: PdfCustomer;
  lines: PdfLine[];
  subtotalSen: number;
  discountSen: number;
  taxSen: number;
  totalSen: number;
  amountInWords?: string | null;
  sourceNumber?: string | null;
};

export function formatMoney(sen: number): string {
  const negative = sen < 0;
  const absolute = Math.abs(sen);
  const ringgit = Math.floor(absolute / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const cents = (absolute % 100).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${ringgit}.${cents}`;
}

export function formatQty(milli: number): string {
  const whole = Math.trunc(milli / 1000);
  const fraction = String(Math.abs(milli % 1000))
    .padStart(3, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

const STYLES = `
  @page { size: A4; margin: 15mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Helvetica Neue", Arial, sans-serif;
    font-size: 10pt;
    color: #111827;
    line-height: 1.35;
  }
  .watermark {
    position: fixed;
    top: 40%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-35deg);
    font-size: 96pt;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: rgba(17, 24, 39, 0.09);
    z-index: 0;
    pointer-events: none;
  }
  .sheet { position: relative; z-index: 1; }
  header.doc-header { display: flex; justify-content: space-between; gap: 10mm; align-items: flex-start; }
  .company { max-width: 105mm; }
  .company img.logo { max-height: 30mm; max-width: 60mm; object-fit: contain; display: block; margin-bottom: 2mm; }
  .company-name { font-size: 13pt; font-weight: 700; }
  .company-meta { font-size: 8.5pt; color: #4b5563; white-space: pre-line; }
  .doc-title { text-align: right; min-width: 60mm; }
  .doc-title h1 { margin: 0 0 1mm; font-size: 20pt; letter-spacing: 0.08em; color: var(--brand, #111827); }
  .doc-number { font-size: 11pt; font-weight: 600; }
  .meta-table { margin-top: 6mm; width: 100%; border-collapse: collapse; }
  .meta-table td { padding: 1mm 0; vertical-align: top; font-size: 9pt; }
  .meta-table td.label { color: #6b7280; width: 28mm; }
  .customer-block { margin-top: 6mm; display: flex; gap: 8mm; }
  .customer-block > div { flex: 1; }
  .block-title { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; margin-bottom: 1mm; }
  .address { white-space: pre-line; }
  table.lines { width: 100%; border-collapse: collapse; margin-top: 6mm; }
  table.lines thead { display: table-header-group; }
  table.lines tr { page-break-inside: avoid; }
  table.lines th {
    text-align: left;
    font-size: 8.5pt;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #374151;
    border-bottom: 0.4mm solid #111827;
    padding: 2mm 1.5mm;
  }
  table.lines td { padding: 2mm 1.5mm; border-bottom: 0.2mm solid #e5e7eb; vertical-align: top; font-size: 9.5pt; }
  .num { text-align: right; white-space: nowrap; }
  .qty { text-align: right; white-space: nowrap; }
  .totals { margin-top: 5mm; margin-left: auto; width: 70mm; }
  .totals table { width: 100%; border-collapse: collapse; }
  .totals td { padding: 1.2mm 0; font-size: 9.5pt; }
  .totals td.amount { text-align: right; white-space: nowrap; }
  .totals tr.grand td { border-top: 0.4mm solid #111827; font-weight: 700; font-size: 11pt; padding-top: 2mm; }
  .words { margin-top: 4mm; font-size: 8.5pt; }
  .words strong { text-transform: uppercase; letter-spacing: 0.04em; }
  section.extra { margin-top: 5mm; page-break-inside: avoid; }
  section.extra h2 { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; margin: 0 0 1mm; }
  section.extra p { margin: 0; white-space: pre-line; font-size: 9pt; }
  .signatures { margin-top: 12mm; display: flex; gap: 10mm; page-break-inside: avoid; }
  .signatures > div { flex: 1; border-top: 0.3mm solid #111827; padding-top: 2mm; font-size: 8.5pt; }
  .generated { margin-top: 10mm; font-size: 8pt; color: #6b7280; }
  .draft-note { margin-top: 4mm; border: 0.3mm solid #b91c1c; color: #b91c1c; padding: 2mm 3mm; font-size: 9pt; font-weight: 600; }
`;

export function documentShell(options: {
  model: PdfModel;
  title: string;
  body: ReturnType<typeof html>;
}) {
  const { model, title, body } = options;
  const watermark =
    model.variant === "normal"
      ? ""
      : `<div class="watermark">${model.variant === "draft" ? "DRAFT" : "VOID"}</div>`;

  return html`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}${model.number ? ` ${model.number}` : ""}</title>
    <style>
      :root { --brand: ${model.company.brandColor || "#111827"}; }
      ${raw(STYLES)}
    </style>
  </head>
  <body>
    ${raw(watermark)}
    <div class="sheet">${body}</div>
  </body>
</html>`;
}

export function header(model: PdfModel, title: string) {
  return html`<header class="doc-header">
  <div class="company">
    ${model.company.logoUrl ? html`<img class="logo" src="${model.company.logoUrl}" alt="" />` : ""}
    <div class="company-name">${model.company.name}</div>
    <div class="company-meta">${[
      model.company.registrationNo,
      ...model.company.addressLines,
      model.company.phone ?? "",
      model.company.email ?? "",
    ]
      .filter(Boolean)
      .join("\n")}</div>
  </div>
  <div class="doc-title">
    <h1>${title}</h1>
    <div class="doc-number">${model.number ?? "DRAFT"}</div>
  </div>
</header>`;
}

export function metaTable(rows: { label: string; value: string | null | undefined }[]) {
  return html`<table class="meta-table">
    ${raw(
      rows
        .filter((row) => row.value)
        .map((row) => `<tr><td class="label">${escapeText(row.label)}</td><td>${escapeText(row.value ?? "")}</td></tr>`)
        .join(""),
    )}
  </table>`;
}

export function customerBlock(model: PdfModel, deliveryAddress?: string | null) {
  return html`<div class="customer-block">
    <div>
      <div class="block-title">Bill To</div>
      <div><strong>${model.customer.name}</strong></div>
      ${model.customer.registrationNo ? html`<div class="company-meta">${model.customer.registrationNo}</div>` : ""}
      <div class="address">${model.customer.billingAddress}</div>
      ${model.customer.contactPerson ? html`<div class="company-meta">Attn: ${model.customer.contactPerson}</div>` : ""}
      ${model.customer.phone ? html`<div class="company-meta">${model.customer.phone}</div>` : ""}
    </div>
    ${deliveryAddress
      ? html`<div>
          <div class="block-title">Deliver To</div>
          <div class="address">${deliveryAddress}</div>
        </div>`
      : ""}
  </div>`;
}

export function lineRows(model: PdfModel, withPrices: boolean) {
  return raw(
    model.lines
      .map((line) => {
        const cells = [
          `<td>${line.lineNo}</td>`,
          withPrices ? "" : `<td>${escapeText(line.sku ?? "")}</td>`,
          `<td>${escapeText(line.description)}</td>`,
          `<td class="qty">${formatQty(line.quantityMilli)}</td>`,
          `<td>${escapeText(line.unit)}</td>`,
          withPrices ? `<td class="num">${formatMoney(line.unitPriceSen ?? 0)}</td>` : "",
          withPrices ? `<td class="num">${formatMoney(line.discountSen ?? 0)}</td>` : "",
          withPrices ? `<td class="num">${formatMoney(line.lineTotalSen ?? 0)}</td>` : "",
        ];
        return `<tr>${cells.join("")}</tr>`;
      })
      .join(""),
  );
}

export function totals(model: PdfModel) {
  return html`<div class="totals">
    <table>
      <tr><td>Subtotal</td><td class="amount">${formatMoney(model.subtotalSen)}</td></tr>
      ${model.discountSen ? html`<tr><td>Discount</td><td class="amount">${formatMoney(model.discountSen)}</td></tr>` : ""}
      ${model.taxSen ? html`<tr><td>Tax</td><td class="amount">${formatMoney(model.taxSen)}</td></tr>` : ""}
      <tr class="grand"><td>Total (RM)</td><td class="amount">${formatMoney(model.totalSen)}</td></tr>
    </table>
  </div>`;
}

export function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
