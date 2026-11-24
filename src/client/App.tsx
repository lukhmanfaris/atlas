import { useQuery } from "@tanstack/react-query";

import { meResponseSchema, type MeResponse } from "@/shared/api";

async function loadMe(): Promise<MeResponse> {
  const response = await fetch("/api/me", { headers: { Accept: "application/json" } });
  if (response.status === 401) {
    throw new Error("Not signed in. Open this app through Cloudflare Access.");
  }
  if (response.status === 403) {
    const body = (await response.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    throw new Error(body?.error?.message ?? "You do not have access to this app.");
  }
  if (!response.ok) {
    throw new Error(`The server answered with ${response.status}.`);
  }
  return meResponseSchema.parse(await response.json());
}

export function App() {
  const me = useQuery({ queryKey: ["me"], queryFn: loadMe });

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Hello</h1>
        {me.isPending ? (
          <p className="mt-3 text-slate-600">Checking who you are…</p>
        ) : me.isError ? (
          <p className="mt-3 text-red-700">{me.error.message}</p>
        ) : (
          <>
            <p className="mt-3 text-slate-700">
              Signed in as{" "}
              <span className="font-medium text-slate-900">{me.data.user.email}</span>
            </p>
            <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Companies
            </h2>
            <ul className="mt-2 divide-y divide-slate-100">
              {me.data.companies.map((company) => (
                <li key={company.id} className="flex items-center justify-between py-2">
                  <span className="text-slate-900">{company.name}</span>
                  <span className="text-sm text-slate-500">{company.role}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </main>
  );
}
