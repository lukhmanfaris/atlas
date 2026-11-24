import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { Button } from "@/client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import { Textarea } from "@/client/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import {
  createQuotation,
  deleteQuotation,
  getQuotation,
  issueQuotation,
  listCustomers,
  listItems,
  updateQuotation,
} from "../api";
import { Field } from "../components/field";
import { useCompany } from "../company";
import { formatRinggit, ringgitToSen, senToRinggit } from "@/shared/items";
import { milliToQty, qtyToMilli } from "@/shared/quantities";
import { computeTotals } from "@/shared/totals";

type LineState = {
  key: string;
  itemId: string;
  sku: string;
  description: string;
  unit: string;
  quantity: string;
  price: string;
  discount: string;
};

function emptyLine(): LineState {
  return {
    key: crypto.randomUUID(),
    itemId: "NONE",
    sku: "",
    description: "",
    unit: "pcs",
    quantity: "1",
    price: "0.00",
    discount: "0.00",
  };
}

function todayInMalaysia(): string {
  return new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
}

export function QuotationEditorPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const { company } = useCompany();
  const navigate = useNavigate();
  const editing = Boolean(documentId);

  const customers = useQuery({
    queryKey: ["customers", company.id, "picker"],
    queryFn: () => listCustomers(company.id, {}),
  });
  const items = useQuery({
    queryKey: ["items", company.id, "picker"],
    queryFn: () => listItems(company.id, {}),
  });
  const existing = useQuery({
    queryKey: ["quotation", company.id, documentId],
    queryFn: () => getQuotation(company.id, documentId ?? ""),
    enabled: editing,
  });

  const [customerId, setCustomerId] = useState("");
  const [issueDate, setIssueDate] = useState(todayInMalaysia());
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [discount, setDiscount] = useState("0.00");
  const [lines, setLines] = useState<LineState[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const document = existing.data?.document;
    if (!document) return;
    setCustomerId(document.customerId);
    setIssueDate(document.issueDate);
    setValidUntil(document.validUntil ?? "");
    setNotes(document.notes ?? "");
    setTerms(document.terms ?? "");
    setDiscount(senToRinggit(document.discountSen));
    setLines(
      document.lines.map((line) => ({
        key: line.id,
        itemId: line.itemId ?? "NONE",
        sku: line.sku ?? "",
        description: line.description,
        unit: line.unit,
        quantity: milliToQty(line.quantityMilli),
        price: senToRinggit(line.unitPriceSen ?? 0),
        discount: senToRinggit(line.discountSen),
      })),
    );
  }, [existing.data]);

  const totals = useMemo(() => {
    const mapped = lines.map((line) => ({
      quantityMilli: qtyToMilli(line.quantity) ?? 0,
      unitPriceSen: ringgitToSen(line.price) ?? 0,
      discountSen: ringgitToSen(line.discount) ?? 0,
    }));
    return computeTotals(mapped, ringgitToSen(discount) ?? 0, 0);
  }, [lines, discount]);

  const save = useMutation({
    mutationFn: async (mode: "draft" | "issue") => {
      const payloadLines = lines.map((line) => {
        const quantityMilli = qtyToMilli(line.quantity);
        const unitPriceSen = ringgitToSen(line.price);
        const discountSen = ringgitToSen(line.discount);
        if (!line.description.trim()) throw new Error("Every line needs a description.");
        if (quantityMilli === null) throw new Error(`Check the quantity on "${line.description}".`);
        if (unitPriceSen === null) throw new Error(`Check the price on "${line.description}".`);
        if (discountSen === null) throw new Error(`Check the discount on "${line.description}".`);

        return {
          itemId: line.itemId === "NONE" ? null : line.itemId,
          sku: line.sku || null,
          description: line.description,
          unit: line.unit,
          quantityMilli,
          unitPriceSen,
          discountSen,
        };
      });

      const input = {
        customerId,
        issueDate,
        validUntil: validUntil || undefined,
        notes: notes || null,
        terms: terms || null,
        discountSen: ringgitToSen(discount) ?? 0,
        lines: payloadLines,
      };

      const saved = editing && documentId
        ? await updateQuotation(company.id, documentId, input)
        : await createQuotation(company.id, { type: "quotation", ...input });

      if (mode === "issue") {
        return issueQuotation(company.id, saved.document.id);
      }
      return saved;
    },
    onSuccess: (result) => {
      navigate(`/quotations/${result.document.id}`);
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  const removeDraft = useMutation({
    mutationFn: () => deleteQuotation(company.id, documentId ?? ""),
    onSuccess: () => navigate("/quotations"),
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  const customerList = customers.data?.customers ?? [];
  const itemList = items.data?.items ?? [];

  function setLine(key: string, patch: Partial<LineState>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function pickItem(key: string, itemId: string) {
    if (itemId === "NONE") {
      setLine(key, { itemId: "NONE", sku: "" });
      return;
    }
    const item = itemList.find((entry) => entry.id === itemId);
    if (!item) return;
    setLine(key, {
      itemId: item.id,
      sku: item.sku ?? "",
      description: item.description ? `${item.name} — ${item.description}` : item.name,
      unit: item.unit,
      price: senToRinggit(item.unitPriceSen),
    });
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {editing ? "Edit quotation" : "New quotation"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Drafts can be changed freely. Issuing freezes the document and assigns its number.
        </p>
      </header>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 pt-4 sm:grid-cols-2">
          <Field label="Customer">
            <Select
              value={customerId}
              onValueChange={(value) => setCustomerId(value ?? "")}
              items={customerList.map((customer) => ({
                value: customer.id,
                label: customer.name,
              }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {customerList.map((customer) => (
                  <SelectItem key={customer.id} value={customer.id}>
                    {customer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Issue date">
            <Input
              type="date"
              value={issueDate}
              onChange={(event) => setIssueDate(event.target.value)}
            />
          </Field>
          <Field label="Valid until" hint="Leave blank to use the company default.">
            <Input
              type="date"
              value={validUntil}
              onChange={(event) => setValidUntil(event.target.value)}
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between border-b">
          <CardTitle className="text-base">Lines</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setLines((rows) => [...rows, emptyLine()])}>
            <Plus className="size-4" />
            Add line
          </Button>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          {lines.map((line) => (
            <div key={line.key} className="grid gap-3 rounded-lg border p-3">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                <Field label="Item">
                  <Select
                    value={line.itemId}
                    onValueChange={(value) => pickItem(line.key, value ?? "NONE")}
                    items={[
                      { value: "NONE", label: "Free text" },
                      ...itemList.map((item) => ({
                        value: item.id,
                        label: item.sku ? `${item.sku} — ${item.name}` : item.name,
                      })),
                    ]}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">Free text</SelectItem>
                      {itemList.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.sku ? `${item.sku} — ${item.name}` : item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Description">
                  <Input
                    value={line.description}
                    onChange={(event) => setLine(line.key, { description: event.target.value })}
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-5">
                <Field label="Qty">
                  <Input
                    value={line.quantity}
                    onChange={(event) => setLine(line.key, { quantity: event.target.value })}
                  />
                </Field>
                <Field label="Unit">
                  <Input
                    value={line.unit}
                    onChange={(event) => setLine(line.key, { unit: event.target.value })}
                  />
                </Field>
                <Field label="Unit price (RM)">
                  <Input
                    value={line.price}
                    onChange={(event) => setLine(line.key, { price: event.target.value })}
                  />
                </Field>
                <Field label="Discount (RM)">
                  <Input
                    value={line.discount}
                    onChange={(event) => setLine(line.key, { discount: event.target.value })}
                  />
                </Field>
                <div className="flex items-end justify-between gap-2">
                  <div className="text-sm">
                    <span className="block text-xs text-muted-foreground">Amount</span>
                    <span className="tabular-nums">
                      {formatRinggit(
                        (qtyToMilli(line.quantity) ?? 0) * (ringgitToSen(line.price) ?? 0) / 1000 -
                          (ringgitToSen(line.discount) ?? 0),
                      )}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove line"
                    onClick={() =>
                      setLines((rows) =>
                        rows.length === 1 ? rows : rows.filter((row) => row.key !== line.key),
                      )
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-base">Totals</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 pt-4 sm:grid-cols-2">
          <Field label="Document discount (RM)">
            <Input value={discount} onChange={(event) => setDiscount(event.target.value)} />
          </Field>
          <div className="space-y-1 text-sm sm:text-right">
            <p className="flex justify-between sm:justify-end sm:gap-6">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">{formatRinggit(totals.subtotalSen)}</span>
            </p>
            <p className="flex justify-between font-semibold sm:justify-end sm:gap-6">
              <span>Total</span>
              <span className="tabular-nums">{formatRinggit(totals.totalSen)}</span>
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-base">Notes and terms</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 pt-4">
          <Field label="Notes">
            <Textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </Field>
          <Field label="Terms">
            <Textarea rows={3} value={terms} onChange={(event) => setTerms(event.target.value)} />
          </Field>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => navigate(-1)}>
          Cancel
        </Button>
        {editing ? (
          <Button
            variant="ghost"
            onClick={() => {
              if (window.confirm("Delete this draft? No number has been used.")) {
                removeDraft.mutate();
              }
            }}
          >
            Delete draft
          </Button>
        ) : null}
        <Button
          variant="outline"
          onClick={() => save.mutate("draft")}
          disabled={save.isPending || !customerId}
        >
          Save draft
        </Button>
        <Button
          onClick={() => save.mutate("issue")}
          disabled={save.isPending || !customerId}
        >
          Issue
        </Button>
      </div>
    </div>
  );
}
