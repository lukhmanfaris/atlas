import { Outlet } from "react-router";

import { AppNav } from "./components/app-nav";
import { CompanyPicker } from "./components/company-picker";

export function App() {
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-5xl items-center justify-end px-4 py-2">
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
