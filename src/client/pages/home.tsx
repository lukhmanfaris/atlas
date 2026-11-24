import { useQuery } from "@tanstack/react-query";
import { FileText, Plus, Receipt } from "lucide-react";
import { Link } from "react-router";

import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/client/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { formatRinggit } from "@/shared/items";

import { listQuotations } from "../api";
import { useCompany } from "../company";

export function HomePage() {
  const { company } = useCompany();

  const quotations = useQuery({
    queryKey: ["home", "quotations", company.id],
    queryFn: () => listQuotations(company.id, { type: "quotation" }),
  });
  const invoices = useQuery({
    queryKey: ["home", "invoices", company.id],
    queryFn: () => listQuotations(company.id, { type: "invoice" }),
  });

  const recent = [...(quotations.data?.documents ?? []), ...(invoices.data?.documents ?? [])]
    .filter((row) => row.status === "issued" || row.status === "accepted")
    .sort((a, b) => b.issueDate.localeCompare(a.issueDate))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="flex items-center justify-between gap-4 p-4">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-lg bg-muted">
                <FileText className="size-5" />
              </span>
              <div>
                <p className="font-medium">New quotation</p>
                <p className="text-xs text-muted-foreground">Price a job before it is confirmed.</p>
              </div>
            </div>
            <Button size="sm" nativeButton={false} render={<Link to="/quotations/new" />}>
              <Plus className="size-4" />
              Create
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center justify-between gap-4 p-4">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-lg bg-muted">
                <Receipt className="size-5" />
              </span>
              <div>
                <p className="font-medium">New invoice</p>
                <p className="text-xs text-muted-foreground">Bill a customer directly.</p>
              </div>
            </div>
            <Button size="sm" nativeButton={false} render={<Link to="/invoices/new" />}>
              <Plus className="size-4" />
              Create
            </Button>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-base">Recent</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {quotations.isError || invoices.isError ? (
            <p className="p-4 text-sm text-destructive">Could not load recent documents.</p>
          ) : recent.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              Nothing issued yet. Create a quotation or invoice to get started.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="hidden sm:table-cell">Date</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((row) => {
                  const base = row.number?.startsWith("INV") ? "/invoices" : "/quotations";
                  return (
                    <TableRow key={`${base}-${row.id}`}>
                      <TableCell>
                        <Link
                          to={`${base}/${row.id}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {row.number}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-56 whitespace-normal">{row.customerName}</TableCell>
                      <TableCell className="hidden sm:table-cell">{row.issueDate}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatRinggit(row.totalSen)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary">{row.status}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
