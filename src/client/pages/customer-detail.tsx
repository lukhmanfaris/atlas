import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Pencil } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";

import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/client/components/ui/card";
import { Separator } from "@/client/components/ui/separator";
import type { CreateCustomerInput } from "@/shared/customers";

import { getCustomer, updateCustomer } from "../api";
import { CustomerForm } from "../components/customer-form";
import { useCompany } from "../company";

export function CustomerDetailPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const { company } = useCompany();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  const detail = useQuery({
    queryKey: ["customer", company.id, customerId],
    queryFn: () => getCustomer(company.id, customerId ?? ""),
    enabled: Boolean(customerId),
  });

  function refresh() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ["customer", company.id, customerId] }),
      queryClient.invalidateQueries({ queryKey: ["customers", company.id] }),
    ]);
  }

  const save = useMutation({
    mutationFn: (input: CreateCustomerInput) =>
      updateCustomer(company.id, customerId ?? "", input),
    onSuccess: async () => {
      await refresh();
      setEditing(false);
    },
  });

  const setArchived = useMutation({
    mutationFn: (archived: boolean) =>
      updateCustomer(company.id, customerId ?? "", { isArchived: archived ? 1 : 0 }),
    onSuccess: () => refresh(),
  });

  const customer = detail.data?.customer;

  if (detail.isPending) {
    return <p className="text-sm text-muted-foreground">Loading customer…</p>;
  }

  if (detail.isError || !customer) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">
          {detail.error?.message ?? "Customer not found."}
        </p>
        <Button variant="outline" nativeButton={false} render={<Link to="/customers" />}>
          <ArrowLeft className="size-4" />
          Back to customers
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" className="-ml-2" nativeButton={false} render={<Link to="/customers" />}>
        <ArrowLeft className="size-4" />
        Customers
      </Button>

      <Card>
        <CardHeader className="gap-3 border-b sm:flex sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="flex flex-wrap items-center gap-2 text-xl">
              {customer.name}
              {customer.isArchived ? <Badge variant="secondary">archived</Badge> : null}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {customer.registrationNo ?? "No registration number"}
            </p>
          </div>
          {editing ? null : (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="size-4" />
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setArchived.mutate(!customer.isArchived)}
              >
                {customer.isArchived ? "Restore" : "Archive"}
              </Button>
            </div>
          )}
        </CardHeader>

        <CardContent className="pt-4">
          {editing ? (
            <CustomerForm
              initial={customer}
              submitting={save.isPending}
              error={save.error?.message}
              onSubmit={(input) => save.mutate(input)}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <div className="grid gap-6 sm:grid-cols-2">
              <Section title="Contact">
                <Row label="Contact person" value={customer.contactPerson} />
                <Row label="Phone" value={customer.phone} />
                <Row label="Email" value={customer.email} />
              </Section>

              <Section title="Terms">
                <Row
                  label="Payment terms"
                  value={
                    customer.paymentTermsDays === null
                      ? "Company default"
                      : `${customer.paymentTermsDays} days`
                  }
                />
                <Row label="Notes" value={customer.notes} />
              </Section>

              <Section title="Billing address">
                <p className="whitespace-pre-line text-sm">{customer.billingAddress}</p>
              </Section>

              <Section title="Delivery address">
                <p className="whitespace-pre-line text-sm">
                  {customer.deliveryAddress ?? customer.billingAddress}
                </p>
                {customer.deliveryAddress ? null : (
                  <p className="text-xs text-muted-foreground">Same as billing address.</p>
                )}
              </Section>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <Separator />
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value ?? "—"}</span>
    </div>
  );
}
