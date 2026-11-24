import { useMutation } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";

import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import { Separator } from "@/client/components/ui/separator";
import { cn } from "@/client/lib/utils";
import type { CreateCompanyInput } from "@/shared/companies";

import { createCompany } from "../api";
import { useCompany } from "../company";
import { CompanyAvatar } from "./company-avatar";
import { Field } from "./field";

const EMPTY: CreateCompanyInput = {
  name: "",
  registrationNo: "",
  addressLine1: "",
  postcode: "",
  city: "",
  state: "",
};

export function CompanyPicker() {
  const { companies, company, selectCompany, reload } = useCompany();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  function choose(companyId: string) {
    selectCompany(companyId);
    setOpen(false);
    navigate("/customers");
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        aria-label="Switch company"
        onClick={() => setOpen(true)}
        className="h-auto max-w-64 gap-1 px-1 py-1 hover:underline"
      >
        <span className="truncate text-sm font-medium">{company.name}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Switch company</DialogTitle>
            <DialogDescription>
              Each company keeps its own customers, numbering and settings.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2 sm:grid-cols-2">
            {companies.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => choose(entry.id)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-muted",
                  entry.id === company.id && "border-foreground",
                )}
              >
                {entry.logoR2Key ? <CompanyAvatar company={entry} /> : null}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{entry.name}</span>
                  <span className="text-xs capitalize text-muted-foreground">{entry.role}</span>
                </span>
                {entry.id === company.id ? <Check className="ml-auto size-4" /> : null}
              </button>
            ))}
          </div>

          <Separator />

          <Button
            type="button"
            variant="outline"
            className="justify-start"
            onClick={() => {
              setOpen(false);
              setAddOpen(true);
            }}
          >
            <Plus className="size-4" />
            Add company
          </Button>
        </DialogContent>
      </Dialog>

      <AddCompanyDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={async (companyId) => {
          await reload();
          selectCompany(companyId);
          navigate("/customers");
        }}
      />
    </>
  );
}

function AddCompanyDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (companyId: string) => Promise<void> | void;
}) {
  const [form, setForm] = useState<CreateCompanyInput>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (input: CreateCompanyInput) => createCompany(input),
    onSuccess: async (result) => {
      setForm(EMPTY);
      setError(null);
      onOpenChange(false);
      await onCreated(result.company.id);
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  });

  function set<K extends keyof CreateCompanyInput>(key: K, value: CreateCompanyInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add company</DialogTitle>
          <DialogDescription>
            You become the owner. Everything else can be filled in under Settings.
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate(form);
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company name">
              <Input
                value={form.name}
                onChange={(event) => set("name", event.target.value)}
                required
              />
            </Field>
            <Field label="Registration number">
              <Input
                value={form.registrationNo}
                onChange={(event) => set("registrationNo", event.target.value)}
                required
              />
            </Field>
            <Field label="Address line 1">
              <Input
                value={form.addressLine1}
                onChange={(event) => set("addressLine1", event.target.value)}
                required
              />
            </Field>
            <Field label="Postcode">
              <Input
                value={form.postcode}
                onChange={(event) => set("postcode", event.target.value)}
                required
              />
            </Field>
            <Field label="City">
              <Input
                value={form.city}
                onChange={(event) => set("city", event.target.value)}
                required
              />
            </Field>
            <Field label="State">
              <Input
                value={form.state}
                onChange={(event) => set("state", event.target.value)}
                required
              />
            </Field>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create company"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

