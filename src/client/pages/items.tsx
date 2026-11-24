import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import {
  ITEM_CATEGORIES,
  formatRinggit,
  type CreateItemInput,
  type ItemDto,
} from "@/shared/items";

import { ApiError, createItem, listItems, updateItem } from "../api";
import { ItemForm } from "../components/item-form";
import { SettingsTabs } from "../components/settings-tabs";
import { useCompany } from "../company";

function fieldErrorsFrom(error: unknown): Record<string, string> | undefined {
  if (!(error instanceof ApiError) || !Array.isArray(error.details)) {
    return undefined;
  }
  const result: Record<string, string> = {};
  for (const entry of error.details) {
    if (
      entry &&
      typeof entry === "object" &&
      "path" in entry &&
      "message" in entry &&
      typeof entry.path === "string" &&
      typeof entry.message === "string"
    ) {
      result[entry.path] = entry.message;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export function ItemsPage() {
  const { company } = useCompany();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<ItemDto | "new" | null>(null);

  const items = useQuery({
    queryKey: ["items", company.id, q, showArchived],
    queryFn: () => listItems(company.id, { q, includeArchived: showArchived }),
  });

  function refresh() {
    return queryClient.invalidateQueries({ queryKey: ["items", company.id] });
  }

  const save = useMutation({
    mutationFn: (input: CreateItemInput) => {
      if (editing === "new") return createItem(company.id, input);
      if (!editing) throw new Error("Nothing to save");
      return updateItem(company.id, editing.id, input);
    },
    onSuccess: async () => {
      await refresh();
      setEditing(null);
    },
  });

  const setArchived = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      updateItem(company.id, id, { isArchived: archived ? 1 : 0 }),
    onSuccess: () => refresh(),
  });

  const rows = items.data?.items ?? [];

  return (
    <div className="space-y-6">
      <SettingsTabs />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Items</h1>
          <p className="text-sm text-muted-foreground">
            The catalogue behind {company.name}'s quotations and invoices.
          </p>
        </div>
        <Button onClick={() => setEditing("new")}>
          <Plus className="size-4" />
          New item
        </Button>
      </header>

      <Card>
        <CardHeader className="gap-3 border-b sm:flex sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-3">
            <Input
              className="max-w-xs"
              placeholder="Search name or SKU"
              value={q}
              onChange={(event) => setQ(event.target.value)}
            />
            <div className="flex items-center gap-2">
              <input
                id="show-archived-items"
                type="checkbox"
                className="size-4 rounded border-input"
                checked={showArchived}
                onChange={(event) => setShowArchived(event.target.checked)}
              />
              <Label htmlFor="show-archived-items" className="text-sm font-normal">
                Show archived
              </Label>
            </div>
          </div>
          <CardTitle className="text-sm font-normal text-muted-foreground">
            {rows.length} {rows.length === 1 ? "item" : "items"}
          </CardTitle>
        </CardHeader>

        <CardContent className="px-0">
          {items.isPending ? (
            <p className="p-4 text-sm text-muted-foreground">Loading items…</p>
          ) : items.isError ? (
            <p className="p-4 text-sm text-destructive">{items.error.message}</p>
          ) : rows.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              {q ? "No items match that search." : "No items yet."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="hidden sm:table-cell">Unit</TableHead>
                  <TableHead className="text-right">Unit price</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="max-w-80 whitespace-normal">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{item.name}</span>
                        {item.isArchived ? <Badge variant="secondary">archived</Badge> : null}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {item.sku ?? "No SKU"}
                        {item.category
                          ? ` · ${ITEM_CATEGORIES.find((entry) => entry.value === item.category)?.label ?? item.category}`
                          : ""}
                        {item.description ? ` · ${item.description}` : ""}
                      </span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{item.unit}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRinggit(item.unitPriceSen)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setEditing(item)}>
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setArchived.mutate({ id: item.id, archived: !item.isArchived })
                          }
                        >
                          {item.isArchived ? "Restore" : "Archive"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "New item" : "Edit item"}</DialogTitle>
            <DialogDescription>
              Prices are stored in exact sen; 12.50 stays 12.50.
            </DialogDescription>
          </DialogHeader>
          <ItemForm
            key={editing === "new" ? "new" : (editing?.id ?? "none")}
            initial={editing && editing !== "new" ? editing : undefined}
            submitting={save.isPending}
            error={save.error?.message}
            fieldErrors={fieldErrorsFrom(save.error)}
            onSubmit={(input) => save.mutate(input)}
            onCancel={() => setEditing(null)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
