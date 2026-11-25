import { html, raw } from "hono/html";

export type PdfVariant = "draft" | "normal" | "void";

export type PdfCompany = {
  name: string;
  registrationNo: string;
  addressLines: string[];
  phone?: string | null;
  email?: string | null;
  logoUrl?: string | null;
  stampUrl?: string | null;
  brandColor: string;
  bankName?: string | null;
  bankAccountName?: string | null;
  bankAccountNo?: string | null;
  paymentInstructions?: string | null;
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
  details?: string | null;
  unit: string;
  quantityMilli: number;
  unitPriceSen?: number | null;
  discountSen?: number | null;
  lineTotalSen?: number | null;
};

export type PdfModel = {
  variant: PdfVariant;
  paid?: boolean;
  type: "quotation" | "invoice" | "delivery_order";
  number: string | null;
  issueDate: string;
  dueDate?: string | null;
  validUntil?: string | null;
  deliveryDate?: string | null;
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
  .sheet { position: relative; z-index: 1; min-height: 258mm; display: flex; flex-direction: column; }
  .bottom { margin-top: auto; }
  .stamp { text-align: right; margin-top: 6mm; }
  .stamp img { width: 57mm; max-height: 57mm; object-fit: contain; }
  header.doc-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    column-gap: 10mm;
    align-items: start;
  }
  .doc-logo { grid-column: 1; grid-row: 1; margin-bottom: 2mm; }
  .doc-title { grid-column: 2; grid-row: 1; margin: 0; font-size: 25pt; line-height: 1; letter-spacing: 0.08em; color: var(--brand, #111827); text-align: right; }
  .company { grid-column: 1; grid-row: 2; }
  .doc-meta { grid-column: 2; grid-row: 2; }
  .company { max-width: 105mm; }
  .doc-logo img.logo,
  .company img.logo { max-height: 22mm; max-width: 55mm; width: auto; height: auto; object-fit: contain; display: block; }
  .company-name { font-size: 13pt; font-weight: 700; line-height: 1.15; }
  .company-meta { font-size: 10pt; line-height: 1.35; color: #4b5563; white-space: pre-line; }
      .doc-number { font-size: 11pt; font-weight: 600; }
  .meta-table { margin-top: 6mm; width: 100%; border-collapse: collapse; }
  .meta-table td { padding: 0; line-height: 1.35; vertical-align: top; font-size: 10pt; }
  .meta-table td.label { color: #6b7280; padding-right: 4mm; text-align: right; }
  .meta-table td.value { text-align: right; }
  .customer-block { margin-top: 6mm; display: flex; gap: 8mm; }
  .customer-block > div { flex: 1; }
  .block-title { font-size: 10pt; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; margin-bottom: 1mm; }
  .address { white-space: pre-line; }
  table.lines { width: 100%; border-collapse: collapse; margin-top: 6mm; table-layout: fixed; }
  table.lines.with-prices th:nth-child(1) { width: 10mm; }
  table.lines.with-prices th:nth-child(2) { width: auto; }
  table.lines.with-prices th:nth-child(3) { width: 34mm; }
  table.lines.with-prices th:nth-child(4) { width: 14mm; }
  table.lines.with-prices th:nth-child(5) { width: 32mm; }
  table.lines.no-prices th:nth-child(1) { width: 10mm; }
  table.lines.no-prices th:nth-child(2) { width: 32mm; }
  table.lines.no-prices th:nth-child(3) { width: auto; }
  table.lines.no-prices th:nth-child(4) { width: 14mm; }
  table.lines thead { display: table-header-group; }
  table.lines tr { page-break-inside: avoid; }
  table.lines th {
    text-align: left;
    font-size: 10pt;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    color: #374151;
    border-bottom: 0.4mm solid #111827;
    padding: 2mm 1.5mm;
  }
  table.lines td { padding: 2mm 1.5mm; vertical-align: middle; font-size: 10pt; }
  table.lines.single tr td { border-bottom: none; }
  table.lines.multi tr:not(:last-child) td { border-bottom: 0.3mm solid #111827; }
  .line-details { color: #6b7280; margin-top: 1mm; }
  .num { text-align: right; white-space: nowrap; }
  table.lines th.num { text-align: right; }
  table.lines th.price,
  table.lines th.qty { text-align: left; }
  .price { text-align: left; white-space: nowrap; }
  .qty { text-align: left; white-space: nowrap; }
  .totals { margin-top: 6mm; width: 100%; }
  .totals .rule { border-top: 0.4mm solid #111827; }
  .totals-line { display: flex; justify-content: space-between; width: 70mm; margin-left: auto; padding: 1.2mm 1.5mm 1.2mm 0; font-size: 10pt; }
  .totals-line.grand { font-weight: 700; }
  .totals-grand { display: flex; align-items: baseline; gap: 6mm; }
  .totals-words {
    flex: 1 1 auto;
    min-width: 0;
    text-align: left;
    padding: 1.2mm 0;
    font-size: 10pt;
    line-height: 1.35;
    white-space: normal;
    overflow-wrap: break-word;
    word-break: normal;
  }
  .words { margin-top: 4mm; font-size: 10pt; }
  .words strong { text-transform: uppercase; letter-spacing: 0.04em; }
  section.extra { margin-top: 5mm; page-break-inside: avoid; }
  section.extra h2 { font-size: 10pt; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; margin: 0 0 1mm; }
  section.extra p { margin: 0; white-space: pre-line; font-size: 10pt; line-height: 1.35; }
  .signatures { margin-top: 12mm; display: flex; gap: 10mm; page-break-inside: avoid; }
  .signatures > div { flex: 1; border-top: 0.3mm solid #111827; padding-top: 2mm; font-size: 10pt; }
  .generated { margin-top: 4mm; font-size: 8px; color: #6b7280; text-align: left; }
  @media print { .generated { display: none; } }
  .draft-note { margin-top: 4mm; border: 0.3mm solid #b91c1c; color: #b91c1c; padding: 2mm 3mm; font-size: 10pt; font-weight: 600; }
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

export function header(
  model: PdfModel,
  title: string,
  rows: { label: string; value: string | null | undefined }[],
) {
  // "Malaysia" is redundant on documents issued by a Malaysian company.
  const address = model.company.addressLines.filter(
    (line) => line.trim().toLowerCase() !== "malaysia",
  );

  return html`<header class="doc-header">
  <div class="doc-logo">
    ${model.company.logoUrl ? html`<img class="logo" src="${model.company.logoUrl}" alt="" />` : ""}
  </div>
  <h1 class="doc-title">${title}</h1>
  <div class="company">
    <div class="company-name">${model.company.name}</div>
    <div class="company-meta">${[
      model.company.registrationNo,
      ...address,
      model.company.phone ?? "",
      model.company.email ?? "",
    ]
      .filter(Boolean)
      .join("\n")}</div>
  </div>
  <div class="doc-meta">
    <table class="meta-table">
      ${raw(
        rows
          .filter((row) => row.value)
          .map(
            (row) =>
              `<tr><td class="label">${escapeText(row.label)}</td><td class="value">${escapeText(
                row.value ?? "",
              )}</td></tr>`,
          )
          .join(""),
      )}
    </table>
  </div>
</header>`;
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
          `<td>${escapeText(line.description)}${
            line.details ? `<div class="line-details">${escapeText(line.details)}</div>` : ""
          }</td>`,
          withPrices ? `<td class="price">${formatMoney(line.unitPriceSen ?? 0)}</td>` : "",
          `<td class="qty">${formatQty(line.quantityMilli)}</td>`,
          withPrices ? `<td class="num">${formatMoney(line.lineTotalSen ?? 0)}</td>` : "",
        ];
        return `<tr>${cells.join("")}</tr>`;
      })
      .join(""),
  );
}

/** The company stamp: always on delivery orders, on invoices only once paid. */
export function stampBlock(model: PdfModel) {
  if (!model.company.stampUrl) {
    return "";
  }
  if (model.type !== "delivery_order" && !model.paid && model.variant !== "draft") {
    return "";
  }
  return html`<div class="stamp"><img src="${model.company.stampUrl}" alt="" /></div>`;
}

export function totals(model: PdfModel) {
  return html`<div class="totals">
    <div class="rule"></div>
    <div class="totals-line"><span>Subtotal</span><span>${formatMoney(model.subtotalSen)}</span></div>
    ${model.discountSen
      ? html`<div class="totals-line"><span>Discount</span><span>${formatMoney(model.discountSen)}</span></div>`
      : ""}
    <div class="rule"></div>
    <div class="totals-grand">
      <div class="totals-words">${model.amountInWords ?? ""}</div>
      <div class="totals-line grand"><span>Total (RM)</span><span>${formatMoney(model.totalSen)}</span></div>
    </div>
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
