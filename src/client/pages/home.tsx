import { useQuery } from "@tanstack/react-query";
import { FileText, Plus, Receipt, Truck } from "lucide-react";
import { Link } from "react-router";

import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/client/components/ui/card";
import { formatRinggit } from "@/shared/items";

import { getDashboard } from "../api";
import { useCompany } from "../company";

function basePath(type: "quotation" | "invoice") {
  return type === "invoice" ? "/invoices" : "/quotations";
}

export function HomePage() {
  const { company } = useCompany();
  const dashboard = useQuery({
    queryKey: ["dashboard", company.id],
    queryFn: () => getDashboard(company.id),
  });

  const drafts = dashboard.data?.drafts ?? [];
  const latest = dashboard.data?.latest ?? [];
  const awaiting = dashboard.data?.awaitingDelivery ?? [];

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

      {dashboard.isError ? (
        <p className="text-sm text-destructive">{dashboard.error.message}</p>
      ) : null}

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-base">Drafts to finish</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {drafts.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No drafts waiting.</p>
          ) : (
            <ul className="divide-y">
              {drafts.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <Link
                    to={`${basePath(row.type)}/${row.id}`}
                    className="min-w-0 truncate underline-offset-4 hover:underline"
                  >
                    <Badge variant="outline" className="mr-2 capitalize">
                      {row.type}
                    </Badge>
                    {row.customerName}
                  </Link>
                  <span className="whitespace-nowrap text-sm tabular-nums">
                    {formatRinggit(row.totalSen)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="text-base">Latest issued</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {latest.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Nothing issued yet.</p>
            ) : (
              <ul className="divide-y">
                {latest.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <Link
                      to={`${basePath(row.type)}/${row.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {row.number}
                    </Link>
                    <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                      {row.customerName}
                    </span>
                    <span className="whitespace-nowrap text-sm tabular-nums">
                      {formatRinggit(row.totalSen)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2 text-base">
              <Truck className="size-4" />
              Awaiting delivery
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {awaiting.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Every invoice is fully delivered.</p>
            ) : (
              <ul className="divide-y">
                {awaiting.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <Link
                      to={`/invoices/${row.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {row.number}
                    </Link>
                    <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                      {row.customerName}
                    </span>
                    <Badge variant="secondary">
                      {row.remainingLines} {row.remainingLines === 1 ? "line" : "lines"} left
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
