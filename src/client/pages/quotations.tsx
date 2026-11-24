import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { formatRinggit } from "@/shared/items";

import { listCustomers, listQuotations } from "../api";
import { useCompany } from "../company";

const STATUSES = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "issued", label: "Issued" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
  { value: "void", label: "Void" },
];

function statusBadge(status: string, expired: boolean, paidAt: number | null) {
  if (expired) {
    return <Badge variant="destructive">expired</Badge>;
  }
  if (status === "issued" || status === "accepted") {
    return (
      <span className="inline-flex gap-1">
        <Badge>{status}</Badge>
        {paidAt ? <Badge>paid</Badge> : null}
      </span>
    );
  }
  if (status === "draft") {
    return <Badge variant="secondary">draft</Badge>;
  }
  return <Badge variant="outline">{status}</Badge>;
}

export function QuotationsPage({ documentType = "quotation" }: { documentType?: "quotation" | "invoice" | "delivery_order" }) {
  const { company } = useCompany();
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [customerId, setCustomerId] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const customers = useQuery({
    queryKey: ["customers", company.id, "picker"],
    queryFn: () => listCustomers(company.id, {}),
  });

  const quotations = useQuery({
    queryKey: ["quotations", documentType, company.id, status, q, customerId, from, to, page],
    queryFn: () =>
      listQuotations(company.id, {
        type: documentType,
        status: status === "all" ? undefined : status,
        q: q || undefined,
        customerId: customerId === "all" ? undefined : customerId,
        from: from || undefined,
        to: to || undefined,
        page,
      }),
  });

  const rows = quotations.data?.documents ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {documentType === "invoice" ? "Invoices" : documentType === "delivery_order" ? "Delivery orders" : "Quotations"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {documentType === "invoice" ? "Invoices" : documentType === "delivery_order" ? "Delivery orders" : "Quotations"} issued by {company.name}.
          </p>
        </div>
        {documentType === "delivery_order" ? null : (
          <Button nativeButton={false} render={<Link to={`/${documentType === "invoice" ? "invoices" : "quotations"}/new`} />}>
            <Plus className="size-4" />
            {documentType === "invoice" ? "New invoice" : "New quotation"}
          </Button>
        )}
      </header>

      <Card>
        <CardHeader className="gap-3 border-b sm:flex sm:flex-row sm:items-center">
          <div className="flex flex-1 flex-wrap items-center gap-3">
            <Input
              className="max-w-xs"
              placeholder="Search number or customer"
              value={q}
              onChange={(event) => {
                setQ(event.target.value);
                setPage(1);
              }}
            />
            <Select
              value={customerId}
              onValueChange={(value) => {
                setCustomerId(value ?? "all");
                setPage(1);
              }}
              items={[
                { value: "all", label: "All customers" },
                ...(customers.data?.customers ?? []).map((customer) => ({
                  value: customer.id,
                  label: customer.name,
                })),
              ]}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All customers</SelectItem>
                {(customers.data?.customers ?? []).map((customer) => (
                  <SelectItem key={customer.id} value={customer.id}>
                    {customer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              aria-label="From date"
              className="w-40"
              value={from}
              onChange={(event) => {
                setFrom(event.target.value);
                setPage(1);
              }}
            />
            <Input
              type="date"
              aria-label="To date"
              className="w-40"
              value={to}
              onChange={(event) => {
                setTo(event.target.value);
                setPage(1);
              }}
            />
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value ?? "all");
                setPage(1);
              }}
              items={STATUSES}
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((entry) => (
                  <SelectItem key={entry.value} value={entry.value}>
                    {entry.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <CardTitle className="text-sm font-normal text-muted-foreground">
            {rows.length} {rows.length === 1 ? "quotation" : "quotations"}
          </CardTitle>
        </CardHeader>

        <CardContent className="px-0">
          {quotations.isPending ? (
            <p className="p-4 text-sm text-muted-foreground">Loading quotations…</p>
          ) : quotations.isError ? (
            <p className="p-4 text-sm text-destructive">{quotations.error.message}</p>
          ) : rows.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nothing here yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="hidden sm:table-cell">Date</TableHead>
                  <TableHead className="hidden md:table-cell">Valid until</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Link
                        to={`/${documentType === "invoice" ? "invoices" : documentType === "delivery_order" ? "delivery-orders" : "quotations"}/${row.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {row.number ?? "Draft"}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-56 whitespace-normal">{row.customerName}</TableCell>
                    <TableCell className="hidden sm:table-cell">{row.issueDate}</TableCell>
                    <TableCell className="hidden md:table-cell">{row.validUntil ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRinggit(row.totalSen)}
                    </TableCell>
                    <TableCell className="text-right">
                      {statusBadge(row.status, row.expired, row.paidAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>

        <div className="flex items-center justify-between border-t px-4 py-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">Page {page}</span>
          <Button
            variant="ghost"
            size="sm"
            disabled={!quotations.data?.hasMore}
            onClick={() => setPage((current) => current + 1)}
          >
            Next
          </Button>
        </div>
      </Card>
    </div>
  );
}
