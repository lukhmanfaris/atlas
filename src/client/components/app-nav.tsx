import { FileText, Home, Receipt, Settings, Users } from "lucide-react";
import { Link, useLocation } from "react-router";

import { cn } from "@/client/lib/utils";

const ITEMS = [
  { href: "/", label: "Home", icon: Home, exact: true },
  { href: "/customers", label: "Customers", icon: Users, exact: false },
  { href: "/quotations", label: "Quotes", icon: FileText, exact: false },
  { href: "/invoices", label: "Invoices", icon: Receipt, exact: false },
  { href: "/settings", label: "Settings", icon: Settings, exact: false },
] as const;

export function AppNav() {
  const { pathname } = useLocation();

  return (
    <nav className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div className="flex items-center gap-1 rounded-full border bg-background/95 p-1.5 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80">
        {ITEMS.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                "flex min-w-16 flex-col items-center gap-0.5 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors",
                active
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
