import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import type { MeCompany, MeUser } from "@/shared/api";

import { getMe } from "./api";

const STORAGE_KEY = "atlas.companyId";

type CompanyContextValue = {
  user: MeUser;
  companies: MeCompany[];
  company: MeCompany;
  selectCompany: (companyId: string) => void;
  reload: () => Promise<unknown>;
};

const CompanyContext = createContext<CompanyContextValue | null>(null);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const me = useQuery({ queryKey: ["me"], queryFn: getMe });
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEY),
  );

  const companies = me.data?.companies ?? [];

  useEffect(() => {
    if (companies.length === 0) return;
    const exists = committeesHas(companies, selectedId);
    if (!exists) {
      const first = companies[0];
      if (first) {
        setSelectedId(first.id);
        localStorage.setItem(STORAGE_KEY, first.id);
      }
    }
  }, [companies, selectedId]);

  const value = useMemo<CompanyContextValue | null>(() => {
    const company = companies.find((entry) => entry.id === selectedId) ?? companies[0];
    if (!me.data || !company) return null;

    return {
      user: me.data.user,
      companies,
      company,
      selectCompany: (companyId: string) => {
        setSelectedId(companyId);
        localStorage.setItem(STORAGE_KEY, companyId);
      },
      reload: me.refetch,
    };
  }, [companies, me.data, me.refetch, selectedId]);

  if (me.isPending) {
    return <p className="p-8 text-slate-600">Checking who you are…</p>;
  }

  if (me.isError) {
    return <p className="p-8 text-red-700">{me.error.message}</p>;
  }

  if (!value) {
    return (
      <p className="p-8 text-slate-700">
        You are signed in as {me.data?.user.email}, but you do not belong to any company yet.
      </p>
    );
  }

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

function committeesHas(companies: MeCompany[], id: string | null): boolean {
  return id !== null && companies.some((company) => company.id === id);
}

export function useCompany(): CompanyContextValue {
  const value = useContext(CompanyContext);
  if (!value) {
    throw new Error("useCompany must be used inside CompanyProvider");
  }
  return value;
}
