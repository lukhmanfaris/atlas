import { useState } from "react";

import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Textarea } from "@/client/components/ui/textarea";
import {
  ringgitToSen,
  senToRinggit,
  type CreateItemInput,
  type ItemDto,
} from "@/shared/items";

import { Field } from "./field";

type FormState = {
  sku: string;
  name: string;
  description: string;
  unit: string;
  price: string;
};

function fromItem(item: ItemDto): FormState {
  return {
    sku: item.sku ?? "",
    name: item.name,
    description: item.description ?? "",
    unit: item.unit,
    price: senToRinggit(item.unitPriceSen),
  };
}

const EMPTY: FormState = { sku: "", name: "", description: "", unit: "pcs", price: "0.00" };

export function ItemForm({
  initial,
  submitting,
  error,
  fieldErrors,
  onSubmit,
  onCancel,
}: {
  initial?: ItemDto;
  submitting?: boolean;
  error?: string | null;
  fieldErrors?: Record<string, string>;
  onSubmit: (input: CreateItemInput) => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<FormState>(initial ? fromItem(initial) : EMPTY);
  const [priceError, setPriceError] = useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const sen = ringgitToSen(form.price);
        if (sen === null) {
          setPriceError("Enter an amount with at most 2 decimal places, e.g. 12.50");
          return;
        }
        setPriceError(null);
        onSubmit({
          sku: form.sku.trim() || null,
          name: form.name,
          description: form.description || null,
          unit: form.unit,
          unitPriceSen: sen,
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name">
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} required />
        </Field>
        <Field label="SKU" hint={fieldErrors?.sku ?? "Optional. Must be unique in this company."}>
          <Input
            value={form.sku}
            aria-invalid={fieldErrors?.sku ? true : undefined}
            onChange={(e) => set("sku", e.target.value)}
          />
        </Field>
        <Field label="Unit" hint="e.g. pcs, box, kg, m, hour, lot">
          <Input value={form.unit} onChange={(e) => set("unit", e.target.value)} required />
        </Field>
        <Field label="Unit price (RM)" hint={priceError ?? "Stored as whole sen."}>
          <Input
            inputMode="decimal"
            value={form.price}
            aria-invalid={priceError ? true : undefined}
            onChange={(e) => set("price", e.target.value)}
          />
        </Field>
      </div>

      <Field label="Description">
        <Textarea
          rows={2}
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
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
          {submitting ? "Saving…" : "Save item"}
        </Button>
      </div>
    </form>
  );
}
