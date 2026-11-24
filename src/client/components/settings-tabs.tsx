import { Link, useLocation } from "react-router";

import { cn } from "@/client/lib/utils";

const TABS = [
  { href: "/settings", label: "Company" },
  { href: "/settings/items", label: "Items" },
];

export function SettingsTabs() {
  const { pathname } = useLocation();

  return (
    <nav className="flex gap-1 border-b pb-2">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          to={tab.href}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium",
            pathname === tab.href
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
