import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";

import { Button } from "@/client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import { milliToQty, qtyToMilli } from "@/shared/quantities";

import { getQuotation, updateQuotation } from "../api";
import { Field } from "../components/field";
import { useCompany } from "../company";

type Row = {
  id: string;
  sourceLineId: string | null;
  description: string;
  unit: string;
  quantity: string;
};

export function DeliveryOrderEditorPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const { company } = useCompany();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [receivedBy, setReceivedBy] = useState("");
  const [error, setError] = useState<string | null>(null);

  const document = useQuery({
    queryKey: ["quotation", company.id, documentId],
    queryFn: () => getQuotation(company.id, documentId ?? ""),
    enabled: Boolean(documentId),
  });

  if (document.data && rows === null) {
    setRows(
      document.data.document.lines.map((line) => ({
        id: line.id,
        sourceLineId: line.sourceLineId,
        description: line.description,
        unit: line.unit,
        quantity: milliToQty(line.quantityMilli),
      })),
    );
  }

  const save = useMutation({
    mutationFn: () =>
      updateQuotation(company.id, documentId ?? "", {
        lines: (rows ?? []).map((row) => {
          const quantityMilli = qtyToMilli(row.quantity);
          if (quantityMilli === null || quantityMilli <= 0) {
            throw new Error(`Check the quantity for "${row.description}".`);
          }
          return {
            sourceLineId: row.sourceLineId,
            description: row.description,
            unit: row.unit,
            quantityMilli,
            unitPriceSen: 0,
            discountSen: 0,
          };
        }),
      }),
    onSuccess: () => navigate(`/delivery-orders/${documentId}`),
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  if (document.isPending || rows === null) {
    return <p className="text-sm text-muted-foreground">Loading delivery order…</p>;
  }
  if (document.isError || !document.data) {
    return <p className="text-sm text-destructive">{document.error?.message ?? "Not found."}</p>;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Edit delivery order</h1>
        <p className="text-sm text-muted-foreground">
          Lower a quantity or remove a line. You can never deliver more than the invoice has left.
        </p>
      </header>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-base">Lines</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          {rows.map((row, index) => (
            <div key={row.id} className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
              <div className="min-w-48 flex-1">
                <p className="text-sm font-medium">{row.description}</p>
                <p className="text-xs text-muted-foreground">Unit: {row.unit}</p>
              </div>
              <Field label="Quantity">
                <Input
                  value={row.quantity}
                  onChange={(event) =>
                    setRows((current) =>
                      (current ?? []).map((entry, position) =>
                        position === index ? { ...entry, quantity: event.target.value } : entry,
                      ),
                    )
                  }
                />
              </Field>
              <Button
                variant="ghost"
                onClick={() => setRows((current) => (current ?? []).filter((_, p) => p !== index))}
              >
                Remove
              </Button>
            </div>
          ))}
          {rows.length === 0 ? (
            <p className="text-sm text-destructive">A delivery order needs at least one line.</p>
          ) : null}
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate(`/delivery-orders/${documentId}`)}>
          Cancel
        </Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending || rows.length === 0}>
          {save.isPending ? "Saving…" : "Save quantities"}
        </Button>
      </div>
      <input type="hidden" value={receivedBy} onChange={(event) => setReceivedBy(event.target.value)} />
    </div>
  );
}
