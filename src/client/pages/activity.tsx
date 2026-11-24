import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

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

import { listAuditLog } from "../api";
import { SettingsTabs } from "../components/settings-tabs";
import { useCompany } from "../company";

function formatWhen(at: number): string {
  return new Date(at + 8 * 3_600_000).toISOString().slice(0, 16).replace("T", " ");
}

export function ActivityPage() {
  const { company } = useCompany();
  const [page, setPage] = useState(1);
  const isOwner = company.role === "owner";

  const entries = useQuery({
    queryKey: ["audit", company.id, page],
    queryFn: () => listAuditLog(company.id, page),
    enabled: isOwner,
  });

  return (
    <div className="space-y-6">
      <SettingsTabs />
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="text-sm text-muted-foreground">
          Everything done in {company.name}, newest first. Only owners can read this.
        </p>
      </header>

      {!isOwner ? (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            Only an owner can view the activity log.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="text-base">Audit log</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {entries.isPending ? (
              <p className="p-4 text-sm text-muted-foreground">Loading activity…</p>
            ) : entries.isError ? (
              <p className="p-4 text-sm text-destructive">{entries.error.message}</p>
            ) : (entries.data?.entries ?? []).length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Nothing recorded yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead className="hidden sm:table-cell">Who</TableHead>
                    <TableHead className="hidden md:table-cell">Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(entries.data?.entries ?? []).map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {formatWhen(entry.at)}
                      </TableCell>
                      <TableCell className="font-medium">{entry.action}</TableCell>
                      <TableCell className="hidden sm:table-cell">{entry.userEmail}</TableCell>
                      <TableCell className="hidden max-w-80 truncate md:table-cell text-muted-foreground">
                        {entry.detail ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

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
                disabled={!entries.data?.hasMore}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
