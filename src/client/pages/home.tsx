import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";

import type { CreateCompanyInput } from "@/shared/companies";

import { createCompany } from "../api";
import { Field, inputClass } from "../components/field";
import { useCompany } from "../company";

const EMPTY: CreateCompanyInput = {
  name: "",
  registrationNo: "",
  addressLine1: "",
  postcode: "",
  city: "",
  state: "",
};

export function HomePage() {
  const { company, companies, reload, selectCompany } = useCompany();
  const [form, setForm] = useState<CreateCompanyInput>(EMPTY);
  const [open, setOpen] = useState(false);

  const create = useMutation({
    mutationFn: (input: CreateCompanyInput) => createCompany(input),
    onSuccess: async (result) => {
      await reload();
      selectCompany(result.company.id);
      setForm(EMPTY);
      setOpen(false);
    },
  });

  function set<K extends keyof CreateCompanyInput>(key: K, value: CreateCompanyInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold text-slate-900">{company.name}</h1>
        <p className="mt-1 text-slate-600">
          You are working in this company. Everything you create belongs to it only.
        </p>
        <p className="mt-4 text-sm text-slate-500">
          Company profile, logo and numbering live in{" "}
          <Link to="/settings" className="font-medium text-slate-900 underline">
            Settings
          </Link>
          .
        </p>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Your companies
        </h2>
        <ul className="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {companies.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <span className="text-slate-900">
                {entry.name}
                {entry.id === company.id ? (
                  <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                    current
                  </span>
                ) : null}
              </span>
              <span className="text-sm text-slate-500">{entry.role}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        {open ? (
          <form
            className="space-y-4 rounded-lg border border-slate-200 bg-white p-4"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate(form);
            }}
          >
            <h2 className="text-lg font-semibold text-slate-900">New company</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Company name">
                <input
                  className={inputClass}
                  value={form.name}
                  onChange={(event) => set("name", event.target.value)}
                  required
                />
              </Field>
              <Field label="Registration number">
                <input
                  className={inputClass}
                  value={form.registrationNo}
                  onChange={(event) => set("registrationNo", event.target.value)}
                  required
                />
              </Field>
              <Field label="Address line 1">
                <input
                  className={inputClass}
                  value={form.addressLine1}
                  onChange={(event) => set("addressLine1", event.target.value)}
                  required
                />
              </Field>
              <Field label="Postcode">
                <input
                  className={inputClass}
                  value={form.postcode}
                  onChange={(event) => set("postcode", event.target.value)}
                  required
                />
              </Field>
              <Field label="City">
                <input
                  className={inputClass}
                  value={form.city}
                  onChange={(event) => set("city", event.target.value)}
                  required
                />
              </Field>
              <Field label="State">
                <input
                  className={inputClass}
                  value={form.state}
                  onChange={(event) => set("state", event.target.value)}
                  required
                />
              </Field>
            </div>

            {create.isError ? <p className="text-sm text-red-700">{create.error.message}</p> : null}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={create.isPending}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {create.isPending ? "Creating…" : "Create company"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900"
          >
            Add company
          </button>
        )}
      </section>
    </div>
  );
}
