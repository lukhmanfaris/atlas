import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import type { CreateCustomerInput, CustomerDto, UpdateCustomerInput } from "@/shared/customers";

import { Button } from "@/client/components/ui/button";
import { createCustomer, listCustomers, updateCustomer } from "../api";
import { Field, inputClass } from "../components/field";
import { useCompany } from "../company";

type FormState = {
  name: string;
  registrationNo: string;
  contactPerson: string;
  phone: string;
  email: string;
  billingAddress: string;
  deliveryAddress: string;
  paymentTermsDays: string;
  notes: string;
};

const EMPTY: FormState = {
  name: "",
  registrationNo: "",
  contactPerson: "",
  phone: "",
  email: "",
  billingAddress: "",
  deliveryAddress: "",
  paymentTermsDays: "",
  notes: "",
};

function fromCustomer(customer: CustomerDto): FormState {
  return {
    name: customer.name,
    registrationNo: customer.registrationNo ?? "",
    contactPerson: customer.contactPerson ?? "",
    phone: customer.phone ?? "",
    email: customer.email ?? "",
    billingAddress: customer.billingAddress,
    deliveryAddress: customer.deliveryAddress ?? "",
    paymentTermsDays:
      customer.paymentTermsDays === null ? "" : String(customer.paymentTermsDays),
    notes: customer.notes ?? "",
  };
}

function toInput(form: FormState): CreateCustomerInput {
  return {
    name: form.name,
    registrationNo: form.registrationNo || null,
    contactPerson: form.contactPerson || null,
    phone: form.phone || null,
    email: form.email || null,
    billingAddress: form.billingAddress,
    deliveryAddress: form.deliveryAddress || null,
    paymentTermsDays: form.paymentTermsDays.trim() === "" ? null : Number(form.paymentTermsDays),
    notes: form.notes || null,
  };
}

export function CustomersPage() {
  const { company } = useCompany();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const customers = useQuery({
    queryKey: ["customers", company.id, q, showArchived],
    queryFn: () => listCustomers(company.id, { q, includeArchived: showArchived }),
  });

  function refresh() {
    return queryClient.invalidateQueries({ queryKey: ["customers", company.id] });
  }

  const save = useMutation({
    mutationFn: (input: CreateCustomerInput | UpdateCustomerInput) => {
      if (editingId === "new") return createCustomer(company.id, input as CreateCustomerInput);
      if (!editingId) throw new Error("Nothing to save");
      return updateCustomer(company.id, editingId, input);
    },
    onSuccess: async () => {
      await refresh();
      setEditingId(null);
      setForm(EMPTY);
      setError(null);
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  const setArchived = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      updateCustomer(company.id, id, { isArchived: archived ? 1 : 0 }),
    onSuccess: () => refresh(),
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function startNew() {
    setEditingId("new");
    setForm(EMPTY);
    setError(null);
  }

  function startEdit(customer: CustomerDto) {
    setEditingId(customer.id);
    setForm(fromCustomer(customer));
    setError(null);
  }

  const rows = customers.data?.customers ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Customers</h1>
          <p className="mt-1 text-slate-600">Buyers of {company.name}.</p>
        </div>
        <Button type="button" onClick={startNew}>
          New customer
        </Button>
      </header>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {editingId ? (
        <form
          className="space-y-4 rounded-lg border border-slate-200 bg-white p-4"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(toInput(form));
          }}
        >
          <h2 className="text-lg font-semibold text-slate-900">
            {editingId === "new" ? "New customer" : "Edit customer"}
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
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
              />
            </Field>
            <Field label="Contact person">
              <input
                className={inputClass}
                value={form.contactPerson}
                onChange={(event) => set("contactPerson", event.target.value)}
              />
            </Field>
            <Field label="Phone">
              <input
                className={inputClass}
                value={form.phone}
                onChange={(event) => set("phone", event.target.value)}
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                className={inputClass}
                value={form.email}
                onChange={(event) => set("email", event.target.value)}
              />
            </Field>
            <Field label="Payment terms (days)" hint="Leave blank to use the company default.">
              <input
                type="number"
                min={0}
                max={365}
                className={inputClass}
                value={form.paymentTermsDays}
                onChange={(event) => set("paymentTermsDays", event.target.value)}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Billing address">
              <textarea
                className={inputClass}
                rows={3}
                value={form.billingAddress}
                onChange={(event) => set("billingAddress", event.target.value)}
                required
              />
            </Field>
            <Field label="Delivery address" hint="Leave blank to use the billing address.">
              <textarea
                className={inputClass}
                rows={3}
                value={form.deliveryAddress}
                onChange={(event) => set("deliveryAddress", event.target.value)}
              />
            </Field>
          </div>

          <Field label="Notes">
            <textarea
              className={inputClass}
              rows={2}
              value={form.notes}
              onChange={(event) => set("notes", event.target.value)}
            />
          </Field>

          <div className="flex gap-2">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save customer"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditingId(null);
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-3">
          <input
            className={`${inputClass} max-w-xs`}
            placeholder="Search by name"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
            />
            Show archived
          </label>
        </div>

        {customers.isPending ? (
          <p className="p-4 text-slate-600">Loading customers…</p>
        ) : customers.isError ? (
          <p className="p-4 text-red-700">{customers.error.message}</p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-slate-600">
            {q ? "No customers match that name." : "No customers yet."}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((customer) => (
              <li key={customer.id} className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">
                    {customer.name}
                    {customer.isArchived ? (
                      <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                        archived
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-sm text-slate-500">
                    {[customer.contactPerson, customer.phone, customer.email]
                      .filter(Boolean)
                      .join(" · ") || "No contact details"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => startEdit(customer)}>
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setArchived.mutate({ id: customer.id, archived: !customer.isArchived })
                    }
                  >
                    {customer.isArchived ? "Restore" : "Archive"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
