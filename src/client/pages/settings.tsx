import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import type { CompanyDto, UpdateCompanyInput } from "@/shared/companies";

import { getCompany, logoUrl, updateCompany, uploadLogo } from "../api";
import { Field, inputClass } from "../components/field";
import { SettingsTabs } from "../components/settings-tabs";
import { useCompany } from "../company";

type Editable = Omit<UpdateCompanyInput, "sstRegistered">;

function toForm(company: CompanyDto) {
  return {
    name: company.name,
    registrationNo: company.registrationNo,
    addressLine1: company.addressLine1,
    addressLine2: company.addressLine2 ?? "",
    addressLine3: company.addressLine3 ?? "",
    postcode: company.postcode,
    city: company.city,
    state: company.state,
    country: company.country,
    phone: company.phone ?? "",
    email: company.email ?? "",
    website: company.website ?? "",
    brandColor: company.brandColor,
    bankName: company.bankName ?? "",
    bankAccountName: company.bankAccountName ?? "",
    bankAccountNo: company.bankAccountNo ?? "",
    paymentInstructions: company.paymentInstructions ?? "",
    defaultPaymentTermsDays: company.defaultPaymentTermsDays,
    quotationValidityDays: company.quotationValidityDays,
    prefixQuotation: company.prefixQuotation,
    prefixInvoice: company.prefixInvoice,
    prefixDeliveryOrder: company.prefixDeliveryOrder,
    quotationTerms: company.quotationTerms ?? "",
    invoiceNotes: company.invoiceNotes ?? "",
    deliveryOrderNotes: company.deliveryOrderNotes ?? "",
    sstRegistered: company.sstRegistered,
    sstNo: company.sstNo ?? "",
    tin: company.tin ?? "",
    msicCode: company.msicCode ?? "",
  };
}

