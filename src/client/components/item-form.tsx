import { useState } from "react";

import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import { Textarea } from "@/client/components/ui/textarea";
import {
  ITEM_CATEGORIES,
  ringgitToSen,
  senToRinggit,
  type CreateItemInput,
  type ItemCategory,
  type ItemDto,
} from "@/shared/items";

import { Field } from "./field";

const NO_CATEGORY = "NONE";

type FormState = {
  category: ItemCategory | typeof NO_CATEGORY;
  sku: string;
  name: string;
  description: string;
  unit: string;
  price: string;
};

function fromItem(item: ItemDto): FormState {
  return {
    category: item.category ?? NO_CATEGORY,
    sku: item.sku ?? "",
    name: item.name,
    description: item.description ?? "",
    unit: item.unit,
    price: senToRinggit(item.unitPriceSen),
  };
}

const EMPTY: FormState = {
  category: NO_CATEGORY,
  sku: "",
  name: "",
  description: "",
  unit: "pcs",
  price: "0.00",
};

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

  const category = form.category === NO_CATEGORY ? null : form.category;
  const autoNumberHint = category
    ? form.sku.trim()
      ? "Overrides the automatic number."
      : `Assigned when you save, e.g. ${category}-001`
    : "Pick a category to get an automatic SKU.";

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
          category,
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

        <Field label="Category">
          <Select
            value={form.category}
            onValueChange={(value) => set("category", value as FormState["category"])}
            items={[
              { value: NO_CATEGORY, label: "No category" },
              ...ITEM_CATEGORIES.map((entry) => ({
                value: entry.value,
                label: `${entry.value} — ${entry.label}`,
              })),
            ]}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_CATEGORY}>No category</SelectItem>
              {ITEM_CATEGORIES.map((entry) => (
                <SelectItem key={entry.value} value={entry.value}>
                  {entry.value} — {entry.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="SKU" hint={fieldErrors?.sku ?? autoNumberHint}>
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
          placeholder="Shown to the customer on document lines"
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
