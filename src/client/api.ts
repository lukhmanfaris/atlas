import type { CompanyDto, CreateCompanyInput, UpdateCompanyInput } from "@/shared/companies";
import type {
  CreateCustomerInput,
  CustomerDto,
  UpdateCustomerInput,
} from "@/shared/customers";
import type { CreateItemInput, ItemDto, UpdateItemInput } from "@/shared/items";
import type { MeResponse } from "@/shared/api";

const BASE = "/api";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  companyId?: string,
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (!(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (companyId) {
    headers.set("X-Company-Id", companyId);
  }

  const response = await fetch(`${BASE}${path}`, { ...init, headers });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: { message?: string; details?: unknown } }
      | null;
    throw new ApiError(
      response.status,
      body?.error?.message ?? `Request failed (${response.status})`,
      body?.error?.details,
    );
  }

  return (await response.json()) as T;
}

export function getMe() {
  return request<MeResponse>("/me");
}

export function getCompany(companyId: string) {
  return request<{ company: CompanyDto }>(`/companies/${companyId}`);
}

export function createCompany(input: CreateCompanyInput) {
  return request<{ company: CompanyDto }>("/companies", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateCompany(companyId: string, input: UpdateCompanyInput) {
  return request<{ company: CompanyDto }>(`/companies/${companyId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function uploadLogo(companyId: string, file: File) {
  const form = new FormData();
  form.append("logo", file);
  return request<{ company: CompanyDto }>(`/companies/${companyId}/logo`, {
    method: "PUT",
    body: form,
  });
}

export function logoUrl(companyId: string, version: number) {
  return `${BASE}/companies/${companyId}/logo?v=${version}`;
}

export function listCustomers(
  companyId: string,
  options: { q?: string; includeArchived?: boolean } = {},
) {
  const params = new URLSearchParams();
  if (options.q) params.set("q", options.q);
  if (options.includeArchived) params.set("include_archived", "1");
  const query = params.toString();

  return request<{ customers: CustomerDto[] }>(
    `/customers${query ? `?${query}` : ""}`,
    {},
    companyId,
  );
}

export function getCustomer(companyId: string, customerId: string) {
  return request<{ customer: CustomerDto }>(`/customers/${customerId}`, {}, companyId);
}

export function createCustomer(companyId: string, input: CreateCustomerInput) {
  return request<{ customer: CustomerDto }>(
    "/customers",
    { method: "POST", body: JSON.stringify(input) },
    companyId,
  );
}

export function updateCustomer(
  companyId: string,
  customerId: string,
  input: UpdateCustomerInput,
) {
  return request<{ customer: CustomerDto }>(
    `/customers/${customerId}`,
    { method: "PATCH", body: JSON.stringify(input) },
    companyId,
  );
}

export function listItems(
  companyId: string,
  options: { q?: string; includeArchived?: boolean } = {},
) {
  const params = new URLSearchParams();
  if (options.q) params.set("q", options.q);
  if (options.includeArchived) params.set("include_archived", "1");
  const query = params.toString();

  return request<{ items: ItemDto[] }>(`/items${query ? `?${query}` : ""}`, {}, companyId);
}

export function createItem(companyId: string, input: CreateItemInput) {
  return request<{ item: ItemDto }>(
    "/items",
    { method: "POST", body: JSON.stringify(input) },
    companyId,
  );
}

export function updateItem(companyId: string, itemId: string, input: UpdateItemInput) {
  return request<{ item: ItemDto }>(
    `/items/${itemId}`,
    { method: "PATCH", body: JSON.stringify(input) },
    companyId,
  );
}

import type {
  CreateQuotationInput,
  DocumentDto,
  DocumentListRow,
  UpdateQuotationInput,
} from "@/shared/documents";

export function listQuotations(
  companyId: string,
  options: {
    status?: string;
    q?: string;
    type?: "quotation" | "invoice" | "delivery_order";
    customerId?: string;
    from?: string;
    to?: string;
    page?: number;
  } = {},
) {
  const params = new URLSearchParams({ type: options.type ?? "quotation" });
  if (options.status) params.set("status", options.status);
  if (options.q) params.set("q", options.q);
  if (options.customerId) params.set("customer_id", options.customerId);
  if (options.from) params.set("from", options.from);
  if (options.to) params.set("to", options.to);
  if (options.page && options.page > 1) params.set("page", String(options.page));

  return request<{ documents: DocumentListRow[]; page: number; hasMore: boolean }>(
    `/documents?${params.toString()}`,
    {},
    companyId,
  );
}

export function getQuotation(companyId: string, documentId: string) {
  return request<{ document: DocumentDto }>(`/documents/${documentId}`, {}, companyId);
}

export function createQuotation(
  companyId: string,
  input: CreateQuotationInput,
  type: "quotation" | "invoice" = "quotation",
) {
  return request<{ document: DocumentDto }>(
    "/documents",
    { method: "POST", body: JSON.stringify({ ...input, type }) },
    companyId,
  );
}

export function updateQuotation(
  companyId: string,
  documentId: string,
  input: UpdateQuotationInput,
) {
  return request<{ document: DocumentDto }>(
    `/documents/${documentId}`,
    { method: "PATCH", body: JSON.stringify(input) },
    companyId,
  );
}

export function deleteQuotation(companyId: string, documentId: string) {
  return request<void>(`/documents/${documentId}`, { method: "DELETE" }, companyId);
}

export function issueQuotation(companyId: string, documentId: string) {
  return request<{ document: DocumentDto }>(
    `/documents/${documentId}/issue`,
    { method: "POST" },
    companyId,
  );
}

export function convertToInvoice(companyId: string, documentId: string) {
  return request<{ document: DocumentDto }>(
    `/documents/${documentId}/convert-to-invoice`,
    { method: "POST" },
    companyId,
  );
}

export function voidQuotation(companyId: string, documentId: string, reason: string) {
  return request<{ document: DocumentDto }>(
    `/documents/${documentId}/void`,
    { method: "POST", body: JSON.stringify({ reason }) },
    companyId,
  );
}

export function documentPdfUrl(documentId: string) {
  return `${BASE}/documents/${documentId}/pdf`;
}

export function documentPreviewUrl(documentId: string) {
  return `${BASE}/documents/${documentId}/preview`;
}

export function createDeliveryOrder(companyId: string, invoiceId: string) {
  return request<{ document: DocumentDto }>(
    `/documents/${invoiceId}/delivery-orders`,
    { method: "POST" },
    companyId,
  );
}

export function getDeliveryRemaining(companyId: string, invoiceId: string) {
  return request<{
    lines: {
      lineId: string;
      lineNo: number;
      sku: string | null;
      description: string;
      unit: string;
      invoicedMilli: number;
      deliveredMilli: number;
      remainingMilli: number;
    }[];
  }>(`/documents/${invoiceId}/delivery-remaining`, {}, companyId);
}

export function markDelivered(companyId: string, documentId: string, receivedBy: string) {
  return request<{ document: DocumentDto }>(
    `/documents/${documentId}/mark-delivered`,
    { method: "POST", body: JSON.stringify({ receivedBy: receivedBy || null }) },
    companyId,
  );
}

export function markPaid(
  companyId: string,
  documentId: string,
  input: { paid: boolean; paidOn?: string },
) {
  return request<{ document: DocumentDto }>(
    `/documents/${documentId}/mark-paid`,
    { method: "POST", body: JSON.stringify(input) },
    companyId,
  );
}

export type DashboardData = {
  drafts: {
    id: string;
    type: "quotation" | "invoice";
    number: string | null;
    customerName: string;
    totalSen: number;
    issueDate: string;
    updatedAt: number;
  }[];
  latest: {
    id: string;
    type: "quotation" | "invoice";
    number: string | null;
    customerName: string;
    totalSen: number;
    issueDate: string;
    status: string;
  }[];
  awaitingDelivery: {
    id: string;
    number: string | null;
    customerName: string;
    totalSen: number;
    issueDate: string;
    remainingLines: number;
  }[];
};

export function getDashboard(companyId: string) {
  return request<DashboardData>("/documents/dashboard", {}, companyId);
}

export type AuditEntry = {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  detail: string | null;
  at: number;
  userEmail: string;
  userName: string;
};

export function listAuditLog(companyId: string, page = 1) {
  return request<{ entries: AuditEntry[]; page: number; hasMore: boolean }>(
    `/audit-log?page=${page}`,
    {},
    companyId,
  );
}
