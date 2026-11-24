import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/client/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import type { CreateCustomerInput } from "@/shared/customers";

import { createCustomer, listCustomers, updateCustomer } from "../api";
import { CustomerForm } from "../components/customer-form";
import { useCompany } from "../company";

export function CustomersPage() {
  const { company } = useCompany();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);

  const customers = useQuery({
    queryKey: ["customers", company.id, q, showArchived],
    queryFn: () => listCustomers(company.id, { q, includeArchived: showArchived }),
  });

  function refresh() {
    return queryClient.invalidateQueries({ queryKey: ["customers", company.id] });
  }

  const create = useMutation({
    mutationFn: (input: CreateCustomerInput) => createCustomer(company.id, input),
    onSuccess: async () => {
      await refresh();
      setCreating(false);
    },
  });

  const setArchived = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      updateCustomer(company.id, id, { isArchived: archived ? 1 : 0 }),
    onSuccess: () => refresh(),
  });

  const rows = customers.data?.customers ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
          <p className="text-sm text-muted-foreground">Buyers of {company.name}.</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          New customer
        </Button>
      </header>

      <Card>
        <CardHeader className="gap-3 border-b sm:flex sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-3">
            <Input
              className="max-w-xs"
              placeholder="Search by name"
              value={q}
              onChange={(event) => setQ(event.target.value)}
            />
            <div className="flex items-center gap-2">
              <input
                id="show-archived"
                type="checkbox"
                className="size-4 rounded border-input"
                checked={showArchived}
                onChange={(event) => setShowArchived(event.target.checked)}
              />
              <Label htmlFor="show-archived" className="text-sm font-normal">
                Show archived
              </Label>
            </div>
          </div>
          <CardTitle className="text-sm font-normal text-muted-foreground">
            {rows.length} {rows.length === 1 ? "customer" : "customers"}
          </CardTitle>
        </CardHeader>

        <CardContent className="px-0">
          {customers.isPending ? (
            <p className="p-4 text-sm text-muted-foreground">Loading customers…</p>
          ) : customers.isError ? (
            <p className="p-4 text-sm text-destructive">{customers.error.message}</p>
          ) : rows.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              {q ? "No customers match that name." : "No customers yet."}
            </p>
          ) : (
            <ul className="divide-y">
              {rows.map((customer) => (
                <li
                  key={customer.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-medium">
                      <Link
                        to={`/customers/${customer.id}`}
                        className="truncate underline-offset-4 hover:underline"
                      >
                        {customer.name}
                      </Link>
                      {customer.isArchived ? <Badge variant="secondary">archived</Badge> : null}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {[customer.contactPerson, customer.phone, customer.email]
                        .filter(Boolean)
                        .join(" · ") || "No contact details"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setArchived.mutate({ id: customer.id, archived: !customer.isArchived })
                    }
                  >
                    {customer.isArchived ? "Restore" : "Archive"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New customer</DialogTitle>
            <DialogDescription>Only a name and billing address are required.</DialogDescription>
          </DialogHeader>
          <CustomerForm
            submitting={create.isPending}
            error={create.error?.message}
            onSubmit={(input) => create.mutate(input)}
            onCancel={() => setCreating(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
