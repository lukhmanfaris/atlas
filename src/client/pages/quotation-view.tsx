import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, FileText, Pencil } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/client/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { Textarea } from "@/client/components/ui/textarea";
import { formatRinggit } from "@/shared/items";
import { milliToQty } from "@/shared/quantities";

import {
  deleteQuotation,
  documentPdfUrl,
  documentPreviewUrl,
  getQuotation,
  issueQuotation,
  listCustomers,
  voidQuotation,
} from "../api";
import { useCompany } from "../company";

export function QuotationViewPage() {
  const { documentId } = useParams<{ documentId: string }>();
  const { company } = useCompany();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [voidOpen, setVoidOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const quotation = useQuery({
    queryKey: ["quotation", company.id, documentId],
    queryFn: () => getQuotation(company.id, documentId ?? ""),
    enabled: Boolean(documentId),
  });

  const customers = useQuery({
    queryKey: ["customers", company.id, "picker"],
    queryFn: () => listCustomers(company.id, {}),
  });

  function refresh() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ["quotation", company.id, documentId] }),
      queryClient.invalidateQueries({ queryKey: ["quotations", company.id] }),
    ]);
  }

  const issue = useMutation({
    mutationFn: () => issueQuotation(company.id, documentId ?? ""),
    onSuccess: () => refresh(),
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  const voidIt = useMutation({
    mutationFn: () => voidQuotation(company.id, documentId ?? "", reason),
    onSuccess: async () => {
      setVoidOpen(false);
      setReason("");
      await refresh();
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  const remove = useMutation({
    mutationFn: () => deleteQuotation(company.id, documentId ?? ""),
    onSuccess: () => navigate("/quotations"),
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  if (quotation.isPending) {
    return <p className="text-sm text-muted-foreground">Loading quotation…</p>;
  }

  if (quotation.isError || !quotation.data) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">
          {quotation.error?.message ?? "Quotation not found."}
        </p>
        <Button variant="outline" nativeButton={false} render={<Link to="/quotations" />}>
          <ArrowLeft className="size-4" />
          Quotations
        </Button>
      </div>
    );
  }

  const document = quotation.data.document;
  const customer = customers.data?.customers.find((entry) => entry.id === document.customerId);
  const isOwner = company.role === "owner";
  const canVoid = ["issued", "accepted", "rejected"].includes(document.status);

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" className="-ml-2" nativeButton={false} render={<Link to="/quotations" />}>
        <ArrowLeft className="size-4" />
        Quotations
      </Button>

      <Card>
        <CardHeader className="gap-3 border-b sm:flex sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex flex-wrap items-center gap-2 text-xl">
              {document.number ?? "Draft quotation"}
              <Badge variant={document.expired ? "destructive" : "secondary"}>
                {document.expired ? "expired" : document.status}
              </Badge>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {customer?.name ?? "Customer"} · issued {document.issueDate}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {document.status === "draft" ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={<Link to={`/quotations/${document.id}/edit`} />}
                >
                  <Pencil className="size-4" />
                  Edit
                </Button>
                <Button size="sm" onClick={() => issue.mutate()} disabled={issue.isPending}>
                  {issue.isPending ? "Issuing…" : "Issue"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (window.confirm("Delete this draft? No number has been used.")) {
                      remove.mutate();
                    }
                  }}
                >
                  Delete
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={<a href={documentPreviewUrl(document.id)} target="_blank" rel="noreferrer" />}
                >
                  <FileText className="size-4" />
                  Preview
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={<a href={documentPdfUrl(document.id)} target="_blank" rel="noreferrer" />}
                >
                  <Download className="size-4" />
                  PDF
                </Button>
                {canVoid && isOwner ? (
                  <Button variant="ghost" size="sm" onClick={() => setVoidOpen(true)}>
                    Void
                  </Button>
                ) : null}
              </>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-6 pt-4">
          {document.voidReason ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              Voided: {document.voidReason}
            </p>
          ) : null}

          <div className="grid gap-4 text-sm sm:grid-cols-2">
            <Row label="Valid until" value={document.validUntil} />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3">No.</th>
                  <th className="py-2 pr-3">Description</th>
                  <th className="py-2 pr-3 text-right">Qty</th>
                  <th className="py-2 pr-3">Unit</th>
                  <th className="py-2 pr-3 text-right">Price</th>
                  <th className="py-2 pr-3 text-right">Discount</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {document.lines.map((line) => (
                  <tr key={line.id} className="border-b">
                    <td className="py-2 pr-3">{line.lineNo}</td>
                    <td className="py-2 pr-3">
                      {line.description}
                      {line.sku ? (
                        <span className="block text-xs text-muted-foreground">{line.sku}</span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {milliToQty(line.quantityMilli)}
                    </td>
                    <td className="py-2 pr-3">{line.unit}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {formatRinggit(line.unitPriceSen ?? 0)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {formatRinggit(line.discountSen)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatRinggit(line.lineTotalSen ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
            <p className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">{formatRinggit(document.subtotalSen)}</span>
            </p>
            <p className="flex justify-between">
              <span className="text-muted-foreground">Discount</span>
              <span className="tabular-nums">{formatRinggit(document.discountSen)}</span>
            </p>
            <p className="flex justify-between border-t pt-1 font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatRinggit(document.totalSen)}</span>
            </p>
          </div>

          {document.amountInWords ? (
            <p className="text-xs text-muted-foreground">{document.amountInWords}</p>
          ) : null}

          {document.notes ? <Section title="Notes" value={document.notes} /> : null}
          {document.terms ? <Section title="Terms" value={document.terms} /> : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>

      <Dialog open={voidOpen} onOpenChange={setVoidOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Void {document.number}</DialogTitle>
            <DialogDescription>
              The number is kept and the issued PDF is preserved. A separate VOID copy is stored.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={3}
            placeholder="Reason for voiding"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setVoidOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!reason.trim() || voidIt.isPending}
              onClick={() => voidIt.mutate()}
            >
              {voidIt.isPending ? "Voiding…" : "Void quotation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-4 border-b pb-1">
      <span className="text-muted-foreground">{label}</span>
      <span>{value ?? "—"}</span>
    </div>
  );
}

function Section({ title, value }: { title: string; value: string }) {
  return (
    <section className="space-y-1">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      <p className="whitespace-pre-line text-sm">{value}</p>
    </section>
  );
}
