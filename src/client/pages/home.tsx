import { ArrowRight, Settings as SettingsIcon, Users } from "lucide-react";
import { Link } from "react-router";

import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import { CompanyAvatar } from "../components/company-avatar";
import { useCompany } from "../company";

export function HomePage() {
  const { company } = useCompany();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center gap-4">
          <CompanyAvatar company={company} className="size-14 rounded-2xl text-base" />
          <div className="min-w-0">
            <CardTitle className="truncate text-xl">{company.name}</CardTitle>
            <CardDescription className="capitalize">
              You are an {company.role} of this company.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Button variant="outline" className="h-auto justify-between p-3" nativeButton={false} render={<Link to="/customers" />}>
            <span className="flex items-center gap-2">
              <Users className="size-4" />
              Customers
            </span>
            <ArrowRight className="size-4" />
          </Button>
          <Button variant="outline" className="h-auto justify-between p-3" nativeButton={false} render={<Link to="/settings" />}>
            <span className="flex items-center gap-2">
              <SettingsIcon className="size-4" />
              Company settings
            </span>
            <ArrowRight className="size-4" />
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Documents</CardTitle>
          <CardDescription>
            Quotations, invoices and delivery orders arrive in the next milestone. This page becomes
            the dashboard: drafts to finish, recent documents, and invoices still to deliver.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
