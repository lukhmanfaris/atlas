import { Link, Outlet } from "react-router";

import { AppNav } from "./components/app-nav";
import { CompanyPicker } from "./components/company-picker";

export function App() {
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-2">
          <Link to="/" className="flex shrink-0 items-center">
            <img src="/atlas-logo.svg" alt="Atlas" className="h-6 w-auto sm:h-7" />
          </Link>
          <CompanyPicker />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-6">
        <Outlet />
      </main>

      <AppNav />
    </div>
  );
}
