import { cn } from "@/client/lib/utils";
import type { MeCompany } from "@/shared/api";

import { logoUrl } from "../api";

export function CompanyAvatar({
  company,
  className,
}: {
  company: MeCompany;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-foreground text-xs font-semibold text-background",
        className,
      )}
    >
      {company.logoR2Key ? (
        <img
          src={logoUrl(company.id, 0)}
          alt={`${company.name} logo`}
          className="size-full object-contain p-0.5"
        />
      ) : (
        company.name.slice(0, 2).toUpperCase()
      )}
    </span>
  );
}
