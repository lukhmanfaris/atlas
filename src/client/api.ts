import type { CompanyDto, CreateCompanyInput, UpdateCompanyInput } from "@/shared/companies";
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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...init.headers,
    },
  });

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
