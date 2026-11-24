import { useState } from "react";

import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Textarea } from "@/client/components/ui/textarea";
import type { CreateCustomerInput, CustomerDto } from "@/shared/customers";

import { Field } from "./field";

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

export function CustomerForm({
  initial,
  submitting,
  error,
  onSubmit,
  onCancel,
}: {
  initial?: CustomerDto;
  submitting?: boolean;
  error?: string | null;
  onSubmit: (input: CreateCustomerInput) => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<FormState>(initial ? fromCustomer(initial) : EMPTY);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(toInput(form));
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} required />
        </Field>
        <Field label="Registration number">
          <Input
            value={form.registrationNo}
            onChange={(e) => set("registrationNo", e.target.value)}
          />
        </Field>
        <Field label="Contact person">
          <Input
            value={form.contactPerson}
            onChange={(e) => set("contactPerson", e.target.value)}
          />
        </Field>
        <Field label="Phone">
          <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </Field>
        <Field label="Payment terms (days)">
          <Input
            type="number"
            min={0}
            max={365}
            placeholder="Company default"
            value={form.paymentTermsDays}
            onChange={(e) => set("paymentTermsDays", e.target.value)}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Billing address">
          <Textarea
            rows={3}
            value={form.billingAddress}
            onChange={(e) => set("billingAddress", e.target.value)}
            required
          />
        </Field>
        <Field label="Delivery address">
          <Textarea
            rows={3}
            placeholder="Leave blank to use the billing address"
            value={form.deliveryAddress}
            onChange={(e) => set("deliveryAddress", e.target.value)}
          />
        </Field>
      </div>

      <Field label="Notes">
        <Textarea
          rows={2}
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
        />
      </Field>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Save customer"}
        </Button>
      </div>
    </form>
  );
}

