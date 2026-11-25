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
import { Input } from "@/client/components/ui/input";
import { Textarea } from "@/client/components/ui/textarea";
import { DateField } from "../components/date-field";
import { formatRinggit } from "@/shared/items";
import { milliToQty } from "@/shared/quantities";

import {
  convertToInvoice,
  deleteQuotation,
  documentPdfUrl,
  documentPreviewUrl,
  getQuotation,
  issueQuotation,
  createDeliveryOrder,
  getDeliveryRemaining,
  listCustomers,
  markPaid,
  markDelivered as markDeliveredRequest,
  voidQuotation,
} from "../api";
import { useCompany } from "../company";

export function QuotationViewPage({
  documentType = "quotation",
}: {
  documentType?: "quotation" | "invoice" | "delivery_order";
}) {
  const basePath =
    documentType === "invoice"
      ? "/invoices"
      : documentType === "delivery_order"
        ? "/delivery-orders"
        : "/quotations";
  const { documentId } = useParams<{ documentId: string }>();
  const { company } = useCompany();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [voidOpen, setVoidOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [paidOpen, setPaidOpen] = useState(false);
  const [deliveredOpen, setDeliveredOpen] = useState(false);
  const [receiver, setReceiver] = useState("");
  const [today] = useState(() =>
    new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10),
  );
  const [paidOn, setPaidOn] = useState(today);
  const [deliveredOn, setDeliveredOn] = useState(today);
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

  const convert = useMutation({
    mutationFn: () => convertToInvoice(company.id, documentId ?? ""),
    onSuccess: async (result) => {
      await refresh();
      navigate(`/invoices/${result.document.id}`);
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  const markDelivered = useMutation({
    mutationFn: (input: { receivedBy?: string; deliveredOn?: string }) =>
      markDeliveredRequest(company.id, documentId ?? "", input),
    onSuccess: () => refresh(),
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  const togglePaid = useMutation({
    mutationFn: (input: { paid: boolean; paidOn?: string }) =>
      markPaid(company.id, documentId ?? "", input),
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
    onSuccess: () => navigate(basePath),
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
        <Button variant="outline" nativeButton={false} render={<Link to={basePath} />}>
          <ArrowLeft className="size-4" />
          Quotations
        </Button>
      </div>
    );
  }

  const document = quotation.data.document;
  const customer = customers.data?.customers.find((entry) => entry.id === document.customerId);
  const isOwner = company.role === "owner";
  const isDeliveryOrder = document.type === "delivery_order";
  const canVoid = ["issued", "accepted", "rejected"].includes(document.status);

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" className="-ml-2" nativeButton={false} render={<Link to={basePath} />}>
        <ArrowLeft className="size-4" />
        {documentType === "invoice" ? "Invoices" : documentType === "delivery_order" ? "Delivery orders" : "Quotations"}
      </Button>

      <Card>
        <CardHeader className="gap-3 border-b sm:flex sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex flex-wrap items-center gap-2 text-xl">
              {document.number ?? `Draft ${documentType.replace("_", " ")}`}
              <Badge variant={document.expired ? "destructive" : "secondary"}>
                {document.expired ? "expired" : document.status}
              </Badge>
              {document.paidAt ? <Badge>paid</Badge> : null}
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
                  render={
                    <Link
                      to={
                        isDeliveryOrder
                          ? `/delivery-orders/${document.id}/edit`
                          : `${basePath}/${document.id}/edit`
                      }
                    />
                  }
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
                {document.type === "quotation" &&
                (document.status === "issued" || document.status === "accepted") ? (
                  <Button size="sm" onClick={() => convert.mutate()} disabled={convert.isPending}>
                    {convert.isPending ? "Converting…" : "Convert to invoice"}
                  </Button>
                ) : null}
                {document.type === "invoice" && document.status === "issued" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      document.paidAt
                        ? togglePaid.mutate({ paid: false })
                        : setPaidOpen(true)
                    }
                  >
                    {document.paidAt ? "Mark unpaid" : "Mark paid"}
                  </Button>
                ) : null}
                {isDeliveryOrder && document.status === "issued" ? (
                  <Button
                    size="sm"
                    onClick={() => setDeliveredOpen(true)}
                  >
                    Mark delivered
                  </Button>
                ) : null}
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
            {document.dueDate ? <Row label="Due date" value={document.dueDate} /> : null}
            {document.sourceNumber ? (
              <div className="flex justify-between gap-4 border-b pb-1">
                <span className="text-muted-foreground">Quotation</span>
                <Link
                  to={`/quotations/${document.sourceDocumentId}`}
                  className="underline-offset-4 hover:underline"
                >
                  {document.sourceNumber}
                </Link>
              </div>
            ) : null}
            {document.linkedInvoices && document.linkedInvoices.length > 0 ? (
              <div className="flex justify-between gap-4 border-b pb-1">
                <span className="text-muted-foreground">Invoice</span>
                <Link
                  to={`/invoices/${document.linkedInvoices[0]?.id}`}
                  className="underline-offset-4 hover:underline"
                >
                  {document.linkedInvoices[0]?.number ?? "draft"} ({document.linkedInvoices[0]?.status})
                </Link>
              </div>
            ) : null}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3">No.</th>
                  <th className="py-2 pr-3">Description</th>
                  <th className="py-2 pr-3 text-right">Qty</th>
                  <th className="py-2 pr-3">Unit</th>
                  {isDeliveryOrder ? null : (
                    <>
                      <th className="py-2 pr-3 text-right">Price</th>
                      <th className="py-2 pr-3 text-right">Discount</th>
                      <th className="py-2 text-right">Amount</th>
                    </>
                  )}
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
                    {isDeliveryOrder ? null : (
                      <>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {formatRinggit(line.unitPriceSen ?? 0)}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {formatRinggit(line.discountSen)}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {formatRinggit(line.lineTotalSen ?? 0)}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={isDeliveryOrder ? "hidden" : "ml-auto w-full max-w-xs space-y-1 text-sm"}>
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

          {!isDeliveryOrder && document.amountInWords ? (
            <p className="text-xs text-muted-foreground">{document.amountInWords}</p>
          ) : null}

          {document.type === "invoice" ? (
            <InvoiceDeliverySection
              invoiceId={document.id}
              linked={document.linkedDeliveryOrders ?? []}
            />
          ) : null}

          {document.notes ? <Section title="Notes" value={document.notes} /> : null}
          {document.terms ? <Section title="Terms" value={document.terms} /> : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>

      <Dialog open={paidOpen} onOpenChange={setPaidOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark {document.number} paid</DialogTitle>
            <DialogDescription>Choose the date the payment arrived.</DialogDescription>
          </DialogHeader>
          <DateField value={paidOn} onChange={setPaidOn} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaidOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!paidOn || togglePaid.isPending}
              onClick={() =>
                togglePaid.mutate({ paid: true, paidOn }, { onSuccess: () => setPaidOpen(false) })
              }
            >
              Mark paid
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deliveredOpen} onOpenChange={setDeliveredOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark {document.number} delivered</DialogTitle>
            <DialogDescription>Record when it arrived and who signed for it.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <DateField value={deliveredOn} onChange={setDeliveredOn} />
            <Input
              placeholder="Received by (optional)"
              value={receiver}
              onChange={(event) => setReceiver(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeliveredOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={markDelivered.isPending}
              onClick={() =>
                markDelivered.mutate(
                  { receivedBy: receiver, deliveredOn },
                  { onSuccess: () => setDeliveredOpen(false) },
                )
              }
            >
              Mark delivered
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              {voidIt.isPending ? "Voiding…" : "Void document"}
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

function InvoiceDeliverySection({
  invoiceId,
  linked,
}: {
  invoiceId: string;
  linked: { id: string; number: string | null; status: string }[];
}) {
  const { company } = useCompany();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const remaining = useQuery({
    queryKey: ["delivery-remaining", company.id, invoiceId],
    queryFn: () => getDeliveryRemaining(company.id, invoiceId),
  });

  const create = useMutation({
    mutationFn: () => createDeliveryOrder(company.id, invoiceId),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["delivery-remaining", company.id, invoiceId] });
      navigate(`/delivery-orders/${result.document.id}`);
    },
  });

  const lines = remaining.data?.lines ?? [];
  const anyLeft = lines.some((line) => line.remainingMilli > 0);

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Delivery
        </h2>
        <Button
          size="sm"
          variant="outline"
          disabled={!anyLeft || create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending ? "Creating…" : "Create delivery order"}
        </Button>
      </div>

      {lines.length > 0 ? (
        <ul className="space-y-1 text-sm">
          {lines.map((line) => (
            <li key={line.lineId} className="flex justify-between gap-4 border-b pb-1">
              <span className="min-w-0 truncate">{line.description}</span>
              <span className="whitespace-nowrap text-muted-foreground">
                {milliToQty(line.deliveredMilli)} delivered · {milliToQty(line.remainingMilli)} left
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {linked.length > 0 ? (
        <p className="text-sm">
          {linked.map((entry) => (
            <Link
              key={entry.id}
              to={`/delivery-orders/${entry.id}`}
              className="mr-2 underline-offset-4 hover:underline"
            >
              {entry.number ?? "draft"} ({entry.status})
            </Link>
          ))}
        </p>
      ) : null}

      {create.isError ? <p className="text-sm text-destructive">{create.error.message}</p> : null}
    </section>
  );
}
