import { Outlet } from "react-router";

import { AppNav } from "./components/app-nav";
import { CompanyPicker } from "./components/company-picker";
import { useCompany } from "./company";

export function App() {
  const { user } = useCompany();

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5">
          <CompanyPicker />
          <span className="ml-auto hidden truncate text-xs text-muted-foreground sm:block">
            {user.email}
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-6">
        <Outlet />
      </main>

      <AppNav />
    </div>
  );
}
