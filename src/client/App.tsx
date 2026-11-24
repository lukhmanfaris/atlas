import { Link, Outlet, useLocation } from "react-router";

import { logoUrl } from "./api";
import { useCompany } from "./company";

export function App() {
  const { user, companies, company, selectCompany } = useCompany();
  const location = useLocation();
  const onCustomers = location.pathname.startsWith("/customers");
  const onSettings = location.pathname.startsWith("/settings");

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            {company.logoR2Key ? (
              <img
                src={logoUrl(company.id, 0)}
                alt={`${company.name} logo`}
                className="h-10 w-auto max-w-32 object-contain"
              />
            ) : (
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-slate-900 text-sm font-semibold text-white">
                {company.name.slice(0, 2).toUpperCase()}
              </span>
            )}
            <label className="sr-only" htmlFor="company-switcher">
              Current company
            </label>
            <select
              id="company-switcher"
              className="max-w-56 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-medium text-slate-900"
              value={company.id}
              onChange={(event) => selectCompany(event.target.value)}
            >
              {companies.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </div>

          <nav className="ml-auto flex items-center gap-3 text-sm">
            <Link
              to="/"
              className={onSettings ? "text-slate-600 hover:text-slate-900" : "font-medium text-slate-900"}
            >
              Home
            </Link>
            <Link
              to="/customers"
              className={
                onCustomers ? "font-medium text-slate-900" : "text-slate-600 hover:text-slate-900"
              }
            >
              Customers
            </Link>
            <Link
              to="/settings"
              className={onSettings ? "font-medium text-slate-900" : "text-slate-600 hover:text-slate-900"}
            >
              Settings
            </Link>
            <span className="hidden text-slate-500 sm:inline">{user.email}</span>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
