import type { PdfCompany, PdfLine, PdfModel, PdfVariant } from "@/worker/pdf";

export type CompanySnapshot = {
  name: string;
  registrationNo: string;
  addressLines: string[];
  phone: string | null;
  email: string | null;
  logoKey: string | null;
  brandColor: string;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNo: string | null;
  sstRegistered: boolean;
};

export type CustomerSnapshot = {
  name: string;
  registrationNo: string | null;
  billingAddress: string;
  contactPerson: string | null;
  phone: string | null;
};

type DocumentRow = {
  id: string;
  type: "quotation" | "invoice" | "delivery_order";
  status: string;
  number: string | null;
  issue_date: string;
  due_date: string | null;
  valid_until: string | null;
  delivery_date: string | null;
  delivery_address: string | null;
  reference: string | null;
  notes: string | null;
  terms: string | null;
  subtotal_sen: number;
  discount_sen: number;
  tax_sen: number;
  total_sen: number;
  amount_in_words: string | null;
  vehicle_no: string | null;
  driver_name: string | null;
  received_by: string | null;
  customer_id: string;
  customer_snapshot: string | null;
  company_snapshot: string | null;
  source_document_id: string | null;
  pdf_r2_key: string | null;
  void_pdf_r2_key: string | null;
};

type LineRow = {
  line_no: number;
  sku: string | null;
  description: string;
  unit: string;
  quantity_milli: number;
  unit_price_sen: number | null;
  discount_sen: number;
  line_total_sen: number | null;
};

export type LoadedDocument = {
  row: DocumentRow;
  model: PdfModel;
};

export async function companySnapshot(d1: D1Database, companyId: string): Promise<CompanySnapshot> {
  return liveCompany(d1, companyId);
}

export async function customerSnapshot(
  d1: D1Database,
  customerId: string,
): Promise<CustomerSnapshot> {
  return liveCustomer(d1, customerId);
}

async function liveCompany(d1: D1Database, companyId: string): Promise<CompanySnapshot> {
  const row = await d1
    .prepare(
      `SELECT name, registration_no, address_line1, address_line2, address_line3, postcode,
              city, state, country, phone, email, logo_r2_key, brand_color, bank_name,
              bank_account_name, bank_account_no, sst_registered
       FROM companies WHERE id = ?`,
    )
    .bind(companyId)
    .first<Record<string, string | number | null>>();

  if (!row) {
    throw new Error("Company not found");
  }

  return {
    name: String(row.name),
    registrationNo: String(row.registration_no),
    addressLines: [
      row.address_line1,
      row.address_line2,
      row.address_line3,
      [row.postcode, row.city].filter(Boolean).join(" "),
      row.state,
      row.country,
    ]
      .filter((value): value is string => Boolean(value))
      .map(String),
    phone: row.phone ? String(row.phone) : null,
    email: row.email ? String(row.email) : null,
    logoKey: row.logo_r2_key ? String(row.logo_r2_key) : null,
    brandColor: String(row.brand_color),
    bankName: row.bank_name ? String(row.bank_name) : null,
    bankAccountName: row.bank_account_name ? String(row.bank_account_name) : null,
    bankAccountNo: row.bank_account_no ? String(row.bank_account_no) : null,
    sstRegistered: Number(row.sst_registered) === 1,
  };
}

async function liveCustomer(d1: D1Database, customerId: string): Promise<CustomerSnapshot> {
  const row = await d1
    .prepare(
      `SELECT name, registration_no, billing_address, contact_person, phone
       FROM customers WHERE id = ?`,
    )
    .bind(customerId)
    .first<Record<string, string | null>>();

  if (!row) {
    throw new Error("Customer not found");
  }

  return {
    name: String(row.name),
    registrationNo: row.registration_no ?? null,
    billingAddress: String(row.billing_address),
    contactPerson: row.contact_person ?? null,
    phone: row.phone ?? null,
  };
}

async function logoDataUri(r2: R2Bucket, key: string | null): Promise<string | null> {
  if (!key) {
    return null;
  }
  const object = await r2.get(key);
  if (!object) {
    return null;
  }

  const bytes = new Uint8Array(await object.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }

  const contentType = object.httpMetadata?.contentType ?? "image/png";
  return `data:${contentType};base64,${btoa(binary)}`;
}

function variantFor(status: string): PdfVariant {
  if (status === "draft") return "draft";
  if (status === "void") return "void";
  return "normal";
}

/**
 * Builds the view model for a document: frozen snapshots after issue, live
 * company and customer rows while it is still a draft.
 */
export async function loadDocument(
  d1: D1Database,
  r2: R2Bucket,
  companyId: string,
  documentId: string,
): Promise<LoadedDocument | null> {
  const row = await d1
    .prepare("SELECT * FROM documents WHERE id = ? AND company_id = ?")
    .bind(documentId, companyId)
    .first<DocumentRow>();

  if (!row) {
    return null;
  }

  const company: CompanySnapshot = row.company_snapshot
    ? (JSON.parse(row.company_snapshot) as CompanySnapshot)
    : await liveCompany(d1, companyId);

  const customer: CustomerSnapshot = row.customer_snapshot
    ? (JSON.parse(row.customer_snapshot) as CustomerSnapshot)
    : await liveCustomer(d1, row.customer_id);

  const linesResult = await d1
    .prepare(
      `SELECT line_no, sku, description, unit, quantity_milli, unit_price_sen,
              discount_sen, line_total_sen
       FROM document_lines WHERE document_id = ? ORDER BY line_no`,
    )
    .bind(documentId)
    .all<LineRow>();

  const lines: PdfLine[] = (linesResult.results ?? []).map((line) => ({
    lineNo: line.line_no,
    sku: line.sku,
    description: line.description,
    unit: line.unit,
    quantityMilli: line.quantity_milli,
    unitPriceSen: line.unit_price_sen,
    discountSen: line.discount_sen,
    lineTotalSen: line.line_total_sen,
  }));

  let sourceNumber: string | null = null;
  if (row.source_document_id) {
    const source = await d1
      .prepare("SELECT number FROM documents WHERE id = ?")
      .bind(row.source_document_id)
      .first<{ number: string | null }>();
    sourceNumber = source?.number ?? null;
  }

  const pdfCompany: PdfCompany = {
    ...company,
    logoUrl: await logoDataUri(r2, company.logoKey),
  };

  const model: PdfModel = {
    variant: variantFor(row.status),
    type: row.type,
    number: row.number,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    validUntil: row.valid_until,
    deliveryDate: row.delivery_date,
    reference: row.reference,
    terms: row.terms,
    notes: row.notes,
    deliveryAddress: row.delivery_address,
    vehicleNo: row.vehicle_no,
    driverName: row.driver_name,
    receivedBy: row.received_by,
    company: pdfCompany,
    customer,
    lines,
    subtotalSen: row.subtotal_sen,
    discountSen: row.discount_sen,
    taxSen: row.tax_sen,
    totalSen: row.total_sen,
    amountInWords: row.amount_in_words,
    sourceNumber,
  };

  return { row, model };
}