export function SettingsPage() {
  const { company, user, reload } = useCompany();
  const canEdit = company.role === "owner";

  const detail = useQuery({
    queryKey: ["company", company.id],
    queryFn: () => getCompany(company.id),
  });

  const [form, setForm] = useState<ReturnType<typeof toForm> | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (detail.data) {
      setForm(toForm(detail.data.company));
      setSaved(false);
    }
  }, [detail.data]);

  const save = useMutation({
    mutationFn: (input: UpdateCompanyInput) => updateCompany(company.id, input),
    onSuccess: async () => {
      setSaved(true);
      await detail.refetch();
      await reload();
    },
  });

  const logo = useMutation({
    mutationFn: (file: File) => uploadLogo(company.id, file),
    onSuccess: async () => {
      await detail.refetch();
      await reload();
    },
  });

  if (detail.isPending || !form) {
    return <p className="text-slate-600">Loading company…</p>;
  }

  if (detail.isError) {
    return <p className="text-red-700">{detail.error.message}</p>;
  }

  function set<K extends keyof ReturnType<typeof toForm>>(
    key: K,
    value: ReturnType<typeof toForm>[K],
  ) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setSaved(false);
  }

  const current = form;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const { sstRegistered: _sstRegistered, ...editable } = current;
    save.mutate({
      ...editable,
      defaultPaymentTermsDays: Number.isFinite(editable.defaultPaymentTermsDays)
        ? editable.defaultPaymentTermsDays
        : 30,
      quotationValidityDays: Number.isFinite(editable.quotationValidityDays)
        ? editable.quotationValidityDays
        : 30,
    } satisfies Editable);
  }

  const text = (key: keyof ReturnType<typeof toForm>, label: string, hint?: string) => (
    <Field label={label} hint={hint}>
      <input
        className={inputClass}
        value={String(current[key] ?? "")}
        onChange={(event) => set(key, event.target.value as never)}
        disabled={!canEdit}
      />
    </Field>
  );

  return (
    <form className="space-y-8" onSubmit={submit}>
      <SettingsTabs />
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Company settings</h1>
          <p className="mt-1 text-slate-600">
            {canEdit
              ? "These details appear on every document this company issues."
              : "Only an owner can change these."}
          </p>
          <p className="text-xs text-muted-foreground">Signed in as {user.email}</p>
        </div>
        {canEdit ? (
          <button
            type="submit"
            disabled={save.isPending}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {save.isPending ? "Saving…" : "Save changes"}
          </button>
        ) : null}
      </header>

      {save.isError ? <p className="text-sm text-red-700">{save.error.message}</p> : null}
      {saved ? <p className="text-sm text-green-700">Saved.</p> : null}

      <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Logo</h2>
        <div className="flex flex-wrap items-center gap-4">
          {detail.data?.company.logoR2Key ? (
            <img
              src={logoUrl(company.id, Date.now())}
              alt={`${company.name} logo`}
              className="h-16 w-auto max-w-48 rounded border border-slate-200 bg-white object-contain p-1"
            />
          ) : (
            <span className="text-sm text-slate-500">No logo yet.</span>
          )}
          {canEdit ? (
            <label className="cursor-pointer rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900">
              Upload PNG or JPEG
              <input
                type="file"
                accept="image/png,image/jpeg"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) logo.mutate(file);
                  event.target.value = "";
                }}
              />
            </label>
          ) : null}
        </div>
        <p className="text-xs text-slate-500">PNG or JPEG, up to 1 MB. Shown at most 30 mm tall on PDFs.</p>
        {logo.isError ? <p className="text-sm text-red-700">{logo.error.message}</p> : null}
      </section>

      <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 sm:col-span-2">
          Identity
        </h2>
        {text("name", "Company name")}
        {text("registrationNo", "SSM registration number")}
        {text("brandColor", "Heading colour", "Six-digit hex, e.g. #111827")}
      </section>

      <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 sm:col-span-2">
          Address
        </h2>
        {text("addressLine1", "Address line 1")}
        {text("addressLine2", "Address line 2")}
        {text("addressLine3", "Address line 3")}
        {text("postcode", "Postcode")}
        {text("city", "City")}
        {text("state", "State")}
        {text("country", "Country")}
      </section>

      <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 sm:col-span-2">
          Contact
        </h2>
        {text("phone", "Phone")}
        {text("email", "Email")}
        {text("website", "Website")}
      </section>

      <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 sm:col-span-2">
          Bank details
        </h2>
        {text("bankName", "Bank")}
        {text("bankAccountName", "Account name")}
        {text("bankAccountNo", "Account number")}
        <div className="sm:col-span-2">
          <Field label="Payment instructions" hint="Printed on invoices under the bank details.">
            <textarea
              className={inputClass}
              rows={3}
              value={current.paymentInstructions}
              onChange={(event) => set("paymentInstructions", event.target.value)}
              disabled={!canEdit}
            />
          </Field>
        </div>
      </section>

      <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 sm:col-span-2">
          Numbering and defaults
        </h2>
        {text("prefixQuotation", "Quotation prefix")}
        {text("prefixInvoice", "Invoice prefix")}
        {text("prefixDeliveryOrder", "Delivery order prefix")}
        <Field label="Payment terms (days)">
          <input
            type="number"
            min={0}
            max={365}
            className={inputClass}
            value={current.defaultPaymentTermsDays}
            onChange={(event) => set("defaultPaymentTermsDays", Number(event.target.value))}
            disabled={!canEdit}
          />
        </Field>
        <Field label="Quotation validity (days)">
          <input
            type="number"
            min={1}
            max={365}
            className={inputClass}
            value={current.quotationValidityDays}
            onChange={(event) => set("quotationValidityDays", Number(event.target.value))}
            disabled={!canEdit}
          />
        </Field>
      </section>

      <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Default text
        </h2>
        <Field label="Quotation terms">
          <textarea
            className={inputClass}
            rows={3}
            value={current.quotationTerms}
            onChange={(event) => set("quotationTerms", event.target.value)}
            disabled={!canEdit}
          />
        </Field>
        <Field label="Invoice notes">
          <textarea
            className={inputClass}
            rows={3}
            value={current.invoiceNotes}
            onChange={(event) => set("invoiceNotes", event.target.value)}
            disabled={!canEdit}
          />
        </Field>
        <Field label="Delivery order notes">
          <textarea
            className={inputClass}
            rows={2}
            value={current.deliveryOrderNotes}
            onChange={(event) => set("deliveryOrderNotes", event.target.value)}
            disabled={!canEdit}
          />
        </Field>
      </section>

      {current.sstRegistered ? (
        <section className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 sm:col-span-2">
            Tax
          </h2>
          {text("sstNo", "SST number")}
          {text("tin", "TIN")}
          {text("msicCode", "MSIC code")}
        </section>
      ) : (
        <p className="text-xs text-slate-500">
          SST, TIN and MSIC fields are hidden because this company is not SST-registered.
        </p>
      )}
    </form>
  );
}
